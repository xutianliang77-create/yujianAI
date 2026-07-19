import { Buffer } from "node:buffer";
import pg from "pg";
import { createClient } from "redis";
import { PostgresDataRightsExecutor, PostgresDataRightsService, PostgresDataRightsWorker } from "@yujian/data-rights";
import { PostgresBillingReadModel } from "@yujian/billing";
import { OidcIdentityAdapter, OidcPlatformIdentityBridge, PostgresOidcPlatformScopeResolver } from "@yujian/platform-adapters";
import { TurnCredentialIssuer } from "@yujian/livekit-compat";
import {
  OutboxPublisher,
  OutboxPublisherWorker,
  PersistentWebhookDestinationProvider,
  PostgresPlatformPersistence,
  PostgresEnvironmentEntitlementService,
  PostgresPlatformResourceUsageProvider,
  PostgresSupportService,
  PostgresRemoteAssistanceService,
  PostgresPlatformStorePersistence,
  PostgresRtcTelemetryPersistence,
  PostgresWebhookDestinationPersistence,
  RedisRateLimiter,
  RedisRtcCapacityProvider,
  RedisTokenQuotaProvider,
  RtcTelemetryRetentionWorker,
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

function kmsAddresses(address) {
  const addresses = address.split(",").map((value) => value.trim()).filter(Boolean);
  if (addresses.length === 0 || addresses.some((value) => !/^https?:\/\//u.test(value))) throw new Error("KMS address list is invalid");
  return addresses.map((value) => value.replace(/\/$/u, ""));
}

class CompositeWorker {
  constructor(workers) { this.workers = workers; }
  start() { for (const worker of this.workers) worker.start(); }
  async stop() { for (const worker of [...this.workers].reverse()) await worker.stop(); }
}

function createIdentity(pool) {
  const issuer = process.env.YUJIAN_OIDC_ISSUER;
  const audience = process.env.YUJIAN_OIDC_AUDIENCE;
  const jwksUri = process.env.YUJIAN_OIDC_JWKS_URI;
  if (issuer === undefined && audience === undefined && jwksUri === undefined) return undefined;
  if (!issuer || !audience) throw new Error("YUJIAN_OIDC_ISSUER and YUJIAN_OIDC_AUDIENCE must be set together");
  return new OidcPlatformIdentityBridge(
    new OidcIdentityAdapter({ issuer, audience, ...(jwksUri ? { jwksUri } : {}) }),
    new PostgresOidcPlatformScopeResolver(pool),
  );
}

export function createOpenBaoSecretResolver(address, token) {
  const addresses = kmsAddresses(address);
  return {
    async resolve(secretRef) {
      let lastError;
      for (const base of addresses) {
        try {
          const response = await fetch(`${base}/v1/kv/data/${openBaoPath(secretRef)}`, {
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
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error("KMS secret lookup failed");
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
  const secretResolver = createOpenBaoSecretResolver(required("YUJIAN_KMS_ADDR"), required("YUJIAN_KMS_TOKEN"));
  let turnCredentials;
  if (_config.requireTurnCredentials) {
    let urls;
    try { urls = JSON.parse(required("YUJIAN_TURN_URLS")); } catch { throw new Error("YUJIAN_TURN_URLS must be a JSON array"); }
    if (!Array.isArray(urls) || urls.some((value) => typeof value !== "string")) throw new Error("YUJIAN_TURN_URLS must be a JSON string array");
    turnCredentials = new TurnCredentialIssuer(await secretResolver.resolve(required("YUJIAN_TURN_SECRET_REF")), urls);
  }
  const dataRights = new PostgresDataRightsService(pool);
  const support = new PostgresSupportService(pool);
  const dataRightsExecutor = new PostgresDataRightsExecutor(pool, `${required("YUJIAN_DATA_ROOT")}/p2/data-rights`);
  const publisher = new OutboxPublisher(
    persistence,
    new PersistentWebhookDestinationProvider(destinations, secretResolver),
    { maxAttempts: 5, timeoutMs: 5_000, baseBackoffMs: 1_000, claimHeartbeatMs: Number(process.env.YUJIAN_OUTBOX_CLAIM_HEARTBEAT_MS ?? 20_000) },
  );
  const outboxWorker = new OutboxPublisherWorker(publisher);
  const dataRightsWorker = new PostgresDataRightsWorker(pool, dataRights, dataRightsExecutor);
  const telemetryRetentionWorker = new RtcTelemetryRetentionWorker(pool, {
    retentionDays: Number(process.env.YUJIAN_RTC_TELEMETRY_RETENTION_DAYS ?? 7),
    onError: (error) => console.error(JSON.stringify({ level: "error", message: "RTC telemetry retention failed", errorName: error instanceof Error ? error.name : "unknown" })),
  });
  return {
    close: async () => {
      if (redis.isOpen) await redis.quit();
      await pool.end();
    },
    persistence,
    identity: createIdentity(pool),
    dataRights,
    storePersistence: new PostgresPlatformStorePersistence(pool),
    resourceUsage: new PostgresPlatformResourceUsageProvider(pool),
    entitlements: new PostgresEnvironmentEntitlementService(pool),
    support,
    remoteAssistance: new PostgresRemoteAssistanceService(pool, support),
    billing: new PostgresBillingReadModel(pool),
    rateLimiter: new RedisRateLimiter(redisEval),
    tokenQuota: new RedisTokenQuotaProvider(redisEval),
    ...(_config.requireRtcCapacity ? { rtcCapacity: new RedisRtcCapacityProvider(redisEval) } : {}),
    ...(turnCredentials === undefined ? {} : { turnCredentials }),
    outboxReplay: publisher,
    outboxWorker: new CompositeWorker([outboxWorker, dataRightsWorker, telemetryRetentionWorker]),
    webhookDestinations: destinations,
    telemetryPersistence: new PostgresRtcTelemetryPersistence(pool),
  };
}
