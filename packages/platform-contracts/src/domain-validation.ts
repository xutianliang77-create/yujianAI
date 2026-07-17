import type {
  CreateApiKeyRequestV1,
  CreateEnvironmentRequestV1,
  CreateTenantMemberRequestV1,
  CreateProjectRequestV1,
  CreateTenantRequestV1,
  EnvironmentTypeV1,
  EnvironmentStatusV1,
  PlatformRoleV1,
  UpdateTenantMemberRequestV1,
  UpdateEnvironmentRequestV1,
} from "./domain.js";
import { ContractValidationError, type ContractValidationIssue } from "./validation.js";

const RESOURCE_ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/u;
const SLUG_PATTERN = /^[a-z][a-z0-9-]{2,63}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const NAME_MAX_LENGTH = 128;
const ALLOWED_ENVIRONMENT_TYPES = new Set<EnvironmentTypeV1>([
  "dev",
  "test",
  "staging",
  "prod",
]);
const ALLOWED_ROLES = new Set<PlatformRoleV1>([
  "tenant_owner",
  "tenant_admin",
  "developer",
  "billing_admin",
  "security_auditor",
  "support_operator",
  "private_deployment_admin",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknown(
  value: Record<string, unknown>,
  fields: readonly string[],
  issues: ContractValidationIssue[],
) {
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) issues.push({ field, reason: "unknown field" });
  }
}

function requiredName(
  value: unknown,
  field: string,
  issues: ContractValidationIssue[],
): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    issues.push({ field, reason: "must be a non-empty string" });
    return undefined;
  }
  if (value.length > NAME_MAX_LENGTH) {
    issues.push({ field, reason: `must be at most ${NAME_MAX_LENGTH} characters` });
  }
  if (value.trim() !== value || CONTROL_CHARACTERS.test(value)) {
    issues.push({ field, reason: "must be trimmed and control-free" });
  }
  return value;
}

function requiredResourceId(
  value: unknown,
  field: string,
  issues: ContractValidationIssue[],
): string | undefined {
  if (typeof value !== "string" || !RESOURCE_ID_PATTERN.test(value)) {
    issues.push({ field, reason: "must be a valid lowercase resource id" });
    return undefined;
  }
  return value;
}

function optionalId(
  value: unknown,
  field: string,
  issues: ContractValidationIssue[],
): string | undefined {
  if (value === undefined) return undefined;
  return requiredResourceId(value, field, issues);
}

function throwIfInvalid(issues: ContractValidationIssue[]) {
  if (issues.length > 0) throw new ContractValidationError(issues);
}

export function parseCreateTenantRequest(
  input: unknown,
): CreateTenantRequestV1 {
  if (!isRecord(input)) {
    throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
  }
  const issues: ContractValidationIssue[] = [];
  rejectUnknown(input, ["displayName", "dataResidencyPolicy", "planId"], issues);
  const displayName = requiredName(input.displayName, "displayName", issues);
  const dataResidencyPolicy = optionalId(
    input.dataResidencyPolicy,
    "dataResidencyPolicy",
    issues,
  );
  const planId = optionalId(input.planId, "planId", issues);
  throwIfInvalid(issues);
  if (displayName === undefined) throw new Error("displayName unavailable after validation");
  return {
    displayName,
    ...(dataResidencyPolicy === undefined ? {} : { dataResidencyPolicy }),
    ...(planId === undefined ? {} : { planId }),
  };
}

export function parseCreateProjectRequest(
  input: unknown,
): CreateProjectRequestV1 {
  if (!isRecord(input)) {
    throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
  }
  const issues: ContractValidationIssue[] = [];
  rejectUnknown(input, ["tenantId", "name", "slug", "defaultRegionPolicyId"], issues);
  const tenantId = requiredResourceId(input.tenantId, "tenantId", issues);
  const name = requiredName(input.name, "name", issues);
  const slug =
    typeof input.slug === "string" && SLUG_PATTERN.test(input.slug)
      ? input.slug
      : undefined;
  if (slug === undefined) issues.push({ field: "slug", reason: "must be a valid lowercase slug" });
  const defaultRegionPolicyId = optionalId(
    input.defaultRegionPolicyId,
    "defaultRegionPolicyId",
    issues,
  );
  throwIfInvalid(issues);
  if (tenantId === undefined || name === undefined || slug === undefined) {
    throw new Error("project fields unavailable after validation");
  }
  return {
    tenantId,
    name,
    slug,
    ...(defaultRegionPolicyId === undefined ? {} : { defaultRegionPolicyId }),
  };
}

export function parseCreateEnvironmentRequest(
  input: unknown,
): CreateEnvironmentRequestV1 {
  if (!isRecord(input)) {
    throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
  }
  const issues: ContractValidationIssue[] = [];
  rejectUnknown(
    input,
    [
      "tenantId",
      "projectId",
      "name",
      "type",
      "endpoint",
      "regionPolicyId",
      "quotaPolicyId",
      "retentionPolicyId",
    ],
    issues,
  );
  const tenantId = requiredResourceId(input.tenantId, "tenantId", issues);
  const projectId = requiredResourceId(input.projectId, "projectId", issues);
  const name = requiredName(input.name, "name", issues);
  const type = ALLOWED_ENVIRONMENT_TYPES.has(input.type as EnvironmentTypeV1)
    ? (input.type as EnvironmentTypeV1)
    : undefined;
  if (type === undefined) issues.push({ field: "type", reason: "unsupported environment type" });
  const endpoint = requiredName(input.endpoint, "endpoint", issues);
  const regionPolicyId = optionalId(input.regionPolicyId, "regionPolicyId", issues);
  const quotaPolicyId = optionalId(input.quotaPolicyId, "quotaPolicyId", issues);
  const retentionPolicyId = optionalId(input.retentionPolicyId, "retentionPolicyId", issues);
  throwIfInvalid(issues);
  if (
    tenantId === undefined ||
    projectId === undefined ||
    name === undefined ||
    type === undefined ||
    endpoint === undefined
  ) {
    throw new Error("environment fields unavailable after validation");
  }
  return {
    tenantId,
    projectId,
    name,
    type,
    endpoint,
    ...(regionPolicyId === undefined ? {} : { regionPolicyId }),
    ...(quotaPolicyId === undefined ? {} : { quotaPolicyId }),
    ...(retentionPolicyId === undefined ? {} : { retentionPolicyId }),
  };
}

function requiredStringArray(
  value: unknown,
  field: string,
  issues: ContractValidationIssue[],
  allowed?: ReadonlySet<string>,
): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    issues.push({ field, reason: "must contain 1-32 strings" });
    return undefined;
  }
  const result: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || item.length === 0 || item.length > 128 || CONTROL_CHARACTERS.test(item)) {
      issues.push({ field: `${field}[${index}]`, reason: "must be a non-empty control-free string" });
      continue;
    }
    if (allowed !== undefined && !allowed.has(item)) {
      issues.push({ field: `${field}[${index}]`, reason: "unsupported value" });
      continue;
    }
    result.push(item);
  }
  return result;
}

export function parseCreateApiKeyRequest(input: unknown): CreateApiKeyRequestV1 {
  if (!isRecord(input)) {
    throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
  }
  const issues: ContractValidationIssue[] = [];
  rejectUnknown(input, ["scopes", "expiresAt"], issues);
  const scopes = requiredStringArray(input.scopes, "scopes", issues);
  let expiresAt: string | undefined;
  if (input.expiresAt !== undefined) {
    if (typeof input.expiresAt !== "string" || Number.isNaN(Date.parse(input.expiresAt))) {
      issues.push({ field: "expiresAt", reason: "must be an ISO timestamp" });
    } else {
      expiresAt = new Date(input.expiresAt).toISOString();
    }
  }
  throwIfInvalid(issues);
  if (scopes === undefined) throw new Error("scopes unavailable after validation");
  return { scopes, ...(expiresAt === undefined ? {} : { expiresAt }) };
}

export function parseCreateTenantMemberRequest(input: unknown): CreateTenantMemberRequestV1 {
  if (!isRecord(input)) {
    throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
  }
  const issues: ContractValidationIssue[] = [];
  rejectUnknown(input, ["subject", "roles"], issues);
  const subject = requiredName(input.subject, "subject", issues);
  const roles = requiredStringArray(input.roles, "roles", issues, ALLOWED_ROLES) as PlatformRoleV1[] | undefined;
  throwIfInvalid(issues);
  if (subject === undefined || roles === undefined) throw new Error("member fields unavailable after validation");
  return { subject, roles };
}

export function parseUpdateTenantMemberRequest(input: unknown): UpdateTenantMemberRequestV1 {
  if (!isRecord(input)) {
    throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
  }
  const issues: ContractValidationIssue[] = [];
  rejectUnknown(input, ["roles", "status"], issues);
  const roles = input.roles === undefined
    ? undefined
    : requiredStringArray(input.roles, "roles", issues, ALLOWED_ROLES) as PlatformRoleV1[] | undefined;
  const allowedStatuses = new Set(["active", "suspended", "removed"] as const);
  const status = input.status === undefined
    ? undefined
    : allowedStatuses.has(input.status as "active" | "suspended" | "removed")
      ? (input.status as "active" | "suspended" | "removed")
      : undefined;
  if (input.status !== undefined && status === undefined) issues.push({ field: "status", reason: "unsupported member status" });
  if (roles === undefined && status === undefined) issues.push({ field: "$", reason: "at least one field is required" });
  throwIfInvalid(issues);
  return { ...(roles === undefined ? {} : { roles }), ...(status === undefined ? {} : { status }) };
}

export function parseUpdateEnvironmentRequest(input: unknown): UpdateEnvironmentRequestV1 {
  if (!isRecord(input)) throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
  const issues: ContractValidationIssue[] = [];
  rejectUnknown(input, ["version", "name", "endpoint", "status", "regionPolicyId", "quotaPolicyId", "retentionPolicyId"], issues);
  const version = typeof input.version === "number" && Number.isInteger(input.version) && input.version >= 1 ? input.version : undefined;
  if (version === undefined) issues.push({ field: "version", reason: "must be a positive integer" });
  const name = input.name === undefined ? undefined : requiredName(input.name, "name", issues);
  const endpoint = input.endpoint === undefined ? undefined : requiredName(input.endpoint, "endpoint", issues);
  const status = input.status === undefined ? undefined : new Set<EnvironmentStatusV1>(["active", "suspended", "retiring", "retired"]).has(input.status as EnvironmentStatusV1) ? input.status as EnvironmentStatusV1 : undefined;
  if (input.status !== undefined && status === undefined) issues.push({ field: "status", reason: "unsupported environment status" });
  const regionPolicyId = optionalId(input.regionPolicyId, "regionPolicyId", issues);
  const quotaPolicyId = optionalId(input.quotaPolicyId, "quotaPolicyId", issues);
  const retentionPolicyId = optionalId(input.retentionPolicyId, "retentionPolicyId", issues);
  if ([name, endpoint, status, regionPolicyId, quotaPolicyId, retentionPolicyId].every((value) => value === undefined)) issues.push({ field: "$", reason: "at least one mutable field is required" });
  throwIfInvalid(issues);
  if (version === undefined) throw new Error("version unavailable after validation");
  return { version, ...(name === undefined ? {} : { name }), ...(endpoint === undefined ? {} : { endpoint }), ...(status === undefined ? {} : { status }), ...(regionPolicyId === undefined ? {} : { regionPolicyId }), ...(quotaPolicyId === undefined ? {} : { quotaPolicyId }), ...(retentionPolicyId === undefined ? {} : { retentionPolicyId }) };
}
