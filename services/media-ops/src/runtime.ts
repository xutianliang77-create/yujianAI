import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { MediaOpsPersistence } from "./persistence.js";
import type { MediaOpsControl } from "./control.js";
import type { MediaOpsBackgroundWorker } from "./retention.js";
import type { MediaOpsProvider } from "./control.js";
import type { MediaOperationAdmission } from "./governed-provider.js";
import type { MediaProviderStatusVerifier } from "./provider-status-verifier.js";
import type { MediaLifecycleObserver } from "./lifecycle-observer.js";

export interface MediaOpsRuntimeModule {
  createMediaOpsPersistence?: () => MediaOpsPersistence | Promise<MediaOpsPersistence>;
  createMediaOpsRetentionWorker?: (context: { control: MediaOpsControl; persist: () => Promise<void> }) => MediaOpsBackgroundWorker | Promise<MediaOpsBackgroundWorker>;
  createMediaOpsProvider?: (context: { features: { ingress: boolean; egress: boolean; sip: boolean } }) => MediaOpsProvider | Promise<MediaOpsProvider>;
  createMediaOperationAdmission?: () => MediaOperationAdmission | Promise<MediaOperationAdmission>;
  createMediaOpsReconciliationWorker?: () => MediaOpsBackgroundWorker | Promise<MediaOpsBackgroundWorker>;
  createMediaProviderStatusVerifier?: () => MediaProviderStatusVerifier | Promise<MediaProviderStatusVerifier>;
  createMediaLifecycleObserver?: () => MediaLifecycleObserver | Promise<MediaLifecycleObserver>;
  default?: MediaOpsPersistence | (() => MediaOpsPersistence | Promise<MediaOpsPersistence>);
}

function runtimeUrl(specifier: string): string { return specifier.startsWith("file:") ? specifier : pathToFileURL(resolve(specifier)).href; }

export async function loadMediaOpsPersistence(specifier: string | undefined): Promise<MediaOpsPersistence | undefined> {
  return (await loadMediaOpsRuntime(specifier)).persistence;
}

export async function loadMediaOpsRuntime(specifier: string | undefined): Promise<{
  persistence?: MediaOpsPersistence;
  createRetentionWorker?: MediaOpsRuntimeModule["createMediaOpsRetentionWorker"];
  createProvider?: MediaOpsRuntimeModule["createMediaOpsProvider"];
  createAdmission?: MediaOpsRuntimeModule["createMediaOperationAdmission"];
  createReconciliationWorker?: MediaOpsRuntimeModule["createMediaOpsReconciliationWorker"];
  createStatusVerifier?: MediaOpsRuntimeModule["createMediaProviderStatusVerifier"];
  createLifecycleObserver?: MediaOpsRuntimeModule["createMediaLifecycleObserver"];
}> {
  if (specifier === undefined || specifier.trim() === "") return {};
  const loaded = await import(runtimeUrl(specifier)) as MediaOpsRuntimeModule;
  const candidate = loaded.createMediaOpsPersistence ?? loaded.default;
  let persistence: MediaOpsPersistence | undefined;
  if (candidate !== undefined) {
    persistence = typeof candidate === "function" ? await candidate() : candidate;
    if (typeof persistence !== "object" || persistence === null || typeof persistence.load !== "function" || typeof persistence.save !== "function") {
      throw new Error("media-ops runtime module returned invalid persistence adapter");
    }
  }
  if (loaded.createMediaOpsRetentionWorker !== undefined && typeof loaded.createMediaOpsRetentionWorker !== "function") throw new Error("media-ops runtime module returned invalid retention worker factory");
  if (loaded.createMediaOpsProvider !== undefined && typeof loaded.createMediaOpsProvider !== "function") throw new Error("media-ops runtime module returned invalid provider factory");
  if (loaded.createMediaOperationAdmission !== undefined && typeof loaded.createMediaOperationAdmission !== "function") throw new Error("media-ops runtime module returned invalid admission factory");
  if (loaded.createMediaOpsReconciliationWorker !== undefined && typeof loaded.createMediaOpsReconciliationWorker !== "function") throw new Error("media-ops runtime module returned invalid reconciliation worker factory");
  if (loaded.createMediaProviderStatusVerifier !== undefined && typeof loaded.createMediaProviderStatusVerifier !== "function") throw new Error("media-ops runtime module returned invalid status verifier factory");
  if (loaded.createMediaLifecycleObserver !== undefined && typeof loaded.createMediaLifecycleObserver !== "function") throw new Error("media-ops runtime module returned invalid lifecycle observer factory");
  return {
    ...(persistence === undefined ? {} : { persistence }),
    ...(loaded.createMediaOpsRetentionWorker === undefined ? {} : { createRetentionWorker: loaded.createMediaOpsRetentionWorker }),
    ...(loaded.createMediaOpsProvider === undefined ? {} : { createProvider: loaded.createMediaOpsProvider }),
    ...(loaded.createMediaOperationAdmission === undefined ? {} : { createAdmission: loaded.createMediaOperationAdmission }),
    ...(loaded.createMediaOpsReconciliationWorker === undefined ? {} : { createReconciliationWorker: loaded.createMediaOpsReconciliationWorker }),
    ...(loaded.createMediaProviderStatusVerifier === undefined ? {} : { createStatusVerifier: loaded.createMediaProviderStatusVerifier }),
    ...(loaded.createMediaLifecycleObserver === undefined ? {} : { createLifecycleObserver: loaded.createMediaLifecycleObserver }),
  };
}
