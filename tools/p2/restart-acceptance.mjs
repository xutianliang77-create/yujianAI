#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import pg from "pg";
import { createClient } from "redis";

function required(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${name} must be set`);
  return value;
}

const report = JSON.parse(await readFile(required("YUJIAN_P2_REPORT"), "utf8"));
const base = required("YUJIAN_PLATFORM_BASE_URL").replace(/\/$/u, "");
const credential = required("YUJIAN_P2_API_CREDENTIAL");
const environmentId = required("YUJIAN_P2_ENVIRONMENT_ID");
const cleanup = process.env.YUJIAN_P2_CLEANUP === "true";
const response = await fetch(`${base}/platform/v1/environments/${environmentId}/api-keys`, { headers: { authorization: `Bearer ${credential}` }, signal: AbortSignal.timeout(5_000) });
if (!response.ok) throw new Error(`platform-api restart check failed: HTTP ${response.status}`);
const payload = await response.json();
const found = payload?.data?.apiKeys?.find((item) => item.apiKeyId === report.cleanup.apiKeyId);
if (found?.status !== "revoked") throw new Error("revoked API key metadata did not survive platform-api restart");

const client = createClient({ url: required("YUJIAN_REDIS_URL") });
client.on("error", () => undefined);
await client.connect();
const sentinel = await client.get(report.cleanup.redisSentinelKey);
if (sentinel === null) throw new Error("Redis AOF sentinel did not survive container rebuild");
if (cleanup) await client.del(report.cleanup.redisSentinelKey);
await client.quit();

const pool = new pg.Pool({ connectionString: required("YUJIAN_DATABASE_URL"), max: 2 });
const migrations = await pool.query("SELECT count(*)::int AS count FROM yujian_schema_migrations");
if (Number(migrations.rows[0]?.count) !== 11) throw new Error("PostgreSQL migration state did not survive restart");
if (cleanup) {
  await pool.query("DELETE FROM platform_store_snapshots WHERE snapshot_id = 'default'");
  await pool.query("DELETE FROM outbox_events WHERE event_id = $1", [report.cleanup.outboxId]);
  await pool.query("DELETE FROM audit_events WHERE audit_event_id = $1", [report.cleanup.auditId]);
  await pool.query("DELETE FROM usage_records WHERE usage_record_id = $1", [report.cleanup.usageId]);
}
await pool.end();
console.log(JSON.stringify({ platformApi: "snapshot-restored", redis: "sentinel-restored-after-rebuild", postgres: "9-migrations-restored", cleanup: cleanup ? "complete" : "deferred" }));
