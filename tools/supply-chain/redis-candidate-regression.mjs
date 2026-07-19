#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { createClient } from "redis";

import {
  RedisLeaseStore,
  RedisRateLimiter,
  RedisTokenQuotaProvider,
} from "../../services/platform-api/dist/index.js";

function required(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

const redisUrl = required("YUJIAN_REDIS_CANDIDATE_URL");
const runId = required("YUJIAN_REDIS_CANDIDATE_RUN_ID");
const phase = required("YUJIAN_REDIS_CANDIDATE_PHASE");
const reportPath = required("YUJIAN_REDIS_CANDIDATE_REPORT");
const cleanup = process.env.YUJIAN_REDIS_CANDIDATE_CLEANUP === "true";
if (!new Set(["initial", "post-restart", "post-rebuild"]).has(phase)) throw new Error("candidate phase is invalid");

const clients = [createClient({ url: redisUrl }), createClient({ url: redisUrl })];
for (const client of clients) client.on("error", () => undefined);
const evalClient = (client) => ({
  eval: (script, keys, args) => client.eval(script, { keys: [...keys], arguments: [...args] }),
});
const markerKey = `p1:m0-04:redis:${runId}:marker`;
const markerValue = `candidate-marker-${runId}`;

async function testCompetition() {
  const rateKey = `p1:m0-04:redis:${runId}:rate:${phase}`;
  const limit = 20;
  const limiters = clients.map((client) => new RedisRateLimiter(evalClient(client), limit, 60_000));
  const decisions = await Promise.all(
    Array.from({ length: 100 }, (_, index) => limiters[index % limiters.length].check(rateKey)),
  );
  const allowed = decisions.filter((decision) => decision.allowed).length;
  if (allowed !== limit) throw new Error(`fixed-window race allowed ${allowed}, expected ${limit}`);

  const fixedNow = Date.now();
  const environmentId = `p1-${runId}-${phase}`;
  const quotaProviders = clients.map(
    (client) => new RedisTokenQuotaProvider(evalClient(client), () => fixedNow),
  );
  const policy = { maxTokenRequestsPerMinute: 40, maxConcurrentTokenRequests: 3 };
  const scope = { tenantId: "p1-tenant", projectId: "p1-project", environmentId };
  const reservations = await Promise.allSettled(
    Array.from({ length: 30 }, (_, index) => quotaProviders[index % quotaProviders.length].reserve(scope, policy)),
  );
  const successful = reservations.filter((item) => item.status === "fulfilled");
  if (successful.length !== policy.maxConcurrentTokenRequests) {
    throw new Error(`token quota allowed ${successful.length}, expected ${policy.maxConcurrentTokenRequests}`);
  }
  for (const item of successful) {
    await item.value();
    await item.value();
  }
  const concurrentKey = `yujian:token:concurrent:${environmentId}`;
  if (Number(await clients[0].get(concurrentKey)) !== 0) throw new Error("token quota release leaked concurrency");
  const afterRelease = await quotaProviders[1].reserve(scope, policy);
  await afterRelease();
  if (Number(await clients[0].get(concurrentKey)) !== 0) throw new Error("post-release reservation leaked concurrency");

  const leaseKey = `p1:m0-04:redis:${runId}:lease:${phase}`;
  const leaseStores = clients.map((client) => new RedisLeaseStore(evalClient(client)));
  const firstLease = await leaseStores[0].acquire(leaseKey, 30_000);
  if (firstLease === undefined) throw new Error("first lease acquisition failed");
  if (await leaseStores[1].acquire(leaseKey, 30_000) !== undefined) throw new Error("competing lease was not rejected");
  if (!await firstLease.release()) throw new Error("lease owner could not release the lease");
  if (await firstLease.release()) throw new Error("lease release was not idempotent");
  const secondLease = await leaseStores[1].acquire(leaseKey, 30_000);
  if (secondLease === undefined || !await secondLease.release()) throw new Error("lease did not transfer after release");

  return {
    clients: clients.length,
    rateLimit: { attempts: decisions.length, allowed, limit },
    tokenQuota: {
      attempts: reservations.length,
      successful: successful.length,
      maxConcurrent: policy.maxConcurrentTokenRequests,
      release: "idempotent-no-leak",
    },
    lease: { competition: "single-owner", transferAfterRelease: true },
    cleanupKeys: {
      rateKey,
      requestKey: `yujian:token:requests:${environmentId}:${Math.floor(fixedNow / 60_000)}`,
      concurrentKey,
      leaseKey,
    },
  };
}

await Promise.all(clients.map((client) => client.connect()));
let report;
try {
  if (await clients[0].ping() !== "PONG") throw new Error("candidate Redis did not answer PING");
  const initialDbSize = await clients[0].dbSize();
  if (phase === "initial" && initialDbSize !== 0) throw new Error(`candidate Redis DB is not isolated: ${initialDbSize} keys`);
  if (phase !== "initial" && await clients[0].get(markerKey) !== markerValue) {
    throw new Error(`persistence marker missing during ${phase}`);
  }

  const competition = await testCompetition();
  let aofAcknowledgement;
  if (phase === "initial") {
    await clients[0].set(markerKey, markerValue);
    aofAcknowledgement = await clients[0].sendCommand(["WAITAOF", "1", "0", "5000"]);
    if (!Array.isArray(aofAcknowledgement) || Number(aofAcknowledgement[0]) < 1) {
      throw new Error("Redis did not acknowledge the local AOF write");
    }
  }

  for (const key of Object.values(competition.cleanupKeys)) await clients[0].del(key);
  if (cleanup) await clients[0].del(markerKey);
  const finalDbSize = await clients[0].dbSize();
  if (cleanup && finalDbSize !== 0) throw new Error(`candidate cleanup left ${finalDbSize} keys`);
  report = {
    schemaVersion: 1,
    taskId: "P1-M0-04-REDIS-CANDIDATE-REGRESSION",
    runId,
    phase,
    generatedAt: new Date().toISOString(),
    status: "passed",
    connection: { ping: "PONG", clients: clients.length, loopbackOnly: true },
    persistence: {
      markerPresentBeforePhase: phase !== "initial",
      ...(aofAcknowledgement === undefined ? {} : { waitAof: aofAcknowledgement.map(Number) }),
    },
    competition: {
      rateLimit: competition.rateLimit,
      tokenQuota: competition.tokenQuota,
      lease: competition.lease,
    },
    cleanup: { requested: cleanup, finalDbSize },
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
} finally {
  await Promise.all(clients.map((client) => client.isOpen ? client.quit() : undefined));
}

process.stdout.write(`${JSON.stringify(report)}\n`);
