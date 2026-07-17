import type { EgressJobV1, IngressJobV1, SipCallV1 } from "@yujian/platform-contracts";

export interface PlatformMediaOps {
  createIngress(environmentId: string, body: Record<string, unknown>, idempotencyKey: string): Promise<IngressJobV1>;
  createEgress(environmentId: string, body: Record<string, unknown>, idempotencyKey: string): Promise<EgressJobV1>;
  requestSipCall(environmentId: string, body: Record<string, unknown>, idempotencyKey: string): Promise<SipCallV1>;
  transferSipCall(environmentId: string, callId: string, body: Record<string, unknown>, idempotencyKey: string): Promise<SipCallV1>;
  hangupSipCall(environmentId: string, callId: string, idempotencyKey: string): Promise<SipCallV1>;
  listIngress(environmentId: string): Promise<readonly IngressJobV1[]>;
  getIngress(environmentId: string, ingressId: string): Promise<IngressJobV1>;
  listEgress(environmentId: string): Promise<readonly EgressJobV1[]>;
  getEgress(environmentId: string, egressId: string): Promise<EgressJobV1>;
  listSipCalls(environmentId: string): Promise<readonly SipCallV1[]>;
  getSipCall(environmentId: string, callId: string): Promise<SipCallV1>;
}

export class MediaOpsUnavailableError extends Error {
  constructor(message = "media-ops is not configured") {
    super(message);
    this.name = "MediaOpsUnavailableError";
  }
}

export class MediaOpsRequestError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = "MediaOpsRequestError";
  }
}

export class DisabledMediaOps implements PlatformMediaOps {
  async createIngress(_environmentId: string, _body: Record<string, unknown>, _idempotencyKey: string): Promise<IngressJobV1> { throw new MediaOpsUnavailableError(); }
  async createEgress(_environmentId: string, _body: Record<string, unknown>, _idempotencyKey: string): Promise<EgressJobV1> { throw new MediaOpsUnavailableError(); }
  async requestSipCall(_environmentId: string, _body: Record<string, unknown>, _idempotencyKey: string): Promise<SipCallV1> { throw new MediaOpsUnavailableError(); }
  async transferSipCall(_environmentId: string, _callId: string, _body: Record<string, unknown>, _idempotencyKey: string): Promise<SipCallV1> { throw new MediaOpsUnavailableError(); }
  async hangupSipCall(_environmentId: string, _callId: string, _idempotencyKey: string): Promise<SipCallV1> { throw new MediaOpsUnavailableError(); }
  async listIngress(): Promise<readonly IngressJobV1[]> { throw new MediaOpsUnavailableError(); }
  async getIngress(): Promise<IngressJobV1> { throw new MediaOpsUnavailableError(); }
  async listEgress(): Promise<readonly EgressJobV1[]> { throw new MediaOpsUnavailableError(); }
  async getEgress(): Promise<EgressJobV1> { throw new MediaOpsUnavailableError(); }
  async listSipCalls(): Promise<readonly SipCallV1[]> { throw new MediaOpsUnavailableError(); }
  async getSipCall(): Promise<SipCallV1> { throw new MediaOpsUnavailableError(); }
}

export interface MediaOpsClientOptions {
  baseUrl: string;
  credential: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class HttpMediaOpsClient implements PlatformMediaOps {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: MediaOpsClientOptions) {
    const url = new URL(options.baseUrl);
    if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new TypeError("media-ops URL must use HTTPS outside loopback");
    if (options.credential.length < 32) throw new TypeError("media-ops credential is too short");
    this.baseUrl = options.baseUrl.replace(/\/$/u, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 120_000) throw new RangeError("media-ops timeout must be 100-120000ms");
  }

  createIngress(environmentId: string, body: Record<string, unknown>, idempotencyKey: string): Promise<IngressJobV1> {
    return this.post(`/internal/v1/environments/${encodeURIComponent(environmentId)}/media/ingress`, body, idempotencyKey) as Promise<IngressJobV1>;
  }

  createEgress(environmentId: string, body: Record<string, unknown>, idempotencyKey: string): Promise<EgressJobV1> {
    return this.post(`/internal/v1/environments/${encodeURIComponent(environmentId)}/media/egress`, body, idempotencyKey) as Promise<EgressJobV1>;
  }

  requestSipCall(environmentId: string, body: Record<string, unknown>, idempotencyKey: string): Promise<SipCallV1> {
    return this.post(`/internal/v1/environments/${encodeURIComponent(environmentId)}/media/sip/calls`, body, idempotencyKey) as Promise<SipCallV1>;
  }

  transferSipCall(environmentId: string, callId: string, body: Record<string, unknown>, idempotencyKey: string): Promise<SipCallV1> {
    return this.post(`/internal/v1/environments/${encodeURIComponent(environmentId)}/media/sip/calls/${encodeURIComponent(callId)}:transfer`, body, idempotencyKey) as Promise<SipCallV1>;
  }

  hangupSipCall(environmentId: string, callId: string, idempotencyKey: string): Promise<SipCallV1> {
    return this.post(`/internal/v1/environments/${encodeURIComponent(environmentId)}/media/sip/calls/${encodeURIComponent(callId)}:hangup`, {}, idempotencyKey) as Promise<SipCallV1>;
  }

  listIngress(environmentId: string): Promise<readonly IngressJobV1[]> {
    return this.get(`/internal/v1/environments/${encodeURIComponent(environmentId)}/media/ingress`) as Promise<readonly IngressJobV1[]>;
  }

  getIngress(environmentId: string, ingressId: string): Promise<IngressJobV1> {
    return this.get(`/internal/v1/environments/${encodeURIComponent(environmentId)}/media/ingress/${encodeURIComponent(ingressId)}`) as Promise<IngressJobV1>;
  }

  listEgress(environmentId: string): Promise<readonly EgressJobV1[]> {
    return this.get(`/internal/v1/environments/${encodeURIComponent(environmentId)}/media/egress`) as Promise<readonly EgressJobV1[]>;
  }

  getEgress(environmentId: string, egressId: string): Promise<EgressJobV1> {
    return this.get(`/internal/v1/environments/${encodeURIComponent(environmentId)}/media/egress/${encodeURIComponent(egressId)}`) as Promise<EgressJobV1>;
  }

  listSipCalls(environmentId: string): Promise<readonly SipCallV1[]> {
    return this.get(`/internal/v1/environments/${encodeURIComponent(environmentId)}/media/sip/calls`) as Promise<readonly SipCallV1[]>;
  }

  getSipCall(environmentId: string, callId: string): Promise<SipCallV1> {
    return this.get(`/internal/v1/environments/${encodeURIComponent(environmentId)}/media/sip/calls/${encodeURIComponent(callId)}`) as Promise<SipCallV1>;
  }

  private async post(path: string, body: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        "x-yujian-internal-token": this.options.credential,
      },
    }).catch((error) => {
      throw new MediaOpsUnavailableError(error instanceof Error ? error.message : "media-ops request failed");
    });
    const text = await response.text();
    let parsed: unknown;
    try { parsed = text.length === 0 ? undefined : JSON.parse(text); } catch { throw new MediaOpsUnavailableError("media-ops returned invalid JSON"); }
    return this.unwrap(response.ok, response.status, parsed);
  }

  private async get(path: string): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "GET",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { accept: "application/json", "x-yujian-internal-token": this.options.credential },
    }).catch((error) => {
      throw new MediaOpsUnavailableError(error instanceof Error ? error.message : "media-ops request failed");
    });
    const text = await response.text();
    let parsed: unknown;
    try { parsed = text.length === 0 ? undefined : JSON.parse(text); } catch { throw new MediaOpsUnavailableError("media-ops returned invalid JSON"); }
    return this.unwrap(response.ok, response.status, parsed);
  }

  private unwrap(ok: boolean, status: number, parsed: unknown): unknown {
    if (!ok) {
      const message = typeof parsed === "object" && parsed !== null && "error" in parsed && typeof parsed.error === "string"
        ? parsed.error
        : `media-ops returned HTTP ${status}`;
      throw new MediaOpsRequestError(status, message);
    }
    if (typeof parsed !== "object" || parsed === null || !("data" in parsed)) throw new MediaOpsUnavailableError("media-ops response has no data");
    return parsed.data;
  }
}
