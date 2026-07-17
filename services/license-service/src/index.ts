import { createPublicKey, verify } from "node:crypto";

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

export function verifyLicense(document: SignedLicense, publicKeyPem: string, now = Date.now()): YujianLicense {
  if (typeof document !== "object" || document === null || typeof document.payload !== "object" || document.payload === null || Array.isArray(document.payload) || typeof document.signatureBase64 !== "string" || !/^[A-Za-z0-9_-]+$/u.test(document.signatureBase64)) {
    throw new LicenseError("license document shape is invalid");
  }
  const payload = document.payload as unknown as Record<string, unknown>;
  const allowed = new Set(["licenseId", "tenantId", "features", "maxRtcNodes", "expiresAt", "gracePeriodHours"]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) throw new LicenseError("license payload contains unknown fields");
  const licenseId = payload.licenseId;
  const tenantId = payload.tenantId;
  const features = payload.features;
  const expiresAt = payload.expiresAt;
  const maxRtcNodes = payload.maxRtcNodes;
  const gracePeriodHours = payload.gracePeriodHours;
  if (typeof licenseId !== "string" || !/^[a-z][a-z0-9-]{2,63}$/u.test(licenseId)) throw new LicenseError("license id is invalid");
  if (typeof tenantId !== "string" || !/^[a-z][a-z0-9-]{2,63}$/u.test(tenantId)) throw new LicenseError("license tenant is invalid");
  if (!Array.isArray(features) || features.length > 128 || features.some((feature) => typeof feature !== "string" || !/^[a-z][a-z0-9._-]{0,63}$/u.test(feature)) || new Set(features).size !== features.length) throw new LicenseError("license features are invalid");
  if (typeof expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(expiresAt)) throw new LicenseError("license expiry is invalid");
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || !Number.isFinite(now)) throw new LicenseError("license expiry is invalid");
  if (typeof maxRtcNodes !== "number" || !Number.isInteger(maxRtcNodes) || maxRtcNodes < 1 || maxRtcNodes > 10_000) throw new LicenseError("license node limit is invalid");
  if (typeof gracePeriodHours !== "number" || !Number.isInteger(gracePeriodHours) || gracePeriodHours < 0 || gracePeriodHours > 720) throw new LicenseError("license grace period is invalid");
  let key;
  try {
    key = createPublicKey(publicKeyPem);
  } catch {
    throw new LicenseError("license public key is invalid");
  }
  if (key.asymmetricKeyType !== "ed25519") throw new LicenseError("license public key must be Ed25519");
  const signedPayload = Buffer.from(JSON.stringify(document.payload), "utf8");
  const signature = Buffer.from(document.signatureBase64, "base64url");
  if (signature.byteLength !== 64 || !verify(null, signedPayload, key, signature)) throw new LicenseError("license signature is invalid");
  if (expiry + gracePeriodHours * 3_600_000 < now) throw new LicenseError("license has expired");
  return document.payload;
}
