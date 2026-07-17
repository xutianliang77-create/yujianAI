#!/usr/bin/env node
import { createHmac, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { chmod, open, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import pg from "pg";
import { RoomServiceClient } from "livekit-server-sdk";
import { runDataRightsClosure } from "./closure-data-rights.mjs";

const { Pool } = pg;
const required = (name) => {
  const value = process.env[name];
  if (!value || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${name} must be set`);
  return value;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = required("YUJIAN_PROJECT_ROOT");
const reportPath = required("YUJIAN_P2_CLOSURE_REPORT");
const apiBase = "http://127.0.0.1:18090";
let issuer = "";
let webhookBase = "";
const audience = "yujian-p2-platform";
const runId = `p2-closure-${new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
const adminCredential = randomBytes(32).toString("hex");
const bootstrapCredential = randomBytes(32).toString("hex");
const webhookSecret = randomBytes(32);
const webhookSecretRef = `yujian/p2/closure/${runId}/webhook`;
const pool = new Pool({ connectionString: required("YUJIAN_DATABASE_URL"), max: 6 });
const logPath = `${required("YUJIAN_DATA_ROOT")}/p2/platform-api-closure.log`;
const tlsKey = await readFile(required("YUJIAN_P2_TLS_KEY"));
const tlsCert = await readFile(required("YUJIAN_P2_TLS_CERT"));
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "p2-acceptance", use: "sig", alg: "RS256" };
let apiProcess;
let apiLog;

function token(subject, tenantId) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: jwk.kid })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ iss: issuer, aud: audience, sub: subject, exp: now + 600, nbf: now - 5, roles: ["tenant_owner"], ...(tenantId ? { tenant_id: tenantId } : {}) })).toString("base64url");
  const input = `${header}.${claims}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}

const identityServer = createHttpsServer({ key: tlsKey, cert: tlsCert }, (request, response) => {
  if (request.url === "/.well-known/openid-configuration") {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ issuer, jwks_uri: `${issuer}/jwks` }));
  } else if (request.url === "/jwks") {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ keys: [jwk] }));
  } else response.writeHead(404).end();
});

const receiver = { rules: new Map(), hits: new Map(), validSignatures: true, eventIds: new Map() };
const webhookServer = createHttpServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const path = request.url ?? "/";
  const expected = `sha256=${createHmac("sha256", webhookSecret).update(body).digest("hex")}`;
  receiver.validSignatures &&= request.headers["x-yujian-signature"] === expected;
  receiver.hits.set(path, (receiver.hits.get(path) ?? 0) + 1);
  const id = String(request.headers["x-yujian-event-id"] ?? "");
  const ids = receiver.eventIds.get(path) ?? [];
  ids.push(id); receiver.eventIds.set(path, ids);
  const rule = receiver.rules.get(path) ?? { failures: 0, alwaysFail: false };
  if ((rule.delayMs ?? 0) > 0) await sleep(rule.delayMs);
  if (rule.alwaysFail || rule.failures > 0) {
    if (rule.failures > 0) rule.failures -= 1;
    receiver.rules.set(path, rule);
    response.writeHead(503).end();
  } else response.writeHead(204).end();
});

async function listen(server, port) {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("acceptance server address is unavailable");
  return address.port;
}

async function stopServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function api(path, accessToken, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(8_000),
  });
  let payload;
  try { payload = await response.json(); } catch { payload = undefined; }
  return { status: response.status, payload };
}

async function waitFor(check, message, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(100);
  }
  throw new Error(message);
}

async function startApi() {
  apiLog = await open(logPath, "a", 0o600);
  apiProcess = spawn(process.execPath, [`${root}/services/platform-api/dist/main.js`], {
    cwd: root,
    detached: false,
    stdio: ["ignore", apiLog.fd, apiLog.fd],
    env: {
      ...process.env,
      NODE_ENV: "production",
      PLATFORM_API_HOST: "127.0.0.1",
      PLATFORM_API_PORT: "18090",
      LIVEKIT_URL: required("YUJIAN_P2_RTC_URL"),
      LIVEKIT_API_KEY: required("YUJIAN_P2_RTC_API_KEY"),
      LIVEKIT_API_SECRET: required("YUJIAN_P2_RTC_API_SECRET"),
      YUJIAN_PLATFORM_RUNTIME_MODULE: `${root}/infra/p2/runtime/platform-runtime.mjs`,
      YUJIAN_PLATFORM_CREDENTIALS_JSON: JSON.stringify([{ tenantId: "p2-bootstrap-tenant", projectId: "p2-bootstrap-project", environmentId: "p2-bootstrap-env", credential: bootstrapCredential, scopes: ["*"] }]),
      YUJIAN_PLATFORM_ADMIN_CREDENTIAL: adminCredential,
      YUJIAN_OIDC_ISSUER: issuer,
      YUJIAN_OIDC_AUDIENCE: audience,
      YUJIAN_OIDC_JWKS_URI: `${issuer}/jwks`,
      YUJIAN_OUTBOX_CLAIM_HEARTBEAT_MS: "100",
    },
  });
  await waitFor(async () => {
    if (apiProcess.exitCode !== null) throw new Error(`platform-api exited during startup with code ${apiProcess.exitCode}`);
    return fetch(`${apiBase}/healthz`, { signal: AbortSignal.timeout(500) }).then((response) => response.ok).catch(() => false);
  }, "platform-api did not start");
}

async function stopApi() {
  if (apiProcess?.exitCode === null) {
    apiProcess.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => apiProcess.once("exit", resolve)), sleep(5_000)]);
    if (apiProcess.exitCode === null) apiProcess.kill("SIGKILL");
  }
  await apiLog?.close();
  apiProcess = undefined;
  apiLog = undefined;
}

async function writeKmsSecret() {
  for (const address of required("YUJIAN_KMS_ADDR").split(",")) {
    const response = await fetch(`${address.replace(/\/$/u, "")}/v1/kv/data/${webhookSecretRef}`, {
      method: "POST",
      headers: { "X-Vault-Token": required("YUJIAN_KMS_ADMIN_TOKEN"), "content-type": "application/json" },
      body: JSON.stringify({ data: { value: webhookSecret.toString("base64") } }),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined);
    if (response?.ok) return;
  }
  throw new Error("OpenBao rejected the webhook acceptance secret");
}

async function deleteKmsSecret() {
  for (const address of required("YUJIAN_KMS_ADDR").split(",")) {
    const response = await fetch(`${address.replace(/\/$/u, "")}/v1/kv/metadata/${webhookSecretRef}`, {
      method: "DELETE",
      headers: { "X-Vault-Token": required("YUJIAN_KMS_ADMIN_TOKEN") },
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined);
    if (response?.ok || response?.status === 404) return;
  }
}

async function eventForRequest(requestId) {
  return waitFor(async () => (await pool.query(
    "SELECT o.* FROM outbox_events o JOIN audit_events a ON a.audit_event_id = o.aggregate_id WHERE a.request_id = $1",
    [requestId],
  )).rows[0], `outbox event for ${requestId} was not created`);
}

async function waitPublished(eventId) {
  return waitFor(async () => (await pool.query("SELECT * FROM outbox_events WHERE event_id = $1 AND published_at IS NOT NULL", [eventId])).rows[0], `outbox ${eventId} was not published`, 40_000);
}

function resetReceiver(stableRule, retryRule) {
  receiver.hits.clear(); receiver.eventIds.clear(); receiver.validSignatures = true;
  receiver.rules.set("/stable", { ...stableRule }); receiver.rules.set("/retry", { ...retryRule });
}

let cleanup = {};
const results = {};
try {
  issuer = `https://127.0.0.1:${await listen(identityServer, 0)}`;
  webhookBase = `http://127.0.0.1:${await listen(webhookServer, 0)}`;
  await writeKmsSecret();
  await startApi();

  const ownerSubject = `owner-${runId}`;
  const developerSubject = `developer-${runId}`;
  const otherSubject = `other-${runId}`;
  const onboard = await api("/platform/v1/onboarding", token(ownerSubject), {
    method: "POST", headers: { "idempotency-key": `${runId}:onboard` },
    body: JSON.stringify({ tenantDisplayName: "P2 acceptance tenant", projectName: "First project", projectSlug: `p2-${runId.slice(-8)}`, environmentName: "Development" }),
  });
  if (onboard.status !== 201) throw new Error(`OIDC onboarding failed with HTTP ${onboard.status}`);
  const { tenant, project, environment } = onboard.payload.data;
  const scope = { tenantId: tenant.tenantId, projectId: project.projectId, environmentId: environment.environmentId };
  cleanup = { runId, scope, otherTenantId: tenant.tenantId, webhookSecretRef };
  await writeFile(reportPath, `${JSON.stringify({ runId, status: "running", results, cleanup })}\n`, { mode: 0o600 });
  const ownerToken = token(ownerSubject, tenant.tenantId);
  const invitation = await api(`/platform/v1/tenants/${tenant.tenantId}/invitations`, ownerToken, {
    method: "POST", headers: { "idempotency-key": `${runId}:invite` },
    body: JSON.stringify({ subject: developerSubject, roles: ["developer"] }),
  });
  if (invitation.status !== 201 || invitation.payload?.data?.status !== "invited") throw new Error("tenant invitation was not persisted as invited");
  const memberId = invitation.payload.data.memberId;
  const accepted = await api(`/platform/v1/invitations/${memberId}:accept`, token(developerSubject, tenant.tenantId), { method: "POST" });
  if (accepted.status !== 200 || accepted.payload?.data?.status !== "active") throw new Error("OIDC invitation acceptance failed");
  const developerToken = token(developerSubject, tenant.tenantId);
  const escalation = await api(`/platform/v1/tenants/${tenant.tenantId}/invitations`, developerToken, {
    method: "POST", headers: { "idempotency-key": `${runId}:escalation` }, body: JSON.stringify({ subject: "forbidden-subject", roles: ["tenant_owner"] }),
  });
  if (escalation.status !== 403) throw new Error("persisted developer role did not override malicious OIDC role claims");
  const roomName = `p2-${runId.slice(-8)}`;
  const issued = await api("/platform/v1/rtc/token", developerToken, {
    method: "POST", body: JSON.stringify({ ...scope, roomName, participantIdentity: developerSubject, permissions: { canPublish: true, canSubscribe: true }, ttlSeconds: 60 }),
  });
  if (issued.status !== 201) throw new Error(`first Room token failed with HTTP ${issued.status}`);
  const roomService = new RoomServiceClient(required("YUJIAN_P2_RTC_URL").replace(/^ws/u, "http"), required("YUJIAN_P2_RTC_API_KEY"), required("YUJIAN_P2_RTC_API_SECRET"));
  const probePath = `${required("YUJIAN_DATA_ROOT")}/p2/client-probe-${runId}.json`;
  const probeResultPath = `${probePath}.result.json`;
  try {
    await writeFile(probePath, `${JSON.stringify({ url: issued.payload.data.url, token: issued.payload.data.token, roomName, participantIdentity: developerSubject })}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ event: "p2-client-probe-ready", path: probePath, resultPath: probeResultPath }));
    const clientResult = await waitFor(async () => readFile(probeResultPath, "utf8").then((body) => JSON.parse(body)).catch(() => undefined), "external P2 RTC client did not return a result", 90_000);
    if (clientResult.status !== "connected" || clientResult.participantIdentity !== developerSubject) throw new Error("external P2 RTC client result was invalid");
    const participants = await waitFor(async () => roomService.listParticipants(roomName).then((items) => items.length > 0 ? items : undefined), "onboarded OIDC member did not join the first real Room", 10_000);
    if (!participants.some((participant) => participant.identity === developerSubject)) throw new Error("first Room participant identity mismatch");
  } finally {
    await roomService.deleteRoom(roomName).catch(() => undefined);
    await rm(probePath, { force: true });
    await rm(probeResultPath, { force: true });
  }
  const other = await api("/platform/v1/onboarding", token(otherSubject), {
    method: "POST", headers: { "idempotency-key": `${runId}:other` },
    body: JSON.stringify({ tenantDisplayName: "Other tenant", projectName: "Other project", projectSlug: `other-${runId.slice(-8)}`, environmentName: "Development" }),
  });
  if (other.status !== 201) throw new Error("second tenant onboarding failed");
  cleanup = { ...cleanup, otherTenantId: other.payload.data.tenant.tenantId, memberId };
  await writeFile(reportPath, `${JSON.stringify({ runId, status: "running", results, cleanup })}\n`, { mode: 0o600 });
  const idor = await api(`/platform/v1/tenants/${other.payload.data.tenant.tenantId}`, ownerToken);
  if (idor.status !== 403) throw new Error(`cross-tenant IDOR was not denied: HTTP ${idor.status}`);
  await stopApi(); await startApi();
  if ((await api(`/platform/v1/tenants/${tenant.tenantId}`, ownerToken)).status !== 200) throw new Error("OIDC RBAC did not survive platform-api restart");
  results.p2_04 = { registration: "OIDC-verified", invitation: "accepted", onboarding: "tenant-project-environment", firstRoom: "real-participant-connected", persistedRbac: "restart-survived-token-claims-ignored", crossTenantIdor: "denied", audit: "durable" };

  for (const [id, path] of [[`stable-${runId.slice(-8)}`, "stable"], [`retry-${runId.slice(-8)}`, "retry"]]) {
    const response = await api(`/platform/v1/environments/${environment.environmentId}/webhooks/${id}`, ownerToken, {
      method: "PUT", body: JSON.stringify({ url: `${webhookBase}/${path}`, secretRef: webhookSecretRef, eventTypes: ["yujian.audit.recorded.v1"] }),
    });
    if (response.status !== 200) throw new Error(`webhook destination ${id} failed with HTTP ${response.status}`);
  }
  await waitFor(async () => Number((await pool.query("SELECT count(*) AS count FROM outbox_events WHERE published_at IS NULL AND dead_lettered_at IS NULL")).rows[0]?.count) === 0, "pre-existing outbox events did not drain");
  let version = environment.version;
  resetReceiver({ failures: 0, alwaysFail: false, delayMs: 350 }, { failures: 0, alwaysFail: false });
  const heartbeatRequest = `${runId}-claim-heartbeat`;
  let update = await api(`/platform/v1/environments/${environment.environmentId}`, ownerToken, { method: "PATCH", headers: { "x-request-id": heartbeatRequest }, body: JSON.stringify({ version, name: "Slow delivery heartbeat" }) });
  if (update.status !== 200) throw new Error("webhook heartbeat trigger failed"); version = update.payload.data.version;
  const heartbeatEvent = await eventForRequest(heartbeatRequest); await waitPublished(heartbeatEvent.event_id);
  const claimRenewals = Number((await pool.query("SELECT claim_renewal_count FROM outbox_events WHERE event_id = $1", [heartbeatEvent.event_id])).rows[0]?.claim_renewal_count);
  if (claimRenewals < 3) throw new Error("slow webhook delivery did not periodically renew outbox claim ownership");

  resetReceiver({ failures: 0, alwaysFail: false }, { failures: 1, alwaysFail: false });
  const partialRequest = `${runId}-partial`;
  update = await api(`/platform/v1/environments/${environment.environmentId}`, ownerToken, { method: "PATCH", headers: { "x-request-id": partialRequest }, body: JSON.stringify({ version, name: "Partial retry" }) });
  if (update.status !== 200) throw new Error("webhook partial-retry trigger failed"); version = update.payload.data.version;
  const partialEvent = await eventForRequest(partialRequest); await waitPublished(partialEvent.event_id);
  if (!receiver.validSignatures || receiver.hits.get("/stable") !== 1 || receiver.hits.get("/retry") !== 2) throw new Error("per-destination retry ledger or HMAC verification failed");

  resetReceiver({ failures: 0, alwaysFail: false }, { failures: 0, alwaysFail: true });
  const dlqRequest = `${runId}-dlq`;
  update = await api(`/platform/v1/environments/${environment.environmentId}`, ownerToken, { method: "PATCH", headers: { "x-request-id": dlqRequest }, body: JSON.stringify({ version, name: "Dead letter" }) });
  if (update.status !== 200) throw new Error("webhook DLQ trigger failed"); version = update.payload.data.version;
  const dlqEvent = await eventForRequest(dlqRequest);
  await waitFor(async () => (await pool.query("SELECT dead_lettered_at FROM outbox_events WHERE event_id = $1", [dlqEvent.event_id])).rows[0]?.dead_lettered_at, "webhook event did not enter DLQ", 45_000);
  receiver.rules.set("/retry", { failures: 0, alwaysFail: false });
  const requeued = await api(`/platform/v1/admin/outbox/${dlqEvent.event_id}:requeue`, adminCredential, { method: "POST" });
  if (requeued.status !== 200) throw new Error(`webhook requeue failed with HTTP ${requeued.status}`);
  await waitPublished(dlqEvent.event_id);
  if (receiver.hits.get("/stable") !== 1 || (receiver.hits.get("/retry") ?? 0) < 6) throw new Error("DLQ requeue redelivered an already acknowledged destination");

  await stopApi();
  const restartEventId = `p2-restart-${randomUUID()}`;
  await pool.query(
    `INSERT INTO outbox_events (event_id, aggregate_type, aggregate_id, event_type, schema_version, producer,
       tenant_id, project_id, environment_id, resource, payload, occurred_at, dedupe_key, trace_id,
       published_at, attempt_count, next_attempt_at, last_error, dead_lettered_at, claimed_until)
     SELECT $1, aggregate_type, aggregate_id, event_type, schema_version, producer, tenant_id, project_id,
       environment_id, resource, payload, now(), $2, trace_id, NULL, 1, now(), 'injected process-stop state', NULL, NULL
     FROM outbox_events WHERE event_id=$3`,
    [restartEventId, `${runId}:restart-recovery`, partialEvent.event_id],
  );
  await pool.query(
    "INSERT INTO webhook_deliveries (event_id, destination_id, delivered_at, updated_at) VALUES ($1,$2,now(),now())",
    [restartEventId, `stable-${runId.slice(-8)}`],
  );
  resetReceiver({ failures: 0, alwaysFail: false }, { failures: 0, alwaysFail: false });
  await startApi(); await waitPublished(restartEventId);
  if (!receiver.validSignatures || (receiver.hits.get("/stable") ?? 0) !== 0 || receiver.hits.get("/retry") !== 1) throw new Error("platform-api restart did not honor the durable per-destination ledger");
  const deliveryRows = Number((await pool.query("SELECT count(*) AS count FROM webhook_deliveries WHERE event_id = ANY($1::text[])", [[partialEvent.event_id, dlqEvent.event_id, restartEventId]])).rows[0]?.count);
  if (deliveryRows !== 6) throw new Error(`webhook delivery ledger expected 6 rows, found ${deliveryRows}`);
  const secretRows = await pool.query("SELECT secret_ref, url FROM webhook_destinations WHERE tenant_id = $1", [tenant.tenantId]);
  if (JSON.stringify(secretRows.rows).includes(webhookSecret.toString("base64"))) throw new Error("webhook secret was persisted in PostgreSQL");
  results.p2_05 = { hmac: "verified", retry: "per-destination", claimHeartbeat: { status: "renewed", count: claimRenewals }, dlq: "terminal-after-five-attempts", requeue: "recovered", restart: "acknowledged-target-not-duplicated", deliveryLedgerRows: deliveryRows, secretPersistence: "reference-only" };

  const rights = await runDataRightsClosure({ api, pool, tenantId: tenant.tenantId, ownerToken, runId, waitFor });
  results.p2_06 = rights.result;
  cleanup = { runId, scope, otherTenantId: other.payload.data.tenant.tenantId, memberId, webhookSecretRef, ...rights.cleanup };
  const auditCount = Number((await pool.query("SELECT count(*) AS count FROM audit_events WHERE tenant_id = $1", [tenant.tenantId])).rows[0]?.count);
  if (auditCount < 8) throw new Error("durable acceptance audit trail is incomplete");
  await writeFile(reportPath, `${JSON.stringify({ runId, completedAt: new Date().toISOString(), results, cleanup, auditCount })}\n`, { mode: 0o600 });
  await chmod(reportPath, 0o600);
  console.log(JSON.stringify({ runId, p2_04: "passed", p2_05: "passed", dataRights: "passed", report: reportPath }));
} finally {
  await stopApi().catch(() => undefined);
  await stopServer(identityServer).catch(() => undefined);
  await stopServer(webhookServer).catch(() => undefined);
  await deleteKmsSecret().catch(() => undefined);
  await pool.end();
}
