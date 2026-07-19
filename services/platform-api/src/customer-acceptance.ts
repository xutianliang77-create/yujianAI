import { createHash, randomUUID } from "node:crypto";
import type { PlatformScopeV1 } from "@yujian/platform-contracts";
import type { SupportSqlPool } from "./postgres-support.js";

export type AcceptanceCheckStatus = "passed" | "failed" | "not-run";
export interface CustomerAcceptanceCheck {
  checkId: string;
  status: AcceptanceCheckStatus;
  evidenceRefs: readonly string[];
}
export interface CustomerAcceptanceInput {
  releaseDigest: string;
  checks: readonly CustomerAcceptanceCheck[];
}
export interface AcceptanceArtifactStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<{ uri: string }>;
}
export interface CustomerAcceptanceReport {
  reportId: string;
  tenantId: string;
  environmentId: string;
  releaseDigest: string;
  reportDigest: string;
  artifactUri: string;
  outcome: "passed" | "failed" | "incomplete";
  createdAt: string;
}

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const EVIDENCE = /^(?:evidence|https|s3|gs|oss):\/\/[^\s?#]+$/u;
function validate(input: CustomerAcceptanceInput): void {
  if (!DIGEST.test(input.releaseDigest) || input.checks.length === 0 || input.checks.length > 128) throw new Error("customer acceptance input is invalid");
  const ids = new Set<string>();
  for (const check of input.checks) {
    if (!/^[a-z][a-z0-9-]{2,63}$/u.test(check.checkId) || ids.has(check.checkId)) throw new Error("customer acceptance check id is invalid or duplicated");
    ids.add(check.checkId);
    if (!(["passed", "failed", "not-run"] as const).includes(check.status) || check.evidenceRefs.length > 32 || check.evidenceRefs.some((ref) => !EVIDENCE.test(ref))) throw new Error("customer acceptance check evidence is invalid");
    if (check.status === "passed" && check.evidenceRefs.length === 0) throw new Error("passed customer acceptance check requires evidence");
  }
}

function stableUri(value: string): boolean {
  try { const url = new URL(value); return ["https:", "s3:", "gs:", "oss:"].includes(url.protocol) && url.hostname !== "" && url.search === "" && url.hash === "" && url.username === "" && url.password === ""; }
  catch { return false; }
}

/** Creates immutable customer acceptance JSON and stores only its digest/URI in PostgreSQL. */
export class PostgresCustomerAcceptanceArchive {
  constructor(private readonly pool: SupportSqlPool, private readonly artifacts: AcceptanceArtifactStore, private readonly clock: () => number = Date.now) {}

  async archive(scope: PlatformScopeV1, input: CustomerAcceptanceInput): Promise<CustomerAcceptanceReport> {
    validate(input);
    const scoped = await this.pool.query<{ environment_id: string }>(
      "SELECT environment_id FROM environments WHERE environment_id=$1 AND tenant_id=$2 AND project_id=$3",
      [scope.environmentId, scope.tenantId, scope.projectId],
    );
    if (scoped.rows[0] === undefined) throw new Error("customer acceptance environment scope is invalid");
    const reportId = `acceptance-${randomUUID()}`;
    const createdAt = new Date(this.clock()).toISOString();
    const outcome = input.checks.some((check) => check.status === "failed") ? "failed" : input.checks.some((check) => check.status === "not-run") ? "incomplete" : "passed";
    const document = { schemaVersion: 1, reportId, tenantId: scope.tenantId, projectId: scope.projectId, environmentId: scope.environmentId, releaseDigest: input.releaseDigest, outcome, checks: input.checks, createdAt };
    const body = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8");
    const reportDigest = `sha256:${createHash("sha256").update(body).digest("hex")}`;
    const artifact = await this.artifacts.put(`acceptance/${scope.tenantId}/${scope.environmentId}/${reportId}.json`, body, "application/json");
    if (!stableUri(artifact.uri)) throw new Error("customer acceptance artifact URI is invalid");
    const result = await this.pool.query<{ report_id: string }>(
      `INSERT INTO customer_acceptance_reports
       (report_id,tenant_id,environment_id,release_digest,report_digest,artifact_uri,outcome,check_summary,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       ON CONFLICT (report_digest) DO NOTHING RETURNING report_id`,
      [reportId, scope.tenantId, scope.environmentId, input.releaseDigest, reportDigest, artifact.uri, outcome, JSON.stringify(Object.fromEntries(input.checks.map((check) => [check.checkId, check.status]))), createdAt],
    );
    if (result.rows[0] === undefined) throw new Error("customer acceptance report digest was already archived");
    return { reportId, tenantId: scope.tenantId, environmentId: scope.environmentId, releaseDigest: input.releaseDigest, reportDigest, artifactUri: artifact.uri, outcome, createdAt };
  }
}
