import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import type { PlatformRoleV1, PlatformScopeV1 } from "@yujian/platform-contracts";

export interface PlatformCredential extends PlatformScopeV1 {
  credential: string;
  scopes?: readonly string[];
  roles?: readonly PlatformRoleV1[];
}

const ROLE_PERMISSIONS: Readonly<Record<PlatformRoleV1, readonly string[]>> = {
  tenant_owner: ["*"],
  tenant_admin: ["*"],
  developer: ["rtc.*", "media.*", "telemetry.*", "api-key.read", "usage.read"],
  billing_admin: ["billing.*", "usage.read"],
  security_auditor: ["audit.read", "telemetry.read", "usage.read", "data-rights.read"],
  support_operator: ["rtc.room.read", "rtc.participant.read", "telemetry.read", "support.*"],
  private_deployment_admin: ["deployment.*", "environment.read", "environment.write", "audit.read"],
};

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function resolveBearerCredential(
  headers: IncomingHttpHeaders,
  credentials: readonly PlatformCredential[],
): PlatformCredential | undefined {
  const authorization = headers.authorization;
  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    return undefined;
  }
  const suppliedCredential = authorization.slice("Bearer ".length);
  const suppliedDigest = digest(suppliedCredential);
  let matchedCredential: PlatformCredential | undefined;
  for (const candidate of credentials) {
    if (timingSafeEqual(suppliedDigest, digest(candidate.credential))) {
      matchedCredential ??= candidate;
    }
  }
  return matchedCredential;
}

export function bearerCredentialMatches(
  headers: IncomingHttpHeaders,
  credential: string | undefined,
): boolean {
  const authorization = headers.authorization;
  if (credential === undefined || typeof authorization !== "string") return false;
  if (!authorization.startsWith("Bearer ")) return false;
  const supplied = digest(authorization.slice("Bearer ".length));
  return timingSafeEqual(supplied, digest(credential));
}

export function credentialHasScope(
  credential: PlatformCredential,
  scope: PlatformScopeV1,
): boolean {
  return (
    credential.tenantId === scope.tenantId &&
    credential.projectId === scope.projectId &&
    credential.environmentId === scope.environmentId
  );
}

export function credentialHasPermission(credential: PlatformCredential, permission: string): boolean {
  if (credential.scopes !== undefined) {
    return credential.scopes.includes("*") || credential.scopes.includes(permission) || credential.scopes.includes(`${permission.split(".")[0] ?? permission}.*`);
  }
  if (credential.roles === undefined) return true;
  return credential.roles.some((role) => ROLE_PERMISSIONS[role]?.some((allowed) => allowed === "*" || allowed === permission || (allowed.endsWith(".*") && permission.startsWith(allowed.slice(0, -1)))) === true);
}
