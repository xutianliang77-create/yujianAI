#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
};
const reportPath = required("YUJIAN_P2_CLOSURE_REPORT");
const report = JSON.parse(await readFile(reportPath, "utf8"));
const tenantIds = [report.cleanup.scope.tenantId, report.cleanup.otherTenantId, "p2-bootstrap-tenant"];
const pool = new Pool({ connectionString: required("YUJIAN_DATABASE_URL"), max: 2 });
const connection = await pool.connect();
try {
  await connection.query("BEGIN");
  const current = await connection.query("SELECT snapshot, version FROM platform_store_snapshots WHERE snapshot_id = 'default' FOR UPDATE");
  const row = current.rows[0];
  if (row !== undefined) {
    const snapshot = row.snapshot;
    const projects = snapshot.projects.filter((value) => !tenantIds.includes(value.tenantId));
    const environments = snapshot.environments.filter((value) => !tenantIds.includes(value.tenantId));
    const quotaIds = new Set(snapshot.environments.filter((value) => tenantIds.includes(value.tenantId)).map((value) => value.quotaPolicyId));
    const apiKeyIds = new Set(snapshot.apiKeys.filter((value) => tenantIds.includes(value.tenantId)).map((value) => value.apiKeyId));
    const cleaned = {
      ...snapshot,
      tenants: snapshot.tenants.filter((value) => !tenantIds.includes(value.tenantId)),
      members: snapshot.members.filter((value) => !tenantIds.includes(value.tenantId)),
      projects,
      environments,
      quotas: snapshot.quotas.filter((value) => !quotaIds.has(value.quotaPolicyId)),
      apiKeys: snapshot.apiKeys.filter((value) => !apiKeyIds.has(value.apiKeyId)),
      usage: snapshot.usage.filter((value) => !tenantIds.includes(value.tenantId)),
      audits: snapshot.audits.filter((value) => value.tenantId === undefined || !tenantIds.includes(value.tenantId)),
      outbox: snapshot.outbox.filter((value) => value.tenantId === undefined || !tenantIds.includes(value.tenantId)),
      apiKeySecretHashes: snapshot.apiKeySecretHashes.filter((value) => !apiKeyIds.has(value.apiKeyId)),
      apiKeyGraceHashes: snapshot.apiKeyGraceHashes.filter((value) => !apiKeyIds.has(value.apiKeyId)),
      tokenWindows: snapshot.tokenWindows.filter((value) => environments.some((environment) => environment.environmentId === value.environmentId)),
      idempotency: (snapshot.idempotency ?? []).filter((value) => !value.cacheKey.includes(report.runId) && !tenantIds.some((tenantId) => JSON.stringify(value.value ?? "").includes(tenantId))),
    };
    await connection.query("UPDATE platform_store_snapshots SET snapshot = $1::jsonb, version = version + 1, updated_at = now() WHERE snapshot_id = 'default' AND version = $2", [cleaned, row.version]);
  }
  await connection.query("DELETE FROM data_subject_records WHERE tenant_id = ANY($1::text[])", [tenantIds]);
  await connection.query("DELETE FROM data_subject_requests WHERE tenant_id = ANY($1::text[])", [tenantIds]);
  await connection.query("DELETE FROM webhook_destinations WHERE tenant_id = ANY($1::text[])", [tenantIds]);
  await connection.query("DELETE FROM outbox_events WHERE tenant_id = ANY($1::text[])", [tenantIds]);
  await connection.query("DELETE FROM audit_events WHERE tenant_id = ANY($1::text[])", [tenantIds]);
  await connection.query("DELETE FROM usage_records WHERE tenant_id = ANY($1::text[])", [tenantIds]);
  await connection.query("DELETE FROM api_keys WHERE tenant_id = ANY($1::text[])", [tenantIds]);
  const quotaRows = await connection.query("SELECT quota_policy_id FROM environments WHERE tenant_id = ANY($1::text[])", [tenantIds]);
  await connection.query("DELETE FROM tenant_members WHERE tenant_id = ANY($1::text[])", [tenantIds]);
  await connection.query("DELETE FROM environments WHERE tenant_id = ANY($1::text[])", [tenantIds]);
  await connection.query("DELETE FROM projects WHERE tenant_id = ANY($1::text[])", [tenantIds]);
  if (quotaRows.rows.length > 0) await connection.query("DELETE FROM quota_policies WHERE quota_policy_id = ANY($1::text[])", [quotaRows.rows.map((value) => value.quota_policy_id)]);
  await connection.query("DELETE FROM tenants WHERE tenant_id = ANY($1::text[])", [tenantIds]);
  await connection.query("COMMIT");
} catch (error) {
  await connection.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  connection.release();
  await pool.end();
}

for (const address of required("YUJIAN_KMS_ADDR").split(",")) {
  const response = await fetch(`${address.replace(/\/$/u, "")}/v1/kv/metadata/${report.cleanup.webhookSecretRef}`, {
    method: "DELETE", headers: { "X-Vault-Token": required("YUJIAN_KMS_ADMIN_TOKEN") }, signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);
  if (response?.ok || response?.status === 404) break;
}
report.cleanup = { ...report.cleanup, status: "complete", completedAt: new Date().toISOString() };
await writeFile(reportPath, `${JSON.stringify(report)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ runId: report.runId, cleanup: "complete" }));
