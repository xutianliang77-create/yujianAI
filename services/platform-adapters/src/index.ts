import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface SecretEnvelope {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
  keyVersion: string;
  algorithm: "AES-256-GCM" | "SM4-GCM";
}

export interface KmsAdapter {
  encrypt(plaintext: Uint8Array, context: Readonly<Record<string, string>>): Promise<SecretEnvelope>;
  decrypt(envelope: SecretEnvelope, context: Readonly<Record<string, string>>): Promise<Uint8Array>;
}

/** Development-only envelope implementation; production must delegate key custody to KMS. */
export class LocalEnvelopeKmsAdapter implements KmsAdapter {
  constructor(private readonly key: Uint8Array, private readonly keyVersion = "local-dev") {
    if (key.length !== 32) throw new TypeError("AES-256 key must be 32 bytes");
  }

  async encrypt(plaintext: Uint8Array, _context: Readonly<Record<string, string>>): Promise<SecretEnvelope> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: this.keyVersion, algorithm: "AES-256-GCM" };
  }

  async decrypt(envelope: SecretEnvelope, _context: Readonly<Record<string, string>>): Promise<Uint8Array> {
    if (envelope.keyVersion !== this.keyVersion || envelope.algorithm !== "AES-256-GCM") throw new Error("unsupported envelope key version");
    const decipher = createDecipheriv("aes-256-gcm", this.key, envelope.iv);
    decipher.setAuthTag(envelope.authTag);
    return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]);
  }
}

export interface ObjectStorageAdapter {
  put(key: string, body: AsyncIterable<Uint8Array>, contentType: string): Promise<{ uri: string; etag: string }>;
  delete(key: string): Promise<void>;
  signedReadUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export interface IdentityAdapter {
  validateAccessToken(token: string): Promise<{ subject: string; tenantId?: string; roles: readonly string[] }>;
}

export type EnterpriseIdentityProtocol = "oidc" | "saml";

export interface EnterpriseIdentityConfig {
  tenantId: string;
  protocol: EnterpriseIdentityProtocol;
  issuerOrMetadataUrl: string;
  clientId?: string;
  certificateFingerprint?: string;
  allowedDomains: readonly string[];
}

export interface DirectorySyncAdapter {
  syncMembers(tenantId: string, cursor?: string): Promise<{ added: number; updated: number; removed: number; nextCursor?: string }>;
}

export interface LogExportAdapter {
  exportBundle(scope: { tenantId: string; projectId?: string; environmentId?: string }, expiresInSeconds: number): Promise<{ uri: string; expiresAt: string }>;
}

export {
  HttpIdentityAdapter,
  HttpKmsAdapter,
  HttpLogExportAdapter,
  HttpObjectStorageAdapter,
  PlatformAdapterHttpError,
} from "./http-adapters.js";
export type { HttpAdapterOptions } from "./http-adapters.js";
export { OidcIdentityAdapter, OidcPlatformIdentityBridge } from "./oidc-identity.js";
export type { OidcIdentityOptions, OidcPlatformScope, OidcPlatformScopeResolver } from "./oidc-identity.js";
