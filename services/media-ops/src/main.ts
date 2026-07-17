import { readFileSync } from "node:fs";
import { YujianMediaServiceAdapter } from "@yujian/livekit-compat";
import { createMediaOpsHttpsServer, createMediaOpsServer } from "./server.js";
import { MediaOpsLiveKitProvider } from "./livekit-adapter.js";
import { MediaOpsControl } from "./control.js";
import { loadMediaOpsRuntime } from "./runtime.js";

const credential = process.env.YUJIAN_MEDIA_INTERNAL_CREDENTIAL;
if (credential === undefined || credential.length < 32) throw new Error("YUJIAN_MEDIA_INTERNAL_CREDENTIAL must be at least 32 characters");
const port = Number(process.env.MEDIA_OPS_PORT ?? 8095);
const host = process.env.MEDIA_OPS_HOST ?? "127.0.0.1";
const enabled = (name: string, fallback: boolean): boolean => process.env[name] === undefined ? fallback : process.env[name] === "true";
const options = {
  sipEnabled: enabled("YUJIAN_SIP_ENABLED", false),
  ingressEnabled: enabled("YUJIAN_INGRESS_ENABLED", true),
  egressEnabled: enabled("YUJIAN_EGRESS_ENABLED", false),
};
const defaultSipTrunkId = process.env.YUJIAN_SIP_DEFAULT_TRUNK_ID;
if (defaultSipTrunkId !== undefined && (defaultSipTrunkId.length === 0 || defaultSipTrunkId.length > 128 || defaultSipTrunkId.trim() !== defaultSipTrunkId)) {
  throw new Error("YUJIAN_SIP_DEFAULT_TRUNK_ID must be a trimmed non-empty identifier");
}
const providerEnabled = process.env.YUJIAN_MEDIA_PROVIDER_ENABLED === "true";
let provider: MediaOpsLiveKitProvider | undefined;
if (providerEnabled) {
  const wsUrl = process.env.YUJIAN_RTC_PRIMARY_URL ?? process.env.LIVEKIT_URL;
  const apiKey = process.env.YUJIAN_RTC_API_KEY ?? process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.YUJIAN_RTC_API_SECRET ?? process.env.LIVEKIT_API_SECRET;
  if (wsUrl === undefined || apiKey === undefined || apiSecret === undefined) throw new Error("RTC URL/API key/API secret are required when media provider is enabled");
  const nodes = [{ id: "primary", wsUrl, apiKey, apiSecret }, ...(process.env.YUJIAN_RTC_SECONDARY_URL === undefined ? [] : [{ id: "secondary", wsUrl: process.env.YUJIAN_RTC_SECONDARY_URL, apiKey, apiSecret }])];
  provider = new MediaOpsLiveKitProvider(new YujianMediaServiceAdapter(nodes), { ingress: options.ingressEnabled, egress: options.egressEnabled, sip: options.sipEnabled }, defaultSipTrunkId);
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
  if (retentionWorker !== undefined && (typeof retentionWorker.start !== "function" || typeof retentionWorker.stop !== "function")) throw new Error("media-ops retention worker is invalid");
  const server = tlsCertFile === undefined || tlsKeyFile === undefined
    ? createMediaOpsServer(credential, control, options, provider, runtime.persistence)
    : createMediaOpsHttpsServer(credential, { cert: readFileSync(tlsCertFile, "utf8"), key: readFileSync(tlsKeyFile, "utf8") }, control, options, provider, runtime.persistence);
  return { server, retentionWorker };
});
let running: Awaited<typeof serverPromise> | undefined;
serverPromise.then((runtime) => {
  running = runtime;
  runtime.server.listen(port, host, () => {
    runtime.retentionWorker?.start();
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
    await running!.retentionWorker?.stop();
    running!.server.close();
  })();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
