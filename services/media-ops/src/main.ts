import { readFileSync } from "node:fs";
import { YujianMediaServiceAdapter } from "@yujian/livekit-compat";
import { createMediaOpsHttpsServer, createMediaOpsServer } from "./server.js";
import { MediaOpsLiveKitProvider } from "./livekit-adapter.js";
import { MediaOpsControl } from "./control.js";
import { loadMediaOpsRuntime } from "./runtime.js";
import { GovernedMediaOpsProvider } from "./governed-provider.js";

const credential = process.env.YUJIAN_MEDIA_INTERNAL_CREDENTIAL;
if (credential === undefined || credential.length < 32) throw new Error("YUJIAN_MEDIA_INTERNAL_CREDENTIAL must be at least 32 characters");
const providerCallbackCredential = process.env.YUJIAN_MEDIA_PROVIDER_CALLBACK_CREDENTIAL;
if (providerCallbackCredential !== undefined && providerCallbackCredential.length < 32) throw new Error("YUJIAN_MEDIA_PROVIDER_CALLBACK_CREDENTIAL must be at least 32 characters");
const port = Number(process.env.MEDIA_OPS_PORT ?? 8095);
const host = process.env.MEDIA_OPS_HOST ?? "127.0.0.1";
const enabled = (name: string, fallback: boolean): boolean => process.env[name] === undefined ? fallback : process.env[name] === "true";
const boundedInteger = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 100_000) throw new Error(`${name} must be an integer between 1 and 100000`);
  return value;
};
const options = {
  sipEnabled: enabled("YUJIAN_SIP_ENABLED", false),
  ingressEnabled: enabled("YUJIAN_INGRESS_ENABLED", true),
  egressEnabled: enabled("YUJIAN_EGRESS_ENABLED", false),
  maxActiveIngress: boundedInteger("YUJIAN_MEDIA_MAX_ACTIVE_INGRESS", 100),
  maxActiveEgress: boundedInteger("YUJIAN_MEDIA_MAX_ACTIVE_EGRESS", 100),
};
const defaultSipTrunkId = process.env.YUJIAN_SIP_DEFAULT_TRUNK_ID;
if (defaultSipTrunkId !== undefined && (defaultSipTrunkId.length === 0 || defaultSipTrunkId.length > 128 || defaultSipTrunkId.trim() !== defaultSipTrunkId)) {
  throw new Error("YUJIAN_SIP_DEFAULT_TRUNK_ID must be a trimmed non-empty identifier");
}
const providerEnabled = process.env.YUJIAN_MEDIA_PROVIDER_ENABLED === "true";
function createDevelopmentProvider(): MediaOpsLiveKitProvider | undefined {
  if (!providerEnabled) return undefined;
  const wsUrl = process.env.YUJIAN_RTC_PRIMARY_URL ?? process.env.LIVEKIT_URL;
  const apiKey = process.env.YUJIAN_RTC_API_KEY ?? process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.YUJIAN_RTC_API_SECRET ?? process.env.LIVEKIT_API_SECRET;
  if (wsUrl === undefined || apiKey === undefined || apiSecret === undefined) throw new Error("RTC URL/API key/API secret are required when media provider is enabled");
  const nodes = [{ id: "primary", wsUrl, apiKey, apiSecret }, ...(process.env.YUJIAN_RTC_SECONDARY_URL === undefined ? [] : [{ id: "secondary", wsUrl: process.env.YUJIAN_RTC_SECONDARY_URL, apiKey, apiSecret }])];
  return new MediaOpsLiveKitProvider(new YujianMediaServiceAdapter(nodes), { ingress: options.ingressEnabled, egress: options.egressEnabled, sip: options.sipEnabled }, defaultSipTrunkId);
}
const tlsCertFile = process.env.MEDIA_OPS_TLS_CERT_FILE;
const tlsKeyFile = process.env.MEDIA_OPS_TLS_KEY_FILE;
if ((tlsCertFile === undefined) !== (tlsKeyFile === undefined)) throw new Error("MEDIA_OPS_TLS_CERT_FILE and MEDIA_OPS_TLS_KEY_FILE must be set together");
const control = new MediaOpsControl(options);
const persistenceSpecifier = process.env.YUJIAN_MEDIA_PERSISTENCE_MODULE;
const serverPromise = loadMediaOpsRuntime(persistenceSpecifier).then(async (runtime) => {
  if (process.env.NODE_ENV === "production" && runtime.persistence === undefined) throw new Error("production media-ops requires a persistence adapter");
  let persistTail: Promise<void> = Promise.resolve();
  const persist = async (): Promise<void> => {
    if (runtime.persistence === undefined) return;
    const write = persistTail.catch(() => undefined).then(() => runtime.persistence!.save(control.snapshot()));
    persistTail = write;
    await write;
  };
  const retentionWorker = runtime.createRetentionWorker === undefined
    ? undefined
    : await runtime.createRetentionWorker({ control, persist });
  if (process.env.NODE_ENV === "production" && options.egressEnabled && retentionWorker === undefined) throw new Error("production media-ops with egress enabled requires a retention worker");
  const reconciliationWorker = runtime.createReconciliationWorker === undefined ? undefined : await runtime.createReconciliationWorker();
  const statusVerifier = runtime.createStatusVerifier === undefined ? undefined : await runtime.createStatusVerifier();
  const lifecycleObserver = runtime.createLifecycleObserver === undefined ? undefined : await runtime.createLifecycleObserver();
  const runtimeProvider = runtime.createProvider === undefined ? undefined : await runtime.createProvider({ features: { ingress: options.ingressEnabled, egress: options.egressEnabled, sip: options.sipEnabled } });
  const admission = runtime.createAdmission === undefined ? undefined : await runtime.createAdmission();
  const developmentProvider = process.env.NODE_ENV === "production" ? undefined : createDevelopmentProvider();
  const baseProvider = runtimeProvider ?? developmentProvider;
  const functions = (value: unknown, names: readonly string[]): boolean => typeof value === "object" && value !== null && names.every((name) => typeof (value as Record<string, unknown>)[name] === "function");
  if (baseProvider !== undefined && !functions(baseProvider, ["createIngress", "createEgress", "requestSipCall", "transferSipCall", "hangupSipCall"])) throw new Error("media provider is invalid");
  if (admission !== undefined && !functions(admission, ["assertProductionReady", "authorizeIngress", "authorizeEgress", "authorizeSipCall", "authorizeSipTransfer", "authorizeSipHangup"])) throw new Error("media admission is invalid");
  if (statusVerifier !== undefined && !functions(statusVerifier, ["verify"])) throw new Error("media status verifier is invalid");
  if (lifecycleObserver !== undefined && !functions(lifecycleObserver, ["onSipTerminal"])) throw new Error("media lifecycle observer is invalid");
  const provider = baseProvider === undefined || admission === undefined ? baseProvider : new GovernedMediaOpsProvider(baseProvider, admission);
  if (process.env.NODE_ENV === "production" && (options.ingressEnabled || options.egressEnabled || options.sipEnabled) && provider === undefined) throw new Error("production media-ops requires a deployment-owned provider");
  if (process.env.NODE_ENV === "production" && (options.ingressEnabled || options.egressEnabled || options.sipEnabled) && admission === undefined) throw new Error("production media operations require compliance and policy admission");
  if (process.env.NODE_ENV === "production" && admission !== undefined) await admission.assertProductionReady({ ingress: options.ingressEnabled, egress: options.egressEnabled, sip: options.sipEnabled });
  if (process.env.NODE_ENV === "production" && (options.ingressEnabled || options.egressEnabled || options.sipEnabled) && providerCallbackCredential === undefined) throw new Error("production media-ops requires a separate provider callback credential");
  if (process.env.NODE_ENV === "production" && (options.ingressEnabled || options.egressEnabled || options.sipEnabled) && reconciliationWorker === undefined) throw new Error("production media-ops requires a provider usage reconciliation worker");
  if (process.env.NODE_ENV === "production" && (options.ingressEnabled || options.egressEnabled || options.sipEnabled) && statusVerifier === undefined) throw new Error("production media-ops requires a provider status verifier");
  if (process.env.NODE_ENV === "production" && options.sipEnabled && lifecycleObserver === undefined) throw new Error("production SIP requires a durable lifecycle observer");
  if (retentionWorker !== undefined && (typeof retentionWorker.start !== "function" || typeof retentionWorker.stop !== "function")) throw new Error("media-ops retention worker is invalid");
  if (reconciliationWorker !== undefined && (typeof reconciliationWorker.start !== "function" || typeof reconciliationWorker.stop !== "function")) throw new Error("media-ops reconciliation worker is invalid");
  const server = tlsCertFile === undefined || tlsKeyFile === undefined
    ? createMediaOpsServer(credential, control, options, provider, runtime.persistence, providerCallbackCredential, statusVerifier, lifecycleObserver)
    : createMediaOpsHttpsServer(credential, { cert: readFileSync(tlsCertFile, "utf8"), key: readFileSync(tlsKeyFile, "utf8") }, control, options, provider, runtime.persistence, providerCallbackCredential, statusVerifier, lifecycleObserver);
  return { server, workers: [retentionWorker, reconciliationWorker].filter((worker) => worker !== undefined) };
});
let running: Awaited<typeof serverPromise> | undefined;
serverPromise.then((runtime) => {
  running = runtime;
  runtime.server.listen(port, host, () => {
    for (const worker of runtime.workers) worker.start();
    process.stdout.write(`media-ops listening on ${host}:${port}\n`);
  });
}).catch((error: unknown) => {
  process.stderr.write(`media-ops startup failed: ${error instanceof Error ? error.message : "unknown"}\n`);
  process.exitCode = 1;
});

let closing = false;
function shutdown(): void {
  if (closing) return;
  closing = true;
  if (running === undefined) return;
  void (async () => {
    for (const worker of [...running!.workers].reverse()) await worker.stop();
    running!.server.close();
  })();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
