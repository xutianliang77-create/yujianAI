import { createPublicKey, verify, type KeyObject } from "node:crypto";
import type { IdentityAdapter } from "./index.js";

export interface SamlGatewayIdentityOptions {
  endpoint: string;
  audience: string;
  gatewayPublicKeyPem: string;
  credential: string;
  clockSkewSeconds?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface SamlGatewayReceipt {
  issuer: string;
  audience: string;
  subject: string;
  tenantId?: string;
  roles: readonly string[];
  assertionDigest: string;
  issuedAt: string;
  expiresAt: string;
}

function requiredText(value: unknown, field: string, max = 256): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`SAML gateway ${field} is invalid`);
  }
  return value;
}

function canonical(receipt: SamlGatewayReceipt): Buffer {
  return Buffer.from(JSON.stringify({
    assertionDigest: receipt.assertionDigest,
    audience: receipt.audience,
    expiresAt: receipt.expiresAt,
    issuedAt: receipt.issuedAt,
    issuer: receipt.issuer,
    roles: [...receipt.roles],
    subject: receipt.subject,
    ...(receipt.tenantId === undefined ? {} : { tenantId: receipt.tenantId }),
  }), "utf8");
}

function endpoint(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new TypeError("SAML gateway endpoint must use HTTPS outside loopback");
  }
  return url;
}

/**
 * Exchanges a raw SAML response with a deployment-owned XML-DSig gateway and
 * verifies the gateway's detached Ed25519 attestation before trusting claims.
 */
export class SamlGatewayIdentityAdapter implements IdentityAdapter {
  private readonly endpoint: URL;
  private readonly publicKey: KeyObject;
  private readonly fetchImpl: typeof fetch;
  private readonly skewMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: SamlGatewayIdentityOptions) {
    this.endpoint = endpoint(options.endpoint);
    if (options.audience.length === 0 || options.audience.length > 256) throw new TypeError("SAML audience is invalid");
    if (options.credential.length < 32) throw new TypeError("SAML gateway credential is too short");
    this.publicKey = createPublicKey(options.gatewayPublicKeyPem);
    if (this.publicKey.asymmetricKeyType !== "ed25519") throw new TypeError("SAML gateway key must be Ed25519");
    const skew = options.clockSkewSeconds ?? 30;
    if (!Number.isInteger(skew) || skew < 0 || skew > 300) throw new RangeError("SAML clock skew is invalid");
    this.skewMs = skew * 1_000;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 120_000) throw new RangeError("SAML timeout is invalid");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async validateAccessToken(samlResponse: string): Promise<{ subject: string; tenantId?: string; roles: readonly string[] }> {
    if (samlResponse.length === 0 || samlResponse.length > 1_048_576) throw new Error("SAML response is invalid");
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      body: JSON.stringify({ audience: this.options.audience, samlResponse }),
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { accept: "application/json", "content-type": "application/json", "x-yujian-adapter-token": this.options.credential },
    });
    if (!response.ok) throw new Error(`SAML gateway returned HTTP ${response.status}`);
    const document = await response.json() as Record<string, unknown>;
    const rawReceipt = document.receipt;
    if (typeof rawReceipt !== "object" || rawReceipt === null || Array.isArray(rawReceipt)) throw new Error("SAML gateway receipt is invalid");
    const value = rawReceipt as Record<string, unknown>;
    const roles = Array.isArray(value.roles) ? value.roles.map((role) => requiredText(role, "role", 128)) : [];
    if (roles.length > 64 || new Set(roles).size !== roles.length) throw new Error("SAML gateway roles are invalid");
    const receipt: SamlGatewayReceipt = {
      issuer: requiredText(value.issuer, "issuer", 2_048), audience: requiredText(value.audience, "audience"),
      subject: requiredText(value.subject, "subject"), roles,
      assertionDigest: requiredText(value.assertionDigest, "assertionDigest", 71),
      issuedAt: requiredText(value.issuedAt, "issuedAt", 64), expiresAt: requiredText(value.expiresAt, "expiresAt", 64),
      ...(value.tenantId === undefined ? {} : { tenantId: requiredText(value.tenantId, "tenantId", 128) }),
    };
    if (receipt.audience !== this.options.audience || !/^sha256:[0-9a-f]{64}$/u.test(receipt.assertionDigest)) throw new Error("SAML gateway attestation scope is invalid");
    const issuedAt = Date.parse(receipt.issuedAt); const expiresAt = Date.parse(receipt.expiresAt); const now = Date.now();
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt - this.skewMs > now || expiresAt + this.skewMs < now || expiresAt <= issuedAt) throw new Error("SAML gateway attestation time is invalid");
    const signature = typeof document.signatureBase64Url === "string" ? Buffer.from(document.signatureBase64Url, "base64url") : Buffer.alloc(0);
    if (signature.length !== 64 || !verify(null, canonical(receipt), this.publicKey, signature)) throw new Error("SAML gateway attestation signature is invalid");
    return { subject: receipt.subject, ...(receipt.tenantId === undefined ? {} : { tenantId: receipt.tenantId }), roles };
  }
}
