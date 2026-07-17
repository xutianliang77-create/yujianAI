import type {
  NormalizedIssueRoomTokenRequestV1,
  NormalizedRoomPermissionsV1,
} from "./types.js";

const DEFAULT_TTL_SECONDS = 300;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 300;
const MAX_NAME_LENGTH = 128;
const MAX_METADATA_BYTES = 4096;
const MAX_ATTRIBUTE_COUNT = 32;
const MAX_ATTRIBUTE_KEY_BYTES = 64;
const MAX_ATTRIBUTE_VALUE_BYTES = 256;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const RESOURCE_ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/u;
const RESERVED_ATTRIBUTE_PREFIX = "yujian.";

export interface ContractValidationIssue {
  field: string;
  reason: string;
}

export class ContractValidationError extends Error {
  readonly issues: ContractValidationIssue[];

  constructor(issues: ContractValidationIssue[]) {
    super("Request does not satisfy the platform contract");
    this.name = "ContractValidationError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: ContractValidationIssue[],
) {
  const allowedFields = new Set(allowed);
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      issues.push({
        field: path ? `${path}.${field}` : field,
        reason: "unknown field",
      });
    }
  }
}

function readRequiredName(
  value: unknown,
  field: string,
  issues: ContractValidationIssue[],
): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    issues.push({ field, reason: "must be a non-empty string" });
    return undefined;
  }
  if (value.length > MAX_NAME_LENGTH) {
    issues.push({ field, reason: `must be at most ${MAX_NAME_LENGTH} characters` });
  }
  if (value.trim() !== value) {
    issues.push({ field, reason: "must not start or end with whitespace" });
  }
  if (CONTROL_CHARACTERS.test(value)) {
    issues.push({ field, reason: "must not contain control characters" });
  }
  return value;
}

function readRequiredResourceId(
  value: unknown,
  field: string,
  issues: ContractValidationIssue[],
): string | undefined {
  if (typeof value !== "string" || !RESOURCE_ID_PATTERN.test(value)) {
    issues.push({
      field,
      reason: "must be 3-64 lowercase letters, digits, or hyphens and start with a letter",
    });
    return undefined;
  }
  return value;
}

function readOptionalString(
  value: unknown,
  field: string,
  maxBytes: number,
  issues: ContractValidationIssue[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    issues.push({ field, reason: "must be a string" });
    return undefined;
  }
  if (Buffer.byteLength(value, "utf8") > maxBytes) {
    issues.push({ field, reason: `must be at most ${maxBytes} UTF-8 bytes` });
  }
  return value;
}

function readOptionalName(
  value: unknown,
  field: string,
  issues: ContractValidationIssue[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readRequiredName(value, field, issues);
}

function readAttributes(
  value: unknown,
  issues: ContractValidationIssue[],
): Record<string, string> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    issues.push({ field: "attributes", reason: "must be an object" });
    return {};
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_ATTRIBUTE_COUNT) {
    issues.push({
      field: "attributes",
      reason: `must contain at most ${MAX_ATTRIBUTE_COUNT} entries`,
    });
  }

  const attributes: Record<string, string> = {};
  for (const [key, attributeValue] of entries) {
    if (key.startsWith(RESERVED_ATTRIBUTE_PREFIX)) {
      issues.push({
        field: `attributes.${key}`,
        reason: `keys starting with ${RESERVED_ATTRIBUTE_PREFIX} are reserved`,
      });
      continue;
    }
    if (
      key.length === 0 ||
      Buffer.byteLength(key, "utf8") > MAX_ATTRIBUTE_KEY_BYTES ||
      CONTROL_CHARACTERS.test(key)
    ) {
      issues.push({
        field: `attributes.${key}`,
        reason: `key must be non-empty, control-free, and at most ${MAX_ATTRIBUTE_KEY_BYTES} UTF-8 bytes`,
      });
      continue;
    }
    if (typeof attributeValue !== "string") {
      issues.push({ field: `attributes.${key}`, reason: "value must be a string" });
      continue;
    }
    if (
      Buffer.byteLength(attributeValue, "utf8") > MAX_ATTRIBUTE_VALUE_BYTES ||
      CONTROL_CHARACTERS.test(attributeValue)
    ) {
      issues.push({
        field: `attributes.${key}`,
        reason: `value must be control-free and at most ${MAX_ATTRIBUTE_VALUE_BYTES} UTF-8 bytes`,
      });
      continue;
    }
    attributes[key] = attributeValue;
  }
  return attributes;
}

function readPermissions(
  value: unknown,
  issues: ContractValidationIssue[],
): NormalizedRoomPermissionsV1 {
  if (value === undefined) {
    return { canPublish: true, canSubscribe: true, canPublishData: true };
  }
  if (!isRecord(value)) {
    issues.push({ field: "permissions", reason: "must be an object" });
    return { canPublish: false, canSubscribe: false, canPublishData: false };
  }
  const permissionsInput = value;

  rejectUnknownFields(
    permissionsInput,
    ["canPublish", "canSubscribe", "canPublishData"],
    "permissions",
    issues,
  );

  function readPermission(field: string): boolean {
    const permission = permissionsInput[field];
    if (permission === undefined) {
      return true;
    }
    if (typeof permission !== "boolean") {
      issues.push({ field: `permissions.${field}`, reason: "must be a boolean" });
      return false;
    }
    return permission;
  }

  return {
    canPublish: readPermission("canPublish"),
    canSubscribe: readPermission("canSubscribe"),
    canPublishData: readPermission("canPublishData"),
  };
}

function readTtl(value: unknown, issues: ContractValidationIssue[]): number {
  if (value === undefined) {
    return DEFAULT_TTL_SECONDS;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_TTL_SECONDS ||
    value > MAX_TTL_SECONDS
  ) {
    issues.push({
      field: "ttlSeconds",
      reason: `must be an integer from ${MIN_TTL_SECONDS} to ${MAX_TTL_SECONDS}`,
    });
    return DEFAULT_TTL_SECONDS;
  }
  return value;
}

export function parseIssueRoomTokenRequest(
  input: unknown,
): NormalizedIssueRoomTokenRequestV1 {
  const issues: ContractValidationIssue[] = [];
  if (!isRecord(input)) {
    throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
  }

  rejectUnknownFields(
    input,
    [
      "tenantId",
      "projectId",
      "environmentId",
      "roomName",
      "participantIdentity",
      "participantName",
      "metadata",
      "attributes",
      "permissions",
      "ttlSeconds",
    ],
    "",
    issues,
  );

  const tenantId = readRequiredResourceId(input.tenantId, "tenantId", issues);
  const projectId = readRequiredResourceId(input.projectId, "projectId", issues);
  const environmentId = readRequiredResourceId(
    input.environmentId,
    "environmentId",
    issues,
  );
  const roomName = readRequiredName(input.roomName, "roomName", issues);
  const participantIdentity = readRequiredName(
    input.participantIdentity,
    "participantIdentity",
    issues,
  );
  const participantName = readOptionalName(
    input.participantName,
    "participantName",
    issues,
  );
  const metadata = readOptionalString(
    input.metadata,
    "metadata",
    MAX_METADATA_BYTES,
    issues,
  );
  const attributes = readAttributes(input.attributes, issues);
  const permissions = readPermissions(input.permissions, issues);
  const ttlSeconds = readTtl(input.ttlSeconds, issues);

  if (issues.length > 0) {
    throw new ContractValidationError(issues);
  }
  if (
    tenantId === undefined ||
    projectId === undefined ||
    environmentId === undefined ||
    roomName === undefined ||
    participantIdentity === undefined
  ) {
    throw new Error("validated required fields are unavailable");
  }

  return {
    tenantId,
    projectId,
    environmentId,
    roomName,
    participantIdentity,
    ...(participantName === undefined ? {} : { participantName }),
    ...(metadata === undefined ? {} : { metadata }),
    attributes,
    permissions,
    ttlSeconds,
  };
}
