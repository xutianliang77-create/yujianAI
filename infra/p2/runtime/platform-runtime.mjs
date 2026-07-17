import { Buffer } from "node:buffer";
import pg from "pg";
import { createClient } from "redis";
import {
  OutboxPublisher,
  OutboxPublisherWorker,
  PersistentWebhookDestinationProvider,
  PostgresPlatformPersistence,
  PostgresPlatformResourceUsageProvider,
  PostgresPlatformStorePersistence,
  PostgresRtcTelemetryPersistence,
  PostgresWebhookDestinationPersistence,
  RedisRateLimiter,
  RedisTokenQuotaProvider,
} from "@yujian/platform-api";

const { Pool } = pg;

function required(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${name} must be set and control-free`);
  }
  return value;
}

function openBaoPath(secretRef) {
  if (!/^yujian\/[A-Za-z0-9._/-]{1,500}$/u.test(secretRef) || secretRef.includes("..")) {
    throw new Error("webhook secret reference must be a yujian KMS path");
  }
  return secretRef.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function createRedisEvalClient(client) {
  return {
    eval(script, keys, args) {
      return client.eval(script, { keys: [...keys], arguments: [...args] });
    },
  };
}

export function createOpenBaoSecretResolver(address, token) {
  return {
    async resolve(secretRef) {
      const response = await fetch(`${address.replace(/\/$/u, "")}/v1/kv/data/${openBaoPath(secretRef)}`, {
        headers: { "X-Vault-Token": token, accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(`KMS secret lookup failed with HTTP ${response.status}`);
      const payload = await response.json();
      const encoded = payload?.data?.data?.value;
      if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) throw new Error("KMS secret payload is invalid");
      const secret = Buffer.from(encoded, "base64");
      if (secret.length < 32) throw new Error("KMS secret is shorter than 32 bytes");
      return secret;
    },
  };
}

/** Beelink deployment runtime: PostgreSQL truth, Redis coordination, OpenBao secret boundary. */
export async function createPlatformRuntime({ config: _config }) {
  const pool = new Pool({ connectionString: required("YUJIAN_DATABASE_URL"), max: Number(process.env.YUJIAN_PG_POOL_MAX ?? 20) });
  const redis = createClient({ url: required("YUJIAN_REDIS_URL") });
  redis.on("error", () => undefined);
  await redis.connect();
  const redisEval = createRedisEvalClient(redis);
  const persistence = new PostgresPlatformPersistence(pool);
  const destinations = new PostgresWebhookDestinationPersistence(pool);
  const publisher = new OutboxPublisher(
    persistence,
    new PersistentWebhookDestinationProvider(destinations, createOpenBaoSecretResolver(required("YUJIAN_KMS_ADDR"), required("YUJIAN_KMS_TOKEN"))),
    { maxAttempts: 5, timeoutMs: 5_000, baseBackoffMs: 1_000 },
  );
  return {
    close: async () => {
      if (redis.isOpen) await redis.quit();
      await pool.end();
    },
    persistence,
    storePersistence: new PostgresPlatformStorePersistence(pool),
    resourceUsage: new PostgresPlatformResourceUsageProvider(pool),
    rateLimiter: new RedisRateLimiter(redisEval),
    tokenQuota: new RedisTokenQuotaProvider(redisEval),
    outboxReplay: publisher,
    outboxWorker: new OutboxPublisherWorker(publisher),
    webhookDestinations: destinations,
    telemetryPersistence: new PostgresRtcTelemetryPersistence(pool),
  };
}
