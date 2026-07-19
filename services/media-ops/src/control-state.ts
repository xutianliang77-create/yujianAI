import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { EgressJobV1, IngressJobV1, MediaOperationStatusV1, SipCallV1 } from "@yujian/platform-contracts";
import type { MediaOpsSnapshot } from "./persistence.js";

export class MediaOpsError extends Error {
  constructor(readonly code: "NOT_FOUND" | "CONFLICT" | "POLICY_DISABLED" | "QUOTA_EXCEEDED" | "PROVIDER_UNAVAILABLE", message: string) { super(message); }
}

export const STATUS_TRANSITIONS: Readonly<Record<MediaOperationStatusV1, readonly MediaOperationStatusV1[]>> = {
  requested: ["starting", "failed", "cancelled"],
  starting: ["active", "failed", "cancelled"],
  active: ["draining", "completed", "failed", "cancelled"],
  draining: ["completed", "failed", "cancelled"],
  completed: [], failed: [], cancelled: [],
};

export function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }

export function requireText(value: string, field: string): string {
  if (value.length === 0 || value.length > 128 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new MediaOpsError("CONFLICT", `${field} must be a trimmed control-free string`);
  }
  return value;
}

export function requireTarget(value: string, field: string): string {
  if (value.length === 0 || value.length > 2048 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new MediaOpsError("CONFLICT", `${field} must be a trimmed control-free target`);
  }
  return value;
}

export function requireExternalHttpsUrl(value: string): string {
  requireTarget(value, "sourceUrl");
  let url: URL;
  try { url = new URL(value); } catch { throw new MediaOpsError("CONFLICT", "sourceUrl must be an absolute HTTPS URL"); }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") throw new MediaOpsError("CONFLICT", "sourceUrl must be credential-free HTTPS");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "").replace(/\.$/u, "");
  if (isIP(host) !== 0 || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) {
    throw new MediaOpsError("CONFLICT", "sourceUrl cannot target a local or private address");
  }
  return value;
}

export function requireStableUri(value: string, field: string): string {
  requireTarget(value, field);
  let url: URL;
  try { url = new URL(value); } catch { throw new MediaOpsError("CONFLICT", `${field} must be an absolute URI`); }
  if (!["https:", "s3:", "oss:", "cos:", "obs:", "evidence:", "artifact:"].includes(url.protocol) || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new MediaOpsError("CONFLICT", `${field} must be a stable credential-free URI`);
  }
  return value;
}

export function requireDateText(value: string, field: string): string {
  requireText(value, field);
  if (!Number.isFinite(Date.parse(value))) throw new MediaOpsError("CONFLICT", `${field} must be an ISO date`);
  return value;
}

export function idempotencyScope(kind: string, environmentId: string, key: string): string { return `${kind}:${environmentId}:${sha256(key)}`; }
export function requestFingerprint(value: unknown): string { return sha256(JSON.stringify(value)); }

type MediaResource = SipCallV1 | IngressJobV1 | EgressJobV1;
export interface RestoredMediaOpsState {
  calls: Map<string, SipCallV1>;
  ingress: Map<string, IngressJobV1>;
  egress: Map<string, EgressJobV1>;
  idempotency: Map<string, MediaResource>;
  idempotencyFingerprints: Map<string, string>;
  operationResults: Map<string, SipCallV1>;
}

function readResourceMap<T extends MediaResource>(values: readonly T[], field: string): Map<string, T> {
  if (!Array.isArray(values)) throw new Error(`media-ops snapshot ${field} must be an array`);
  const result = new Map<string, T>();
  for (const value of values) {
    if (typeof value !== "object" || value === null) throw new Error(`invalid media-ops snapshot ${field}`);
    const key = (value as unknown as Record<string, unknown>)[field];
    if (typeof key !== "string" || key.length === 0 || result.has(key) || !/^[a-f0-9]{64}$/u.test(value.idempotencyKeyHash)) throw new Error(`invalid media-ops snapshot ${field}`);
    if (value.providerSequence !== undefined && (!Number.isSafeInteger(value.providerSequence) || value.providerSequence < 0)) throw new Error(`invalid media-ops snapshot ${field}`);
    if (value.providerUpdatedAt !== undefined && !Number.isFinite(Date.parse(value.providerUpdatedAt))) throw new Error(`invalid media-ops snapshot ${field}`);
    if (value.edgeAttestationDigest !== undefined && !/^sha256:[a-f0-9]{64}$/u.test(value.edgeAttestationDigest)) throw new Error(`invalid media-ops snapshot ${field}`);
    if (value.providerName !== undefined && !/^[a-z][a-z0-9_-]{1,63}$/u.test(value.providerName)) throw new Error(`invalid media-ops snapshot ${field}`);
    result.set(key, value);
  }
  return result;
}

function readEntries<T>(entries: readonly [string, T][], validate: (value: T) => boolean, message: string): Map<string, T> {
  if (!Array.isArray(entries)) throw new Error(message);
  const result = new Map<string, T>();
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !/:[a-f0-9]{64}$/u.test(entry[0]) || !validate(entry[1]) || result.has(entry[0])) throw new Error(message);
    result.set(entry[0], entry[1]);
  }
  return result;
}

export function restoreMediaOpsSnapshot(snapshot: MediaOpsSnapshot): RestoredMediaOpsState {
  if (typeof snapshot !== "object" || snapshot === null) throw new Error("media-ops snapshot must be an object");
  const calls = readResourceMap(snapshot.calls, "callId");
  const ingress = readResourceMap(snapshot.ingress, "ingressId");
  const egress = readResourceMap(snapshot.egress, "egressId");
  for (const job of egress.values()) {
    if (job.retentionExpiresAt !== undefined) requireDateText(job.retentionExpiresAt, "retentionExpiresAt");
    if (job.deletedAt !== undefined) requireDateText(job.deletedAt, "deletedAt");
    if (job.objectUri !== undefined) requireStableUri(job.objectUri, "objectUri");
    if (job.deletionEvidenceUri !== undefined) requireStableUri(job.deletionEvidenceUri, "deletionEvidenceUri");
    if ((job.deletionEvidenceUri === undefined) !== (job.deletedAt === undefined)) throw new Error("media-ops deletion evidence and deletedAt must be set together");
  }
  return {
    calls, ingress, egress,
    idempotency: readEntries(snapshot.idempotency, (value) => typeof value === "object" && value !== null, "invalid media-ops idempotency snapshot"),
    idempotencyFingerprints: readEntries(snapshot.idempotencyFingerprints, (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value), "invalid media-ops fingerprint snapshot"),
    operationResults: readEntries(snapshot.operationResults, (value) => typeof value === "object" && value !== null, "invalid media-ops operation snapshot"),
  };
}
