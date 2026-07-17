import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { MediaOpsPersistence } from "./persistence.js";
import type { MediaOpsControl } from "./control.js";
import type { MediaOpsBackgroundWorker } from "./retention.js";

export interface MediaOpsRuntimeModule {
  createMediaOpsPersistence?: () => MediaOpsPersistence | Promise<MediaOpsPersistence>;
  createMediaOpsRetentionWorker?: (context: { control: MediaOpsControl; persist: () => Promise<void> }) => MediaOpsBackgroundWorker | Promise<MediaOpsBackgroundWorker>;
  default?: MediaOpsPersistence | (() => MediaOpsPersistence | Promise<MediaOpsPersistence>);
}

function runtimeUrl(specifier: string): string { return specifier.startsWith("file:") ? specifier : pathToFileURL(resolve(specifier)).href; }

export async function loadMediaOpsPersistence(specifier: string | undefined): Promise<MediaOpsPersistence | undefined> {
  return (await loadMediaOpsRuntime(specifier)).persistence;
}

export async function loadMediaOpsRuntime(specifier: string | undefined): Promise<{
  persistence?: MediaOpsPersistence;
  createRetentionWorker?: MediaOpsRuntimeModule["createMediaOpsRetentionWorker"];
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
  return { ...(persistence === undefined ? {} : { persistence }), ...(loaded.createMediaOpsRetentionWorker === undefined ? {} : { createRetentionWorker: loaded.createMediaOpsRetentionWorker }) };
}
