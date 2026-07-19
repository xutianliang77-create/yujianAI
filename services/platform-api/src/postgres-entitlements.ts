import { randomUUID } from "node:crypto";
import type {
  EnvironmentEntitlementV1,
  PlatformScopeV1,
  PreviewFeatureV1,
  UpsertEnvironmentEntitlementRequestV1,
} from "@yujian/platform-contracts";

export class EntitlementError extends Error {
  constructor(readonly code: "NOT_FOUND" | "DENIED" | "CONFLICT", message: string) {
    super(message);
    this.name = "EntitlementError";
  }
}

export interface PlatformEntitlementService {
  get(scope: PlatformScopeV1): Promise<EnvironmentEntitlementV1>;
  upsert(scope: PlatformScopeV1, input: UpsertEnvironmentEntitlementRequestV1): Promise<EnvironmentEntitlementV1>;
  authorize(scope: PlatformScopeV1, feature: PreviewFeatureV1): Promise<EnvironmentEntitlementV1>;
}

export interface EntitlementSqlResult<Row extends object> { rows: readonly Row[] }
export interface EntitlementSqlPool { query<Row extends object>(text: string, values?: readonly unknown[]): Promise<EntitlementSqlResult<Row>> }

type EntitlementRow = {
  entitlement_id: string;
  tenant_id: string;
  project_id: string;
  environment_id: string;
  plan_id: string;
  status: EnvironmentEntitlementV1["status"];
  features: unknown;
  valid_from: string;
  valid_until: string;
  version: string | number;
  updated_at: string;
};

const FEATURES = new Set<PreviewFeatureV1>(["rtc", "turn", "telemetry", "agent", "ingress", "egress", "sip"]);

function timestamp(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`invalid entitlement ${field}`);
  return new Date(parsed).toISOString();
}

function fromRow(row: EntitlementRow | undefined): EnvironmentEntitlementV1 {
  if (row === undefined) throw new EntitlementError("NOT_FOUND", "Environment entitlement not found");
  if (!Array.isArray(row.features) || row.features.length === 0 || new Set(row.features).size !== row.features.length || row.features.some((feature) => typeof feature !== "string" || !FEATURES.has(feature as PreviewFeatureV1))) throw new Error("invalid entitlement features");
  const version = typeof row.version === "number" ? row.version : Number(row.version);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("invalid entitlement version");
  if (!["active", "suspended", "expired"].includes(row.status)) throw new Error("invalid entitlement status");
  return {
    entitlementId: row.entitlement_id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    planId: row.plan_id,
    status: row.status,
    features: [...row.features] as PreviewFeatureV1[],
    validFrom: timestamp(row.valid_from, "valid_from"),
    validUntil: timestamp(row.valid_until, "valid_until"),
    version,
    updatedAt: timestamp(row.updated_at, "updated_at"),
  };
}

export class PostgresEnvironmentEntitlementService implements PlatformEntitlementService {
  constructor(private readonly pool: EntitlementSqlPool, private readonly clock: () => number = Date.now) {}

  async get(scope: PlatformScopeV1): Promise<EnvironmentEntitlementV1> {
    const result = await this.pool.query<EntitlementRow>(
      "SELECT * FROM environment_entitlements WHERE tenant_id=$1 AND project_id=$2 AND environment_id=$3",
      [scope.tenantId, scope.projectId, scope.environmentId],
    );
    return fromRow(result.rows[0]);
  }

  async authorize(scope: PlatformScopeV1, feature: PreviewFeatureV1): Promise<EnvironmentEntitlementV1> {
    let entitlement: EnvironmentEntitlementV1;
    try { entitlement = await this.get(scope); }
    catch (error) {
      if (error instanceof EntitlementError && error.code === "NOT_FOUND") throw new EntitlementError("DENIED", `Environment entitlement does not allow ${feature}`);
      throw error;
    }
    const now = this.clock();
    if (entitlement.status !== "active" || Date.parse(entitlement.validFrom) > now || Date.parse(entitlement.validUntil) <= now || !entitlement.features.includes(feature)) {
      throw new EntitlementError("DENIED", `Environment entitlement does not allow ${feature}`);
    }
    return entitlement;
  }

  async upsert(scope: PlatformScopeV1, input: UpsertEnvironmentEntitlementRequestV1): Promise<EnvironmentEntitlementV1> {
    const now = new Date(this.clock()).toISOString();
    const result = await this.pool.query<EntitlementRow>(
      `INSERT INTO environment_entitlements
       (entitlement_id, tenant_id, project_id, environment_id, plan_id, status, features, valid_from, valid_until, version, updated_at)
       SELECT $1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,1,$10 WHERE $11::bigint = 0
       ON CONFLICT (environment_id) DO UPDATE SET
         plan_id=EXCLUDED.plan_id, status=EXCLUDED.status, features=EXCLUDED.features,
         valid_from=EXCLUDED.valid_from, valid_until=EXCLUDED.valid_until,
         version=environment_entitlements.version+1, updated_at=EXCLUDED.updated_at
       WHERE environment_entitlements.tenant_id=EXCLUDED.tenant_id
         AND environment_entitlements.project_id=EXCLUDED.project_id
         AND environment_entitlements.version=$11
       RETURNING *`,
      [`entitlement-${randomUUID()}`, scope.tenantId, scope.projectId, scope.environmentId, input.planId, input.status, JSON.stringify(input.features), input.validFrom, input.validUntil, now, input.expectedVersion],
    );
    if (result.rows[0] === undefined) throw new EntitlementError("CONFLICT", "Entitlement version conflict");
    return fromRow(result.rows[0]);
  }
}
