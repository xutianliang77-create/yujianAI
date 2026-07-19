import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export interface YujianLicense {
  licenseId: string;
  tenantId: string;
  features: readonly string[];
  maxRtcNodes: number;
  expiresAt: string;
  gracePeriodHours: number;
}

export interface SignedLicense {
  payload: YujianLicense;
  signatureBase64: string;
}

export class LicenseError extends Error {
  constructor(message: string) { super(message); this.name = "LicenseError"; }
}

export interface LicenseIssuanceRequest {
  licenseId: string;
  tenantId: string;
  features: readonly string[];
  maxRtcNodes: number;
  expiresAt: string;
  gracePeriodHours: number;
}

export interface LicenseIssuancePolicy {
  allowedFeatures: readonly string[];
  maxRtcNodes: number;
  maxValidityDays: number;
  maxGracePeriodHours: number;
}

function canonicalPayload(payload: YujianLicense): Buffer {
  return Buffer.from(JSON.stringify({
    expiresAt: payload.expiresAt,
    features: [...payload.features],
    gracePeriodHours: payload.gracePeriodHours,
    licenseId: payload.licenseId,
    maxRtcNodes: payload.maxRtcNodes,
    tenantId: payload.tenantId,
  }), "utf8");
}

function validatePayload(payload: Record<string, unknown>, now: number, allowExpired: boolean): YujianLicense {
  const allowed = new Set(["licenseId", "tenantId", "features", "maxRtcNodes", "expiresAt", "gracePeriodHours"]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) throw new LicenseError("license payload contains unknown fields");
  const { licenseId, tenantId, features, expiresAt, maxRtcNodes, gracePeriodHours } = payload;
  if (typeof licenseId !== "string" || !/^[a-z][a-z0-9-]{2,63}$/u.test(licenseId)) throw new LicenseError("license id is invalid");
  if (typeof tenantId !== "string" || !/^[a-z][a-z0-9-]{2,63}$/u.test(tenantId)) throw new LicenseError("license tenant is invalid");
  if (!Array.isArray(features) || features.length > 128 || features.some((feature) => typeof feature !== "string" || !/^[a-z][a-z0-9._-]{0,63}$/u.test(feature)) || new Set(features).size !== features.length) throw new LicenseError("license features are invalid");
  if (typeof expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(expiresAt)) throw new LicenseError("license expiry is invalid");
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || !Number.isFinite(now)) throw new LicenseError("license expiry is invalid");
  if (typeof maxRtcNodes !== "number" || !Number.isInteger(maxRtcNodes) || maxRtcNodes < 1 || maxRtcNodes > 10_000) throw new LicenseError("license node limit is invalid");
  if (typeof gracePeriodHours !== "number" || !Number.isInteger(gracePeriodHours) || gracePeriodHours < 0 || gracePeriodHours > 720) throw new LicenseError("license grace period is invalid");
  if (!allowExpired && expiry + gracePeriodHours * 3_600_000 < now) throw new LicenseError("license has expired");
  return { licenseId, tenantId, features: features as string[], expiresAt, maxRtcNodes, gracePeriodHours };
}

/** Offline issuer. Private key custody remains outside this package and process. */
export function issueLicense(request: LicenseIssuanceRequest, policy: LicenseIssuancePolicy, privateKeyPem: string, now = Date.now()): SignedLicense {
  const payload = validatePayload(request as unknown as Record<string, unknown>, now, true);
  if (!Number.isInteger(policy.maxRtcNodes) || policy.maxRtcNodes < 1 || !Number.isInteger(policy.maxValidityDays) || policy.maxValidityDays < 1 || !Number.isInteger(policy.maxGracePeriodHours) || policy.maxGracePeriodHours < 0) throw new LicenseError("license issuance policy is invalid");
  const allowed = new Set(policy.allowedFeatures);
  if (payload.features.some((feature) => !allowed.has(feature))) throw new LicenseError("license feature is not allowed by issuance policy");
  if (payload.maxRtcNodes > policy.maxRtcNodes || payload.gracePeriodHours > policy.maxGracePeriodHours) throw new LicenseError("license limits exceed issuance policy");
  const expiry = Date.parse(payload.expiresAt);
  if (expiry <= now || expiry - now > policy.maxValidityDays * 86_400_000) throw new LicenseError("license validity exceeds issuance policy");
  let key;
  try { key = createPrivateKey(privateKeyPem); } catch { throw new LicenseError("license private key is invalid"); }
  if (key.asymmetricKeyType !== "ed25519") throw new LicenseError("license private key must be Ed25519");
  return { payload, signatureBase64: sign(null, canonicalPayload(payload), key).toString("base64url") };
}

export function verifyLicense(document: SignedLicense, publicKeyPem: string, now = Date.now()): YujianLicense {
  if (typeof document !== "object" || document === null || typeof document.payload !== "object" || document.payload === null || Array.isArray(document.payload) || typeof document.signatureBase64 !== "string" || !/^[A-Za-z0-9_-]+$/u.test(document.signatureBase64)) {
    throw new LicenseError("license document shape is invalid");
  }
  const payload = validatePayload(document.payload as unknown as Record<string, unknown>, now, false);
  let key;
  try {
    key = createPublicKey(publicKeyPem);
  } catch {
    throw new LicenseError("license public key is invalid");
  }
  if (key.asymmetricKeyType !== "ed25519") throw new LicenseError("license public key must be Ed25519");
  const signature = Buffer.from(document.signatureBase64, "base64url");
  const canonical = canonicalPayload(payload);
  const legacy = Buffer.from(JSON.stringify(document.payload), "utf8");
  const valid = signature.byteLength === 64 && (verify(null, canonical, key, signature) || (!canonical.equals(legacy) && verify(null, legacy, key, signature)));
  if (!valid) throw new LicenseError("license signature is invalid");
  return payload;
}
