export type RestrictedClientRuntime = "harmonyos-webview" | "wechat-mini-program";

export interface RestrictedJoinRequest {
  tenantId: string;
  projectId: string;
  environmentId: string;
  roomName: string;
  participantIdentity: string;
  participantName?: string;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
}

export interface RestrictedJoinCredential {
  token: string;
  url: string;
  expiresAt: string;
  nodeId: string;
}

export interface RestrictedRtcBridge {
  capability(): Promise<{ join: boolean; publishAudio: boolean; publishVideo: boolean; subscribe: boolean; data: boolean }>;
  connect(credential: RestrictedJoinCredential): Promise<void>;
  disconnect(): Promise<void>;
  publishData?(payload: Uint8Array, reliable: boolean): Promise<void>;
}

export interface RestrictedClientOptions {
  runtime: RestrictedClientRuntime;
  platformBaseUrl: string;
  credentialProvider: () => Promise<{ bearerToken: string; expiresAt: string }>;
  rtcBridge: RestrictedRtcBridge;
  fetchImpl?: typeof fetch;
}

function baseUrl(value: string): URL {
  const url = new URL(value);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.protocol !== "https:" && !loopback) throw new TypeError("restricted client platform URL must use HTTPS outside loopback");
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") throw new TypeError("restricted client platform URL is invalid");
  return url;
}

function id(value: string, field: string): string {
  if (!/^[a-z][a-z0-9-]{2,63}$/u.test(value)) throw new TypeError(`${field} is invalid`);
  return value;
}

function text(value: unknown, field: string, max = 256): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`join response ${field} is invalid`);
  return value;
}

/** Control-plane-only adapter; native bridge owns media and must use official LiveKit-compatible signaling. */
export class RestrictedPlatformClient {
  private readonly platformBaseUrl: URL;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: RestrictedClientOptions) {
    this.platformBaseUrl = baseUrl(options.platformBaseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async join(request: RestrictedJoinRequest): Promise<RestrictedJoinCredential> {
    id(request.tenantId, "tenantId"); id(request.projectId, "projectId"); id(request.environmentId, "environmentId");
    text(request.roomName, "roomName", 128); text(request.participantIdentity, "participantIdentity", 128);
    if (request.participantName !== undefined) text(request.participantName, "participantName", 128);
    const capabilities = await this.options.rtcBridge.capability();
    if (!capabilities.join || (request.canPublish && !capabilities.publishAudio && !capabilities.publishVideo) || (request.canSubscribe && !capabilities.subscribe) || (request.canPublishData && !capabilities.data)) {
      throw new Error(`requested RTC capability is unavailable on ${this.options.runtime}`);
    }
    const lease = await this.options.credentialProvider();
    if (!Number.isFinite(Date.parse(lease.expiresAt)) || Date.parse(lease.expiresAt) <= Date.now() || lease.bearerToken.length < 16) throw new Error("platform credential lease is invalid");
    const response = await this.fetchImpl(new URL("/platform/v1/rtc/token", this.platformBaseUrl), {
      method: "POST", signal: AbortSignal.timeout(10_000),
      headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${lease.bearerToken}` },
      body: JSON.stringify({
        tenantId: request.tenantId, projectId: request.projectId, environmentId: request.environmentId,
        roomName: request.roomName, participantIdentity: request.participantIdentity,
        ...(request.participantName === undefined ? {} : { participantName: request.participantName }),
        permissions: { canPublish: request.canPublish, canSubscribe: request.canSubscribe, canPublishData: request.canPublishData }, ttlSeconds: 300,
      }),
    });
    if (!response.ok) throw new Error(`platform token endpoint returned HTTP ${response.status}`);
    const envelope = await response.json() as Record<string, unknown>;
    if (typeof envelope.data !== "object" || envelope.data === null || Array.isArray(envelope.data)) throw new Error("platform token envelope is invalid");
    const data = envelope.data as Record<string, unknown>;
    const credential = { token: text(data.token, "token", 16_384), url: text(data.url, "url", 2_048), expiresAt: text(data.expiresAt, "expiresAt", 64), nodeId: text(data.nodeId, "nodeId", 128) };
    const url = new URL(credential.url);
    if (url.protocol !== "wss:" || !Number.isFinite(Date.parse(credential.expiresAt)) || Date.parse(credential.expiresAt) <= Date.now()) throw new Error("platform returned an unsafe RTC endpoint or expired token");
    await this.options.rtcBridge.connect(credential);
    return credential;
  }

  async disconnect(): Promise<void> { await this.options.rtcBridge.disconnect(); }
}
