import { createPublicKey, verify as verifySignature, type JsonWebKey, type KeyObject } from "node:crypto";
import type { PlatformRoleV1 } from "@yujian/platform-contracts";
import type { IdentityAdapter } from "./index.js";

export interface OidcIdentityOptions {
  issuer: string;
  audience: string;
  jwksUri?: string;
  rolesClaims?: readonly string[];
  tenantClaim?: string;
  clockSkewSeconds?: number;
  jwksTtlMs?: number;
  fetchImpl?: typeof fetch;
}

export interface OidcPlatformScope {
  tenantId: string;
  projectId: string;
  environmentId: string;
  roles?: readonly PlatformRoleV1[];
  scopes?: readonly string[];
}

export interface OidcPlatformScopeResolver {
  resolve(identity: { subject: string; tenantId?: string; roles: readonly string[] }, request: unknown): Promise<OidcPlatformScope | undefined>;
}

type JsonRecord = Record<string, unknown>;

function decodeJson(value: string, field: string): JsonRecord {
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }
  catch { throw new Error(`OIDC ${field} is not valid JSON`); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`OIDC ${field} must be an object`);
  return parsed as JsonRecord;
}

function requiredHttps(value: string, field: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new TypeError(`${field} must use HTTPS outside loopback`);
  return url;
}

function audienceMatches(value: unknown, expected: string): boolean {
  return typeof value === "string" ? value === expected : Array.isArray(value) && value.includes(expected);
}

function rolesFromClaims(claims: JsonRecord, names: readonly string[]): string[] {
  const roles: string[] = [];
  for (const name of names) {
    const value = name.split(".").reduce<unknown>((current, part) => typeof current === "object" && current !== null ? (current as JsonRecord)[part] : undefined, claims);
    if (Array.isArray(value)) roles.push(...value.filter((item): item is string => typeof item === "string"));
    else if (typeof value === "string") roles.push(value);
  }
  return [...new Set(roles)].filter((role) => role.length > 0 && role.length <= 128).slice(0, 64);
}

/** Minimal OIDC JWT/JWKS verifier for enterprise control-plane adapters. */
export class OidcIdentityAdapter implements IdentityAdapter {
  private readonly issuer: URL;
  private readonly audience: string;
  private readonly configuredJwksUri: URL | undefined;
  private readonly rolesClaims: readonly string[];
  private readonly tenantClaim: string;
  private readonly clockSkewSeconds: number;
  private readonly jwksTtlMs: number;
  private readonly fetchImpl: typeof fetch;
  private jwksExpiresAt = 0;
  private keys = new Map<string, KeyObject>();
  private discoveredJwksUri?: URL;

  constructor(private readonly options: OidcIdentityOptions) {
    this.issuer = requiredHttps(options.issuer, "OIDC issuer");
    this.audience = options.audience;
    if (this.audience.length === 0 || this.audience.length > 256) throw new TypeError("OIDC audience is invalid");
    this.configuredJwksUri = options.jwksUri === undefined ? undefined : requiredHttps(options.jwksUri, "OIDC jwksUri");
    this.rolesClaims = options.rolesClaims ?? ["roles", "groups", "realm_access.roles"];
    this.tenantClaim = options.tenantClaim ?? "tenant_id";
    this.clockSkewSeconds = options.clockSkewSeconds ?? 30;
    this.jwksTtlMs = options.jwksTtlMs ?? 300_000;
    if (!Number.isInteger(this.clockSkewSeconds) || this.clockSkewSeconds < 0 || this.clockSkewSeconds > 300) throw new RangeError("OIDC clock skew is invalid");
    if (!Number.isInteger(this.jwksTtlMs) || this.jwksTtlMs < 10_000 || this.jwksTtlMs > 86_400_000) throw new RangeError("OIDC JWKS TTL is invalid");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async validateAccessToken(token: string): Promise<{ subject: string; tenantId?: string; roles: readonly string[] }> {
    if (token.length === 0 || token.length > 16_384) throw new Error("OIDC access token is invalid");
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((part) => part.length === 0)) throw new Error("OIDC access token must be a compact JWT");
    const header = decodeJson(parts[0]!, "header");
    const claims = decodeJson(parts[1]!, "claims");
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("OIDC token algorithm or key id is unsupported");
    const key = await this.keyFor(header.kid);
    const signed = `${parts[0]}.${parts[1]}`;
    const signature = Buffer.from(parts[2]!, "base64url");
    if (signature.length === 0) throw new Error("OIDC token signature is invalid");
    if (!verifySignature("RSA-SHA256", Buffer.from(signed), key, signature)) throw new Error("OIDC token signature is invalid");
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== this.issuer.toString().replace(/\/$/u, "")) throw new Error("OIDC issuer is invalid");
    if (!audienceMatches(claims.aud, this.audience)) throw new Error("OIDC audience is invalid");
    if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp + this.clockSkewSeconds < now) throw new Error("OIDC token is expired");
    if (typeof claims.nbf === "number" && (!Number.isFinite(claims.nbf) || claims.nbf - this.clockSkewSeconds > now)) throw new Error("OIDC token is not active");
    if (typeof claims.sub !== "string" || claims.sub.length === 0 || claims.sub.length > 256) throw new Error("OIDC subject is invalid");
    const tenant = claims[this.tenantClaim];
    return {
      subject: claims.sub,
      ...(typeof tenant === "string" && tenant.length > 0 ? { tenantId: tenant } : {}),
      roles: rolesFromClaims(claims, this.rolesClaims),
    };
  }

  private async keyFor(kid: string): Promise<KeyObject> {
    if (Date.now() >= this.jwksExpiresAt || !this.keys.has(kid)) await this.refreshKeys();
    const key = this.keys.get(kid);
    if (key === undefined) throw new Error("OIDC signing key not found");
    return key;
  }

  private async refreshKeys(): Promise<void> {
    const jwksUri = this.configuredJwksUri ?? await this.discoverJwksUri();
    const response = await this.fetchImpl(jwksUri, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`OIDC JWKS returned HTTP ${response.status}`);
    const payload = await response.json() as unknown;
    if (typeof payload !== "object" || payload === null || !Array.isArray((payload as JsonRecord).keys)) throw new Error("OIDC JWKS response is invalid");
    const keys = (payload as JsonRecord).keys as unknown[];
    const next = new Map<string, KeyObject>();
    for (const item of keys) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
      const jwk = item as JsonRecord;
      if (typeof jwk.kid !== "string" || jwk.kty !== "RSA") continue;
      try { next.set(jwk.kid, createPublicKey({ key: jwk as JsonWebKey, format: "jwk" })); }
      catch { /* ignore malformed keys; a valid matching key is required below */ }
    }
    if (next.size === 0) throw new Error("OIDC JWKS has no RSA keys");
    this.keys = next;
    this.jwksExpiresAt = Date.now() + this.jwksTtlMs;
  }

  private async discoverJwksUri(): Promise<URL> {
    if (this.discoveredJwksUri !== undefined) return this.discoveredJwksUri;
    const discovery = new URL(".well-known/openid-configuration", `${this.issuer.toString().replace(/\/$/u, "")}/`);
    const response = await this.fetchImpl(discovery, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`OIDC discovery returned HTTP ${response.status}`);
    const payload = await response.json() as unknown;
    const discovered = typeof payload === "object" && payload !== null ? (payload as JsonRecord).jwks_uri : undefined;
    if (typeof discovered !== "string") throw new Error("OIDC discovery has no jwks_uri");
    this.discoveredJwksUri = requiredHttps(discovered, "OIDC discovered jwks_uri");
    return this.discoveredJwksUri;
  }
}

/** Maps verified OIDC claims to the platform API's scoped identity-provider contract. */
export class OidcPlatformIdentityBridge {
  constructor(
    private readonly oidc: OidcIdentityAdapter,
    private readonly scopeResolver: OidcPlatformScopeResolver,
  ) {}

  async authenticate(accessToken: string, request: unknown): Promise<OidcPlatformScope | undefined> {
    const identity = await this.oidc.validateAccessToken(accessToken);
    const scope = await this.scopeResolver.resolve(identity, request);
    if (scope === undefined) return undefined;
    if (
      scope.tenantId.length === 0 || scope.projectId.length === 0 || scope.environmentId.length === 0 ||
      scope.tenantId.length > 128 || scope.projectId.length > 128 || scope.environmentId.length > 128
    ) throw new Error("OIDC scope resolver returned invalid resource scope");
    return scope;
  }
}
