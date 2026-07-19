import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { AgentControlPersistence } from "./persistence.js";
import type { AgentArtifactVerificationInput, AgentControlOptions } from "./controller.js";
import type { AgentDispatchQuotaCoordinator } from "./dispatch-quota.js";

export interface AgentControlRuntimeModule {
  createAgentControlPersistence?: () => AgentControlPersistence | Promise<AgentControlPersistence>;
  createAgentArtifactVerifier?: () => AgentControlOptions["verifyArtifact"] | Promise<AgentControlOptions["verifyArtifact"]>;
  createAgentDispatchQuota?: () => AgentDispatchQuotaCoordinator | Promise<AgentDispatchQuotaCoordinator>;
  default?: AgentControlPersistence | (() => AgentControlPersistence | Promise<AgentControlPersistence>);
}

export async function loadAgentDispatchQuota(specifier: string | undefined): Promise<AgentDispatchQuotaCoordinator | undefined> {
  if (specifier === undefined || specifier.trim() === "") return undefined;
  const loaded = await import(runtimeUrl(specifier)) as AgentControlRuntimeModule;
  if (loaded.createAgentDispatchQuota === undefined) throw new Error("agent runtime module must export createAgentDispatchQuota");
  const quota = await loaded.createAgentDispatchQuota();
  if (typeof quota !== "object" || quota === null || typeof quota.admit !== "function" || typeof quota.release !== "function" || typeof quota.reconcile !== "function") {
    throw new Error("agent runtime module returned invalid dispatch quota coordinator");
  }
  return quota;
}

function runtimeUrl(specifier: string): string {
  return specifier.startsWith("file:") ? specifier : pathToFileURL(resolve(specifier)).href;
}

/** Load deployment-owned PostgreSQL adapter without bundling a driver or credential. */
export async function loadAgentControlPersistence(specifier: string | undefined): Promise<AgentControlPersistence | undefined> {
  if (specifier === undefined || specifier.trim() === "") return undefined;
  const loaded = await import(runtimeUrl(specifier)) as AgentControlRuntimeModule;
  const candidate = loaded.createAgentControlPersistence ?? loaded.default;
  if (candidate === undefined) throw new Error("agent control runtime module must export createAgentControlPersistence or default");
  const persistence = typeof candidate === "function" ? await candidate() : candidate;
  if (typeof persistence !== "object" || persistence === null || typeof persistence.load !== "function" || typeof persistence.save !== "function") {
    throw new Error("agent control runtime module returned invalid persistence adapter");
  }
  return persistence;
}

/** Load deployment-owned artifact signature/SBOM verification without bundling registry credentials. */
export async function loadAgentArtifactVerifier(specifier: string | undefined): Promise<((input: AgentArtifactVerificationInput) => ReturnType<NonNullable<AgentControlOptions["verifyArtifact"]>>) | undefined> {
  if (specifier === undefined || specifier.trim() === "") return undefined;
  const loaded = await import(runtimeUrl(specifier)) as AgentControlRuntimeModule;
  if (loaded.createAgentArtifactVerifier === undefined) throw new Error("agent runtime module must export createAgentArtifactVerifier");
  const verifier = await loaded.createAgentArtifactVerifier();
  if (typeof verifier !== "function") throw new Error("agent runtime module returned invalid artifact verifier");
  return verifier;
}
