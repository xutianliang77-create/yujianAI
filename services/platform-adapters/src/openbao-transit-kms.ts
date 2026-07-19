import type { KmsAdapter, SecretEnvelope } from "./index.js";

export interface OpenBaoCredentialLease { token: string; expiresAt: string; }
export interface OpenBaoTransitKmsOptions {
  endpoint: string;
  mount: string;
  keyName: string;
  credentialProvider: () => Promise<OpenBaoCredentialLease>;
  namespace?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function safeName(value: string, field: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value)) throw new TypeError(`OpenBao ${field} is invalid`);
  return value;
}

function endpoint(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new TypeError("OpenBao endpoint must use HTTPS outside loopback");
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") throw new TypeError("OpenBao endpoint is invalid");
  return url;
}

function canonicalContext(context: Readonly<Record<string, string>>): string {
  const entries = Object.entries(context).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0 || entries.length > 32 || entries.some(([key, value]) => key.length === 0 || key.length > 128 || value.length === 0 || value.length > 512 || /[\u0000-\u001f\u007f]/u.test(`${key}${value}`))) {
    throw new TypeError("OpenBao encryption context is invalid");
  }
  return Buffer.from(JSON.stringify(Object.fromEntries(entries)), "utf8").toString("base64");
}

/** OpenBao Transit adapter using a derived key so tenant context is cryptographically bound. */
export class OpenBaoTransitKmsAdapter implements KmsAdapter {
  private readonly endpoint: URL;
  private readonly mount: string;
  private readonly keyName: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenBaoTransitKmsOptions) {
    this.endpoint = endpoint(options.endpoint);
    this.mount = safeName(options.mount, "mount");
    this.keyName = safeName(options.keyName, "key name");
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 120_000) throw new RangeError("OpenBao timeout is invalid");
    if (options.namespace !== undefined) safeName(options.namespace, "namespace");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async encrypt(plaintext: Uint8Array, context: Readonly<Record<string, string>>): Promise<SecretEnvelope> {
    if (plaintext.byteLength === 0 || plaintext.byteLength > 1_048_576) throw new TypeError("OpenBao plaintext is invalid");
    const data = await this.post("encrypt", { plaintext: Buffer.from(plaintext).toString("base64"), context: canonicalContext(context) });
    const ciphertext = data.ciphertext;
    if (typeof ciphertext !== "string" || !/^vault:v[1-9][0-9]*:[A-Za-z0-9+/=]+$/u.test(ciphertext)) throw new Error("OpenBao ciphertext is invalid");
    const version = ciphertext.slice("vault:".length, ciphertext.indexOf(":", "vault:".length));
    return { ciphertext: Buffer.from(ciphertext, "utf8"), iv: new Uint8Array(), authTag: new Uint8Array(), keyVersion: version, algorithm: "AES-256-GCM" };
  }

  async decrypt(envelope: SecretEnvelope, context: Readonly<Record<string, string>>): Promise<Uint8Array> {
    if (envelope.algorithm !== "AES-256-GCM" || envelope.iv.byteLength !== 0 || envelope.authTag.byteLength !== 0) throw new TypeError("OpenBao envelope is invalid");
    const ciphertext = Buffer.from(envelope.ciphertext).toString("utf8");
    if (!/^vault:v[1-9][0-9]*:[A-Za-z0-9+/=]+$/u.test(ciphertext) || !ciphertext.startsWith(`vault:${envelope.keyVersion}:`)) throw new TypeError("OpenBao ciphertext version is invalid");
    const data = await this.post("decrypt", { ciphertext, context: canonicalContext(context) });
    if (typeof data.plaintext !== "string" || data.plaintext.length === 0 || data.plaintext.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(data.plaintext)) throw new Error("OpenBao plaintext response is invalid");
    const decoded = Buffer.from(data.plaintext, "base64");
    if (decoded.toString("base64") !== data.plaintext) throw new Error("OpenBao plaintext response is not canonical base64");
    return decoded;
  }

  private async post(operation: "encrypt" | "decrypt", body: unknown): Promise<Record<string, unknown>> {
    const lease = await this.options.credentialProvider();
    if (lease.token.length < 16 || !Number.isFinite(Date.parse(lease.expiresAt)) || Date.parse(lease.expiresAt) <= Date.now()) throw new Error("OpenBao credential lease is invalid");
    const url = new URL(`/v1/${this.mount}/${operation}/${this.keyName}`, this.endpoint);
    const response = await this.fetchImpl(url, {
      method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(this.timeoutMs),
      headers: { accept: "application/json", "content-type": "application/json", "x-vault-token": lease.token, ...(this.options.namespace === undefined ? {} : { "x-vault-namespace": this.options.namespace }) },
    });
    if (!response.ok) throw new Error(`OpenBao transit returned HTTP ${response.status}`);
    const payload = await response.json() as Record<string, unknown>;
    if (typeof payload.data !== "object" || payload.data === null || Array.isArray(payload.data)) throw new Error("OpenBao transit response is invalid");
    return payload.data as Record<string, unknown>;
  }
}
