#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { createClient } from "redis";
import {
  PlatformStore,
  PostgresPlatformPersistence,
  PostgresPlatformStorePersistence,
  RedisRateLimiter,
  RedisTokenQuotaProvider,
} from "@yujian/platform-api";
import { createOpenBaoSecretResolver } from "../../infra/p2/runtime/platform-runtime.mjs";

function required(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${name} must be set`);
  return value;
}

function json(value) {
  return JSON.stringify(value);
}

const phase = process.env.YUJIAN_P2_PHASE ?? "all";
const databaseUrl = required("YUJIAN_DATABASE_URL");
const redisUrl = required("YUJIAN_REDIS_URL");
const kmsAddresses = required("YUJIAN_KMS_ADDR").split(",").map((value) => value.trim()).filter(Boolean);
const kmsAdminToken = required("YUJIAN_KMS_ADMIN_TOKEN");
const kmsRuntimeToken = required("YUJIAN_KMS_TOKEN");
const apiBase = required("YUJIAN_PLATFORM_BASE_URL").replace(/\/$/u, "");
const apiCredential = required("YUJIAN_P2_API_CREDENTIAL");
const scope = {
  tenantId: required("YUJIAN_P2_TENANT_ID"),
  projectId: required("YUJIAN_P2_PROJECT_ID"),
  environmentId: required("YUJIAN_P2_ENVIRONMENT_ID"),
};
const reportPath = required("YUJIAN_P2_REPORT");
const priorReport = phase === "api" ? JSON.parse(await readFile(reportPath, "utf8")) : undefined;
const runId = priorReport?.runId ?? `p2-${new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
const deferKmsDelete = process.env.YUJIAN_P2_DEFER_KMS_DELETE === "true";
const pool = new pg.Pool({ connectionString: databaseUrl, max: 8 });
const redisClients = [createClient({ url: redisUrl }), createClient({ url: redisUrl })];
for (const client of redisClients) client.on("error", () => undefined);
await Promise.all(redisClients.map((client) => client.connect()));
const evalClient = (client) => ({ eval: (script, keys, args) => client.eval(script, { keys: [...keys], arguments: [...args] }) });
const postgres = new PostgresPlatformPersistence(pool);
const storePersistence = new PostgresPlatformStorePersistence(pool);
const results = priorReport?.results ?? {};
const cleanup = priorReport?.cleanup ?? { auditId: undefined, outboxId: undefined, usageId: undefined, snapshotWasEmpty: false, apiKeyId: undefined, redisSentinelKey: undefined };

async function apiFetch(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${apiCredential}`, "content-type": "application/json", ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(5_000),
  });
  let payload;
  try { payload = await response.json(); } catch { payload = undefined; }
  return { status: response.status, payload };
}

async function testPostgresTransactionAndCas() {
  const id = randomUUID();
  const syntheticScope = { tenantId: `p2-tx-${id.slice(0, 12)}`, projectId: `p2-tx-${id.slice(13, 25)}`, environmentId: `p2-tx-${id.slice(26, 38)}` };
  const occurredAt = new Date().toISOString();
  const auditId = `p2-audit-${id}`;
  const outboxId = `p2-outbox-${id}`;
  const usageId = `p2-usage-${id}`;
  const audit = {
    auditEventId: auditId,
    ...syntheticScope,
    actorType: "system",
    actorId: "p2-production-acceptance",
    action: "p2.acceptance.transaction",
    resourceType: "p2-acceptance",
    resourceId: id,
    requestId: id,
    result: "success",
    riskLevel: "low",
    occurredAt,
    details: { runId },
  };
  const outbox = {
    eventId: outboxId,
    aggregateType: "p2-acceptance",
    aggregateId: auditId,
    eventType: "yujian.p2.acceptance",
    schemaVersion: "1",
    producer: "p2-production-acceptance",
    ...syntheticScope,
    resource: { type: "p2-acceptance", id },
    payload: { runId },
    occurredAt,
    dedupeKey: `p2-acceptance:${id}`,
    attemptCount: 0,
  };
  const usage = {
    usageRecordId: usageId,
    ...syntheticScope,
    resourceType: "p2-acceptance",
    resourceId: id,
    metric: "acceptance_probe",
    quantity: 1,
    unit: "probe",
    windowStart: occurredAt,
    windowEnd: new Date(Date.now() + 60_000).toISOString(),
    source: "p2-production-acceptance",
    dedupeKey: `p2-acceptance:${id}`,
  };
  const transaction = await postgres.begin();
  await transaction.recordUsage(usage);
  await transaction.insertAuditAndOutbox(audit, outbox);
  await transaction.commit();
  const visible = await pool.query(
    "SELECT (SELECT count(*) FROM usage_records WHERE usage_record_id = $1) AS usage_count, (SELECT count(*) FROM audit_events WHERE audit_event_id = $2) AS audit_count, (SELECT count(*) FROM outbox_events WHERE event_id = $3) AS outbox_count",
    [usageId, auditId, outboxId],
  );
  const counts = Object.values(visible.rows[0] ?? {}).map(Number);
  if (!counts.every((value) => value === 1)) throw new Error(`transaction outbox visibility failed: ${json(visible.rows[0])}`);

  const beforeSnapshot = await storePersistence.load();
  if (beforeSnapshot !== undefined) throw new Error("CAS acceptance requires an empty platform snapshot; refusing to overwrite existing state");
  cleanup.snapshotWasEmpty = true;
  const seed = new PlatformStore();
  seed.seed({ scope, endpoint: "ws://p2-acceptance.invalid" });
  seed.seed({ scope: syntheticScope, endpoint: "ws://p2-acceptance.invalid" });
  const first = new PostgresPlatformStorePersistence(pool);
  const stale = new PostgresPlatformStorePersistence(pool);
  await first.load();
  await stale.load();
  await first.save(seed.snapshot());
  let staleRejected = false;
  try { await stale.save(seed.snapshot()); } catch (error) { staleRejected = error instanceof Error && /version conflict/u.test(error.message); }
  if (!staleRejected) throw new Error("stale platform store writer was not rejected");
  results.postgres = { transaction: "committed", outbox: "visible", cas: "stale-writer-rejected" };
  cleanup.auditId = auditId;
  cleanup.outboxId = outboxId;
  cleanup.usageId = usageId;
}

async function testRedisCompetition() {
  const rateKey = `p2:rate:${runId}`;
  const limit = 20;
  const limiters = redisClients.map((client) => new RedisRateLimiter(evalClient(client), limit, 60_000));
  const decisions = await Promise.all(Array.from({ length: 100 }, (_, index) => limiters[index % limiters.length].check(rateKey)));
  const allowed = decisions.filter((decision) => decision.allowed).length;
  if (allowed !== limit) throw new Error(`Redis fixed-window race exceeded limit: ${allowed}/${limit}`);

  const quota = new RedisTokenQuotaProvider(evalClient(redisClients[0]));
  const policy = {
    maxTokenRequestsPerMinute: 40,
    maxConcurrentTokenRequests: 3,
  };
  const quotaScope = { ...scope, environmentId: `p2-quota-${runId.slice(-12)}` };
  const reservations = await Promise.allSettled(Array.from({ length: 30 }, () => quota.reserve(quotaScope, policy)));
  const successful = reservations.filter((item) => item.status === "fulfilled");
  if (successful.length > policy.maxConcurrentTokenRequests) throw new Error(`Redis concurrent quota exceeded: ${successful.length}`);
  for (const item of successful) await item.value();
  const afterRelease = await quota.reserve(quotaScope, policy);
  await afterRelease();
  results.redis = { rateLimit: { allowed, limit }, tokenQuota: { successful: successful.length, maxConcurrent: policy.maxConcurrentTokenRequests, release: "no-leak" } };
  cleanup.redisSentinelKey = `p2:restart:${runId}`;
  await redisClients[0].set(cleanup.redisSentinelKey, randomBytes(32).toString("hex"), { EX: 900 });
}

async function testKmsAndSecretBoundary() {
  const secretRef = `yujian/p2/acceptance/${runId}`;
  const secret = randomBytes(32);
  if (kmsAddresses.length < 3 || kmsAddresses.some((address) => !address.startsWith("https://"))) {
    throw new Error("KMS production acceptance requires three HTTPS addresses");
  }
  const health = [];
  for (const address of kmsAddresses) {
    const response = await fetch(`${address.replace(/\/$/u, "")}/v1/sys/health?standbyok=true&perfstandbyok=true`, { signal: AbortSignal.timeout(5_000) });
    if (![200, 429, 472, 473].includes(response.status)) throw new Error(`KMS health failed at ${address}: HTTP ${response.status}`);
    health.push({ address, status: response.status });
  }
  let primary;
  for (const address of kmsAddresses) {
    const write = await fetch(`${address.replace(/\/$/u, "")}/v1/kv/data/${secretRef}`, {
      method: "POST",
      headers: { "X-Vault-Token": kmsAdminToken, "content-type": "application/json" },
      body: json({ data: { value: secret.toString("base64") } }),
      signal: AbortSignal.timeout(5_000),
    });
    if (write.ok) { primary = address; break; }
  }
  if (primary === undefined) throw new Error("KMS acceptance write failed on every HA address");
  try {
    const resolved = await createOpenBaoSecretResolver(kmsAddresses.join(","), kmsRuntimeToken).resolve(secretRef);
    if (Buffer.compare(Buffer.from(resolved), secret) !== 0) throw new Error("KMS resolver round-trip mismatch");
    results.kms = { addresses: kmsAddresses.length, health, secretBytes: resolved.byteLength, tls: true, secretBoundary: "runtime-token-read-only" };
    cleanup.kmsSecretRef = secretRef;
    cleanup.kmsSecretHash = createHash("sha256").update(secret).digest("hex");
  } finally {
    if (!deferKmsDelete) {
      await fetch(`${primary.replace(/\/$/u, "")}/v1/kv/metadata/${secretRef}`, { method: "DELETE", headers: { "X-Vault-Token": kmsAdminToken }, signal: AbortSignal.timeout(5_000) }).catch(() => undefined);
    }
  }
}

async function testApiKeyLifecycle() {
  const environmentPath = `/platform/v1/environments/${scope.environmentId}`;
  const seeded = await apiFetch(environmentPath);
  if (seeded.status !== 200) throw new Error(`production platform-api did not restore seeded environment: HTTP ${seeded.status}`);
  const created = await apiFetch(`${environmentPath}/api-keys`, { method: "POST", headers: { "idempotency-key": `${runId}:create` }, body: json({ scopes: ["rtc.token.issue"] }) });
  if (created.status !== 201) throw new Error(`API key create failed: HTTP ${created.status} ${json(created.payload)}`);
  const createdData = created.payload?.data;
  const oldSecret = createdData?.secret;
  const apiKeyId = createdData?.metadata?.apiKeyId;
  if (typeof oldSecret !== "string" || typeof apiKeyId !== "string") throw new Error("API key create response omitted one-time secret or metadata");
  cleanup.apiKeyId = apiKeyId;
  const oldAccess = await apiFetch(environmentPath, { headers: { authorization: `Bearer ${oldSecret}` } });
  if (oldAccess.status !== 200) throw new Error(`new API key was not accepted: HTTP ${oldAccess.status}`);
  const rotated = await apiFetch(`/platform/v1/api-keys/${apiKeyId}:rotate`, { method: "POST", headers: { "idempotency-key": `${runId}:rotate` } });
  if (rotated.status !== 200 || typeof rotated.payload?.data?.secret !== "string") throw new Error(`API key rotate failed: HTTP ${rotated.status}`);
  const newSecret = rotated.payload.data.secret;
  const oldGrace = await apiFetch(environmentPath, { headers: { authorization: `Bearer ${oldSecret}` } });
  const newAccess = await apiFetch(environmentPath, { headers: { authorization: `Bearer ${newSecret}` } });
  if (oldGrace.status !== 200 || newAccess.status !== 200) throw new Error(`API key grace propagation failed: old=${oldGrace.status}, new=${newAccess.status}`);
  const revoked = await apiFetch(`/platform/v1/api-keys/${apiKeyId}:revoke`, { method: "POST", headers: { "idempotency-key": `${runId}:revoke` } });
  if (revoked.status !== 200 || revoked.payload?.data?.status !== "revoked") throw new Error(`API key revoke failed: HTTP ${revoked.status}`);
  const oldAfterRevoke = await apiFetch(environmentPath, { headers: { authorization: `Bearer ${oldSecret}` } });
  const newAfterRevoke = await apiFetch(environmentPath, { headers: { authorization: `Bearer ${newSecret}` } });
  if (oldAfterRevoke.status === 200 || newAfterRevoke.status === 200) throw new Error(`revoked API key remained usable: old=${oldAfterRevoke.status}, new=${newAfterRevoke.status}`);
  const listed = await apiFetch(`${environmentPath}/api-keys`);
  if (listed.status !== 200 || !listed.payload?.data?.apiKeys?.some((item) => item.apiKeyId === apiKeyId && item.status === "revoked")) throw new Error("revoked API key metadata was not persisted");
  const snapshot = await pool.query("SELECT snapshot::text AS body FROM platform_store_snapshots WHERE snapshot_id = 'default'");
  const body = String(snapshot.rows[0]?.body ?? "");
  if (body.includes(oldSecret) || body.includes(newSecret)) throw new Error("API key secret was persisted in platform snapshot");
  results.apiKey = { create: "one-time-secret", rotate: "old-and-new-grace-accepted", revoke: "old-and-new-rejected", secretPersistence: "absent" };
}

if (phase !== "api") {
  await testPostgresTransactionAndCas();
  await testRedisCompetition();
  await testKmsAndSecretBoundary();
}
if (phase !== "prepare") await testApiKeyLifecycle();
await writeFile(reportPath, `${json({ runId, scope, cleanup, results })}\n`, { mode: 0o600 });
console.log(json({ runId, results }));

await Promise.all(redisClients.map((client) => client.quit()));
await pool.end();
