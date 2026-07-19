import { ContractValidationError, type ContractValidationIssue } from "./validation.js";

export type PreviewFeatureV1 = "rtc" | "turn" | "telemetry" | "agent" | "ingress" | "egress" | "sip";
export type EntitlementStatusV1 = "active" | "suspended" | "expired";

export interface EnvironmentEntitlementV1 {
  entitlementId: string;
  tenantId: string;
  projectId: string;
  environmentId: string;
  planId: string;
  status: EntitlementStatusV1;
  features: readonly PreviewFeatureV1[];
  validFrom: string;
  validUntil: string;
  version: number;
  updatedAt: string;
}

export interface UpsertEnvironmentEntitlementRequestV1 {
  planId: string;
  status: EntitlementStatusV1;
  features: readonly PreviewFeatureV1[];
  validFrom: string;
  validUntil: string;
  expectedVersion: number;
}

export type SupportTicketStatusV1 = "open" | "in-progress" | "resolved" | "closed";
export type SupportTicketSeverityV1 = "p0" | "p1" | "p2" | "p3";

export interface SupportTicketV1 {
  ticketId: string;
  tenantId: string;
  projectId: string;
  environmentId: string;
  severity: SupportTicketSeverityV1;
  category: "availability" | "quality" | "billing" | "security" | "deployment";
  summary: string;
  status: SupportTicketStatusV1;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateSupportTicketRequestV1 {
  severity: SupportTicketSeverityV1;
  category: SupportTicketV1["category"];
  summary: string;
}

export interface UpdateSupportTicketRequestV1 {
  status: SupportTicketStatusV1;
  expectedVersion: number;
}

export interface IssueSupportAccessGrantRequestV1 {
  operatorSubject: string;
  permissions: readonly ("ticket.read" | "bundle.download" | "remote.inspect" | "remote.execute")[];
  ttlSeconds: number;
  approvalReceiptRef?: string;
}

export interface RegisterSupportBundleRequestV1 {
  artifactUri: string;
  sha256: string;
  sizeBytes: number;
  redactionPolicyVersion: string;
  containsMedia: false;
  expiresAt: string;
}

export interface SupportBundleArtifactV1 {
  bundleId: string;
  ticketId: string;
  artifactUri: string;
  sha256: string;
  sizeBytes: number;
  redactionPolicyVersion: string;
  containsMedia: false;
  expiresAt: string;
  createdAt: string;
}

export interface SupportAccessGrantV1 {
  grantId: string;
  ticketId: string;
  operatorSubject: string;
  permissions: readonly ("ticket.read" | "bundle.download" | "remote.inspect" | "remote.execute")[];
  approvalReceiptRef?: string;
  expiresAt: string;
  createdAt: string;
  revokedAt?: string;
}

export interface IssuedSupportAccessGrantV1 extends SupportAccessGrantV1 {
  accessToken: string;
}

const RESOURCE_ID = /^[a-z][a-z0-9-]{2,63}$/u;
const PLAN_ID = /^[a-z][a-z0-9._-]{2,127}$/u;
const FEATURES = new Set<PreviewFeatureV1>(["rtc", "turn", "telemetry", "agent", "ingress", "egress", "sip"]);
const STATUSES = new Set<EntitlementStatusV1>(["active", "suspended", "expired"]);
const SEVERITIES = new Set<SupportTicketSeverityV1>(["p0", "p1", "p2", "p3"]);
const CATEGORIES = new Set<SupportTicketV1["category"]>(["availability", "quality", "billing", "security", "deployment"]);
const TICKET_STATUSES = new Set<SupportTicketStatusV1>(["open", "in-progress", "resolved", "closed"]);
const SUPPORT_PERMISSIONS = new Set<SupportAccessGrantV1["permissions"][number]>(["ticket.read", "bundle.download", "remote.inspect", "remote.execute"]);
const STABLE_EVIDENCE_REF = /^(?:evidence|https|s3|oss):\/\/[^\s?#]+$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
  return value as Record<string, unknown>;
}

function exact(input: Record<string, unknown>, allowed: ReadonlySet<string>, issues: ContractValidationIssue[]): void {
  for (const field of Object.keys(input)) if (!allowed.has(field)) issues.push({ field, reason: "unknown field" });
}

function timestamp(value: unknown, field: string, issues: ContractValidationIssue[]): number {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed)) issues.push({ field, reason: "must be an ISO timestamp" });
  return parsed;
}

export function parseUpsertEnvironmentEntitlementRequest(value: unknown): UpsertEnvironmentEntitlementRequestV1 {
  const input = object(value);
  const issues: ContractValidationIssue[] = [];
  exact(input, new Set(["planId", "status", "features", "validFrom", "validUntil", "expectedVersion"]), issues);
  if (typeof input.planId !== "string" || !PLAN_ID.test(input.planId)) issues.push({ field: "planId", reason: "must be a plan id" });
  if (typeof input.status !== "string" || !STATUSES.has(input.status as EntitlementStatusV1)) issues.push({ field: "status", reason: "must be an entitlement status" });
  if (!Array.isArray(input.features) || input.features.length === 0 || input.features.length > FEATURES.size || input.features.some((feature) => typeof feature !== "string" || !FEATURES.has(feature as PreviewFeatureV1))) issues.push({ field: "features", reason: "must contain 1-7 known features" });
  else if (new Set(input.features).size !== input.features.length) issues.push({ field: "features", reason: "must not contain duplicates" });
  const validFrom = timestamp(input.validFrom, "validFrom", issues);
  const validUntil = timestamp(input.validUntil, "validUntil", issues);
  if (Number.isFinite(validFrom) && Number.isFinite(validUntil) && validUntil <= validFrom) issues.push({ field: "validUntil", reason: "must be after validFrom" });
  if (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 0) issues.push({ field: "expectedVersion", reason: "must be a non-negative safe integer" });
  if (issues.length > 0) throw new ContractValidationError(issues);
  return { planId: input.planId as string, status: input.status as EntitlementStatusV1, features: [...input.features as PreviewFeatureV1[]], validFrom: new Date(validFrom).toISOString(), validUntil: new Date(validUntil).toISOString(), expectedVersion: input.expectedVersion as number };
}

export function parseCreateSupportTicketRequest(value: unknown): CreateSupportTicketRequestV1 {
  const input = object(value);
  const issues: ContractValidationIssue[] = [];
  exact(input, new Set(["severity", "category", "summary"]), issues);
  if (typeof input.severity !== "string" || !SEVERITIES.has(input.severity as SupportTicketSeverityV1)) issues.push({ field: "severity", reason: "must be p0-p3" });
  if (typeof input.category !== "string" || !CATEGORIES.has(input.category as SupportTicketV1["category"])) issues.push({ field: "category", reason: "must be a support category" });
  if (typeof input.summary !== "string" || input.summary.length < 3 || input.summary.length > 256 || input.summary.trim() !== input.summary || /[\u0000-\u001f\u007f]/u.test(input.summary)) issues.push({ field: "summary", reason: "must be 3-256 control-free characters" });
  if (issues.length > 0) throw new ContractValidationError(issues);
  return { severity: input.severity as SupportTicketSeverityV1, category: input.category as SupportTicketV1["category"], summary: input.summary as string };
}

export function parseUpdateSupportTicketRequest(value: unknown): UpdateSupportTicketRequestV1 {
  const input = object(value);
  const issues: ContractValidationIssue[] = [];
  exact(input, new Set(["status", "expectedVersion"]), issues);
  if (typeof input.status !== "string" || !TICKET_STATUSES.has(input.status as SupportTicketStatusV1)) issues.push({ field: "status", reason: "must be a support ticket status" });
  if (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 1) issues.push({ field: "expectedVersion", reason: "must be a positive safe integer" });
  if (issues.length > 0) throw new ContractValidationError(issues);
  return { status: input.status as SupportTicketStatusV1, expectedVersion: input.expectedVersion as number };
}

export function parseIssueSupportAccessGrantRequest(value: unknown): IssueSupportAccessGrantRequestV1 {
  const input = object(value);
  const issues: ContractValidationIssue[] = [];
  exact(input, new Set(["operatorSubject", "permissions", "ttlSeconds", "approvalReceiptRef"]), issues);
  if (typeof input.operatorSubject !== "string" || input.operatorSubject.length < 3 || input.operatorSubject.length > 128 || !/^[A-Za-z0-9._:@/-]+$/u.test(input.operatorSubject)) issues.push({ field: "operatorSubject", reason: "must be a stable operator subject" });
  if (!Array.isArray(input.permissions) || input.permissions.length !== 1 || input.permissions.some((permission) => typeof permission !== "string" || !SUPPORT_PERMISSIONS.has(permission as SupportAccessGrantV1["permissions"][number]))) issues.push({ field: "permissions", reason: "must contain exactly one known support permission" });
  else if (new Set(input.permissions).size !== input.permissions.length) issues.push({ field: "permissions", reason: "must not contain duplicates" });
  if (!Number.isSafeInteger(input.ttlSeconds) || (input.ttlSeconds as number) < 60 || (input.ttlSeconds as number) > 3600) issues.push({ field: "ttlSeconds", reason: "must be 60-3600" });
  const remote = Array.isArray(input.permissions) && input.permissions.some((permission) => permission === "remote.inspect" || permission === "remote.execute");
  if (remote && (typeof input.approvalReceiptRef !== "string" || !STABLE_EVIDENCE_REF.test(input.approvalReceiptRef))) issues.push({ field: "approvalReceiptRef", reason: "remote access requires a stable approval evidence reference" });
  if (!remote && input.approvalReceiptRef !== undefined) issues.push({ field: "approvalReceiptRef", reason: "is only allowed for remote access" });
  if (Array.isArray(input.permissions) && input.permissions.includes("remote.execute") && (input.ttlSeconds as number) > 900) issues.push({ field: "ttlSeconds", reason: "remote.execute is limited to 900 seconds" });
  if (issues.length > 0) throw new ContractValidationError(issues);
  return { operatorSubject: input.operatorSubject as string, permissions: [...input.permissions as SupportAccessGrantV1["permissions"][number][]], ttlSeconds: input.ttlSeconds as number, ...(input.approvalReceiptRef === undefined ? {} : { approvalReceiptRef: input.approvalReceiptRef as string }) };
}

export function parseRegisterSupportBundleRequest(value: unknown): RegisterSupportBundleRequestV1 {
  const input = object(value);
  const issues: ContractValidationIssue[] = [];
  exact(input, new Set(["artifactUri", "sha256", "sizeBytes", "redactionPolicyVersion", "containsMedia", "expiresAt"]), issues);
  if (typeof input.artifactUri !== "string" || input.artifactUri.length < 3 || input.artifactUri.length > 2048 || !/^(s3|gs|https):\/\//u.test(input.artifactUri)) issues.push({ field: "artifactUri", reason: "must be an s3, gs or https URI" });
  else {
    try {
      const uri = new URL(input.artifactUri);
      if (uri.username !== "" || uri.password !== "" || uri.search !== "" || uri.hash !== "" || uri.hostname === "") issues.push({ field: "artifactUri", reason: "must not embed credentials, query parameters or fragments" });
    } catch {
      issues.push({ field: "artifactUri", reason: "must be a valid URI" });
    }
  }
  if (typeof input.sha256 !== "string" || !SHA256.test(input.sha256)) issues.push({ field: "sha256", reason: "must be a sha256 digest" });
  if (!Number.isSafeInteger(input.sizeBytes) || (input.sizeBytes as number) < 0) issues.push({ field: "sizeBytes", reason: "must be a non-negative safe integer" });
  if (typeof input.redactionPolicyVersion !== "string" || !/^[a-z][a-z0-9._-]{2,63}$/u.test(input.redactionPolicyVersion)) issues.push({ field: "redactionPolicyVersion", reason: "must be a policy id" });
  if (input.containsMedia !== false) issues.push({ field: "containsMedia", reason: "must be false" });
  const expiresAt = timestamp(input.expiresAt, "expiresAt", issues);
  if (issues.length > 0) throw new ContractValidationError(issues);
  return { artifactUri: input.artifactUri as string, sha256: input.sha256 as string, sizeBytes: input.sizeBytes as number, redactionPolicyVersion: input.redactionPolicyVersion as string, containsMedia: false, expiresAt: new Date(expiresAt).toISOString() };
}

export function isPlatformResourceId(value: string): boolean { return RESOURCE_ID.test(value); }
