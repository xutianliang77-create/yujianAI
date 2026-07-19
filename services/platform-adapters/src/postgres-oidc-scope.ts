import type { PlatformRoleV1 } from "@yujian/platform-contracts";
import type { OidcPlatformScope, OidcPlatformScopeResolver } from "./oidc-identity.js";

export interface OidcScopeSqlResult<Row extends object> { rows: readonly Row[] }
export interface OidcScopeSqlPool {
  query<Row extends object>(text: string, values?: readonly unknown[]): Promise<OidcScopeSqlResult<Row>>;
}

type SnapshotRow = { snapshot: unknown };
type RecordValue = Record<string, unknown>;

const ROLES = new Set<PlatformRoleV1>([
  "tenant_owner", "tenant_admin", "developer", "billing_admin", "security_auditor",
  "support_operator", "private_deployment_admin",
]);

function records(value: unknown, field: string): RecordValue[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("OIDC platform snapshot is invalid");
  const collection = (value as RecordValue)[field];
  if (!Array.isArray(collection) || collection.some((item) => typeof item !== "object" || item === null || Array.isArray(item))) {
    throw new Error(`OIDC platform snapshot ${field} is invalid`);
  }
  return collection as RecordValue[];
}

/** Resolves verified subjects only from durable member roles; token role claims never grant platform authority. */
export class PostgresOidcPlatformScopeResolver implements OidcPlatformScopeResolver {
  constructor(private readonly pool: OidcScopeSqlPool) {}

  async resolve(identity: { subject: string; tenantId?: string; roles: readonly string[] }): Promise<OidcPlatformScope | undefined> {
    const result = await this.pool.query<SnapshotRow>("SELECT snapshot FROM platform_store_snapshots WHERE snapshot_id = 'default'");
    const snapshot = result.rows[0]?.snapshot;
    if (snapshot === undefined) return undefined;
    const members = records(snapshot, "members").filter((member) =>
      member.subject === identity.subject && member.status === "active" &&
      (identity.tenantId === undefined || member.tenantId === identity.tenantId));
    if (members.length !== 1) return undefined;
    const member = members[0]!;
    const tenantId = typeof member.tenantId === "string" ? member.tenantId : "";
    const roles = Array.isArray(member.roles)
      ? [...new Set(member.roles.filter((role): role is PlatformRoleV1 => typeof role === "string" && ROLES.has(role as PlatformRoleV1)))]
      : [];
    if (tenantId.length === 0 || roles.length === 0) return undefined;
    const projects = records(snapshot, "projects").filter((project) => project.tenantId === tenantId && project.status === "active");
    const environments = records(snapshot, "environments").filter((environment) =>
      environment.tenantId === tenantId && environment.status === "active" &&
      projects.some((project) => project.projectId === environment.projectId));
    environments.sort((left, right) => String(left.environmentId).localeCompare(String(right.environmentId)));
    const environment = environments[0];
    if (environment === undefined || typeof environment.projectId !== "string" || typeof environment.environmentId !== "string") return undefined;
    return { tenantId, projectId: environment.projectId, environmentId: environment.environmentId, roles };
  }
}
