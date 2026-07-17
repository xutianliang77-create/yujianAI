import { Buffer } from "node:buffer";
import type {
  IdentityAdapter,
  KmsAdapter,
  LogExportAdapter,
  ObjectStorageAdapter,
  SecretEnvelope,
} from "./index.js";

export interface HttpAdapterOptions {
  endpoint: string;
  credential: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class PlatformAdapterHttpError extends Error {
  constructor(message: string, readonly statusCode?: number) { super(message); this.name = "PlatformAdapterHttpError"; }
}

function endpointFor(options: HttpAdapterOptions): URL {
  const endpoint = new URL(options.endpoint);
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "127.0.0.1" && endpoint.hostname !== "localhost") throw new TypeError("adapter endpoint must use HTTPS outside loopback");
  if (options.credential.length < 32) throw new TypeError("adapter credential is too short");
  return endpoint;
}

function base64(value: Uint8Array): string { return Buffer.from(value).toString("base64"); }
function bytes(value: unknown, field: string): Uint8Array {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) {
    throw new PlatformAdapterHttpError(`adapter response ${field} is invalid`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) throw new PlatformAdapterHttpError(`adapter response ${field} is not canonical base64`);
  return decoded;
}

function objectKey(value: string): string {
  if (value.length === 0 || value.length > 1_024 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value) || value.split("/").includes("..")) {
    throw new TypeError("object key is invalid");
  }
  return value;
}

function requiredResponseText(value: unknown, field: string, max = 2_048): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new PlatformAdapterHttpError(`adapter response ${field} is invalid`);
  }
  return value;
}

class HttpAdapterClient {
  private readonly endpoint: URL;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: HttpAdapterOptions) {
    this.endpoint = endpointFor(options);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 120_000) throw new RangeError("adapter timeout must be 100-120000ms");
  }

  async post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(new URL(path, this.endpoint), {
      method: "POST",
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { accept: "application/json", "content-type": "application/json", "x-yujian-adapter-token": this.options.credential },
    }).catch((error) => { throw new PlatformAdapterHttpError(error instanceof Error ? error.message : "adapter request failed"); });
    const text = await response.text();
    if (!response.ok) throw new PlatformAdapterHttpError(`adapter returned HTTP ${response.status}`, response.status);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new PlatformAdapterHttpError("adapter response is not JSON", response.status); }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new PlatformAdapterHttpError("adapter response must be an object", response.status);
    return parsed as Record<string, unknown>;
  }
}

export class HttpKmsAdapter implements KmsAdapter {
  private readonly client: HttpAdapterClient;
  constructor(options: HttpAdapterOptions) { this.client = new HttpAdapterClient(options); }

  async encrypt(plaintext: Uint8Array, context: Readonly<Record<string, string>>): Promise<SecretEnvelope> {
    const response = await this.client.post("/v1/encrypt", { plaintext: base64(plaintext), context });
    const algorithm = response.algorithm;
    if (algorithm !== "AES-256-GCM" && algorithm !== "SM4-GCM") throw new PlatformAdapterHttpError("adapter response algorithm is unsupported");
    return {
      ciphertext: bytes(response.ciphertext, "ciphertext"),
      iv: bytes(response.iv, "iv"),
      authTag: bytes(response.authTag, "authTag"),
      keyVersion: requiredResponseText(response.keyVersion, "keyVersion", 128),
      algorithm,
    };
  }

  async decrypt(envelope: SecretEnvelope, context: Readonly<Record<string, string>>): Promise<Uint8Array> {
    const response = await this.client.post("/v1/decrypt", { envelope: { ciphertext: base64(envelope.ciphertext), iv: base64(envelope.iv), authTag: base64(envelope.authTag), keyVersion: envelope.keyVersion, algorithm: envelope.algorithm }, context });
    return bytes(response.plaintext, "plaintext");
  }
}

export class HttpObjectStorageAdapter implements ObjectStorageAdapter {
  private readonly client: HttpAdapterClient;
  constructor(options: HttpAdapterOptions) { this.client = new HttpAdapterClient(options); }

  async put(key: string, body: AsyncIterable<Uint8Array>, contentType: string): Promise<{ uri: string; etag: string }> {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of body) {
      size += chunk.byteLength;
      if (size > 64 * 1024 * 1024) throw new PlatformAdapterHttpError("object exceeds 64 MiB adapter limit");
      chunks.push(chunk);
    }
    const result = await this.client.post("/v1/objects/put", { key: objectKey(key), contentType: requiredResponseText(contentType, "contentType", 256), body: base64(Buffer.concat(chunks)) });
    return { uri: requiredResponseText(result.uri, "uri"), etag: requiredResponseText(result.etag, "etag", 256) };
  }

  async delete(key: string): Promise<void> { await this.client.post("/v1/objects/delete", { key: objectKey(key) }); }

  async signedReadUrl(key: string, expiresInSeconds: number): Promise<string> {
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 86_400) throw new RangeError("signed URL expiry must be 1-86400 seconds");
    const result = await this.client.post("/v1/objects/sign-read", { key: objectKey(key), expiresInSeconds });
    return requiredResponseText(result.url, "url", 4_096);
  }
}

export class HttpIdentityAdapter implements IdentityAdapter {
  private readonly client: HttpAdapterClient;
  constructor(options: HttpAdapterOptions) { this.client = new HttpAdapterClient(options); }
  async validateAccessToken(token: string): Promise<{ subject: string; tenantId?: string; roles: readonly string[] }> {
    if (token.length === 0 || token.length > 16_384) throw new PlatformAdapterHttpError("identity token is invalid");
    const result = await this.client.post("/v1/introspect", { token });
    const roles = Array.isArray(result.roles) ? result.roles.filter((value): value is string => typeof value === "string").slice(0, 64) : [];
    const subject = requiredResponseText(result.subject, "subject", 256);
    const tenantId = result.tenantId === undefined ? undefined : requiredResponseText(result.tenantId, "tenantId", 128);
    return { subject, ...(tenantId === undefined ? {} : { tenantId }), roles: [...new Set(roles)] };
  }
}

export class HttpLogExportAdapter implements LogExportAdapter {
  private readonly client: HttpAdapterClient;
  constructor(options: HttpAdapterOptions) { this.client = new HttpAdapterClient(options); }
  async exportBundle(scope: { tenantId: string; projectId?: string; environmentId?: string }, expiresInSeconds: number): Promise<{ uri: string; expiresAt: string }> {
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 86_400) throw new RangeError("log export expiry must be 60-86400 seconds");
    const result = await this.client.post("/v1/logs/export", { scope, expiresInSeconds });
    const expiresAt = requiredResponseText(result.expiresAt, "expiresAt", 64);
    if (!Number.isFinite(Date.parse(expiresAt))) throw new PlatformAdapterHttpError("adapter response expiresAt is invalid");
    return { uri: requiredResponseText(result.uri, "uri"), expiresAt };
  }
}
