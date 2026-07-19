import { ContractValidationError, type ContractValidationIssue } from "./validation.js";

export interface TurnCredentialRequestV1 {
  tenantId: string;
  projectId: string;
  environmentId: string;
  participantIdentity: string;
  ttlSeconds?: number;
}

export interface NormalizedTurnCredentialRequestV1 extends TurnCredentialRequestV1 {
  ttlSeconds: number;
}

export interface IssuedTurnCredentialV1 {
  urls: readonly string[];
  username: string;
  credential: string;
  credentialType: "password";
  expiresAt: string;
}

const RESOURCE_ID = /^[a-z][a-z0-9-]{2,63}$/u;
const IDENTITY = /^[^\u0000-\u001f\u007f]{1,128}$/u;

export function parseTurnCredentialRequest(value: unknown): NormalizedTurnCredentialRequestV1 {
  const issues: ContractValidationIssue[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
  const input = value as Record<string, unknown>;
  const allowed = new Set(["tenantId", "projectId", "environmentId", "participantIdentity", "ttlSeconds"]);
  for (const field of Object.keys(input)) if (!allowed.has(field)) issues.push({ field, reason: "unknown field" });
  for (const field of ["tenantId", "projectId", "environmentId"] as const) {
    if (typeof input[field] !== "string" || !RESOURCE_ID.test(input[field])) issues.push({ field, reason: "must be a platform resource id" });
  }
  if (typeof input.participantIdentity !== "string" || !IDENTITY.test(input.participantIdentity) || input.participantIdentity.trim() !== input.participantIdentity) {
    issues.push({ field: "participantIdentity", reason: "must be 1-128 control-free characters without surrounding whitespace" });
  }
  const ttlSeconds = input.ttlSeconds === undefined ? 600 : input.ttlSeconds;
  if (!Number.isInteger(ttlSeconds) || (ttlSeconds as number) < 60 || (ttlSeconds as number) > 3600) issues.push({ field: "ttlSeconds", reason: "must be an integer from 60 to 3600" });
  if (issues.length > 0) throw new ContractValidationError(issues);
  return {
    tenantId: input.tenantId as string,
    projectId: input.projectId as string,
    environmentId: input.environmentId as string,
    participantIdentity: input.participantIdentity as string,
    ttlSeconds: ttlSeconds as number,
  };
}
