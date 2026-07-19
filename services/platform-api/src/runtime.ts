import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { PlatformServerDependencies } from "./server.js";
import type { PlatformApiConfig } from "./config.js";

export interface PlatformRuntimeModule {
  createPlatformRuntime?: (context: { config: PlatformApiConfig }) => PlatformServerDependencies | Promise<PlatformServerDependencies>;
  default?: PlatformServerDependencies | ((context: { config: PlatformApiConfig }) => PlatformServerDependencies | Promise<PlatformServerDependencies>);
}

function runtimeUrl(specifier: string): string {
  if (specifier.startsWith("file:")) return specifier;
  return pathToFileURL(resolve(specifier)).href;
}

/** Load deployment-owned PG/Redis/KMS adapters without bundling their credentials in platform-api. */
export async function loadPlatformRuntime(
  specifier: string | undefined,
  config: PlatformApiConfig,
): Promise<PlatformServerDependencies> {
  if (specifier === undefined || specifier.trim() === "") return {};
  const loaded = await import(runtimeUrl(specifier)) as PlatformRuntimeModule;
  const candidate = loaded.createPlatformRuntime ?? loaded.default;
  if (candidate === undefined) throw new Error("platform runtime module must export createPlatformRuntime or default");
  const dependencies = typeof candidate === "function" ? await candidate({ config }) : candidate;
  if (typeof dependencies !== "object" || dependencies === null || Array.isArray(dependencies)) throw new Error("platform runtime module returned invalid dependencies");
  if (dependencies.close !== undefined && typeof dependencies.close !== "function") throw new Error("platform runtime module returned an invalid close hook");
  const storePersistence = dependencies.storePersistence;
  if (storePersistence !== undefined && (typeof storePersistence !== "object" || storePersistence === null || typeof storePersistence.load !== "function" || typeof storePersistence.save !== "function")) {
    throw new Error("platform runtime module returned invalid storePersistence adapter");
  }
  const persistence = dependencies.persistence;
  if (persistence !== undefined && (typeof persistence !== "object" || persistence === null || typeof persistence.getEnvironment !== "function" || typeof persistence.quotaSnapshot !== "function" || typeof persistence.begin !== "function" || typeof persistence.claimOutbox !== "function" || typeof persistence.renewOutboxClaim !== "function" || typeof persistence.markOutboxPublished !== "function")) {
    throw new Error("platform runtime module returned invalid platform persistence adapter");
  }
  if (persistence !== undefined && ((persistence.listUsage !== undefined && typeof persistence.listUsage !== "function") || (persistence.listAudit !== undefined && typeof persistence.listAudit !== "function"))) {
    throw new Error("platform runtime module returned invalid durable usage/audit reader");
  }
  const identity = dependencies.identity;
  if (identity !== undefined && (typeof identity !== "object" || identity === null || typeof identity.authenticate !== "function")) {
    throw new Error("platform runtime module returned invalid identity provider");
  }
  if (identity?.authenticateSubject !== undefined && typeof identity.authenticateSubject !== "function") {
    throw new Error("platform runtime module returned invalid identity subject verifier");
  }
  const outboxReplay = dependencies.outboxReplay;
  if (outboxReplay !== undefined && (typeof outboxReplay !== "object" || outboxReplay === null || typeof outboxReplay.requeueDeadLetter !== "function")) {
    throw new Error("platform runtime module returned invalid outbox replay service");
  }
  const outboxWorker = dependencies.outboxWorker;
  if (outboxWorker !== undefined && (typeof outboxWorker !== "object" || outboxWorker === null || typeof outboxWorker.start !== "function" || typeof outboxWorker.stop !== "function")) {
    throw new Error("platform runtime module returned invalid outbox worker");
  }
  const webhookDestinations = dependencies.webhookDestinations;
  if (webhookDestinations !== undefined && (typeof webhookDestinations !== "object" || webhookDestinations === null || typeof webhookDestinations.list !== "function" || typeof webhookDestinations.get !== "function" || typeof webhookDestinations.upsert !== "function" || typeof webhookDestinations.disable !== "function")) {
    throw new Error("platform runtime module returned invalid webhook destination persistence");
  }
  const telemetryPersistence = dependencies.telemetryPersistence;
  if (telemetryPersistence !== undefined && (typeof telemetryPersistence !== "object" || telemetryPersistence === null || typeof telemetryPersistence.append !== "function" || typeof telemetryPersistence.summarize !== "function")) {
    throw new Error("platform runtime module returned invalid telemetry persistence");
  }
  const rtcCapacity = dependencies.rtcCapacity;
  if (rtcCapacity !== undefined && (typeof rtcCapacity !== "object" || rtcCapacity === null
    || typeof rtcCapacity.publish !== "function" || typeof rtcCapacity.reserve !== "function")) {
    throw new Error("platform runtime module returned invalid RTC capacity provider");
  }
  const turnCredentials = dependencies.turnCredentials;
  if (turnCredentials !== undefined && (typeof turnCredentials !== "object" || turnCredentials === null || typeof turnCredentials.issue !== "function")) {
    throw new Error("platform runtime module returned invalid TURN credential issuer");
  }
  const entitlements = dependencies.entitlements;
  if (entitlements !== undefined && (typeof entitlements !== "object" || entitlements === null || typeof entitlements.get !== "function" || typeof entitlements.upsert !== "function" || typeof entitlements.authorize !== "function")) {
    throw new Error("platform runtime module returned invalid entitlement service");
  }
  const support = dependencies.support;
  if (support !== undefined && (typeof support !== "object" || support === null || typeof support.create !== "function" || typeof support.list !== "function" || typeof support.get !== "function" || typeof support.getById !== "function" || typeof support.update !== "function" || typeof support.registerBundle !== "function" || typeof support.getBundle !== "function" || typeof support.issueAccess !== "function" || typeof support.consumeAccess !== "function" || typeof support.revokeAccess !== "function")) {
    throw new Error("platform runtime module returned invalid support service");
  }
  const remoteAssistance = dependencies.remoteAssistance;
  if (remoteAssistance !== undefined && (typeof remoteAssistance !== "object" || remoteAssistance === null || typeof remoteAssistance.begin !== "function" || typeof remoteAssistance.record !== "function" || typeof remoteAssistance.end !== "function")) {
    throw new Error("platform runtime module returned invalid remote assistance service");
  }
  return dependencies;
}
