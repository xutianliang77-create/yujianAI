import type { PlatformScopeV1 } from "@yujian/platform-contracts";
import type { PlatformResourceUsageProvider, PlatformResourceUsageSnapshot } from "./server.js";

export type ResourceUsageField = keyof PlatformResourceUsageSnapshot;

export interface ResourceUsageSource {
  name: string;
  fields: readonly ResourceUsageField[];
  provider: PlatformResourceUsageProvider;
}

const USAGE_FIELDS: readonly ResourceUsageField[] = [
  "activeRooms", "activeParticipants", "activePublishers", "activeSubscriptions", "activeTracks",
  "activeIngressJobs", "activeEgressJobs", "activeSipCalls", "turnBytesInWindow", "tokenRequestsInWindow",
  "concurrentTokenRequests", "agentWorkers", "modelTokensInWindow",
];

function isUsageField(value: string): value is ResourceUsageField {
  return (USAGE_FIELDS as readonly string[]).includes(value);
}

function validateSource(source: ResourceUsageSource): void {
  if (source.name.length === 0 || source.name.length > 128 || /[\u0000-\u001f\u007f]/u.test(source.name)) throw new TypeError("resource usage source name is invalid");
  if (source.fields.length === 0 || source.fields.some((field) => !isUsageField(field))) throw new TypeError(`resource usage source ${source.name} has invalid fields`);
  if (new Set(source.fields).size !== source.fields.length) throw new TypeError(`resource usage source ${source.name} has duplicate fields`);
  if (typeof source.provider.snapshot !== "function") throw new TypeError(`resource usage source ${source.name} has no snapshot provider`);
}

/** Combines independently-owned counters without allowing silent field overwrites. */
export class CompositePlatformResourceUsageProvider implements PlatformResourceUsageProvider {
  private readonly sources: readonly ResourceUsageSource[];

  constructor(sources: readonly ResourceUsageSource[]) {
    if (sources.length === 0 || sources.length > 16) throw new RangeError("at least one resource usage source is required");
    const owners = new Map<ResourceUsageField, string>();
    for (const source of sources) {
      validateSource(source);
      if (owners.has(source.fields[0]!)) {
        for (const field of source.fields) if (owners.has(field)) throw new TypeError(`resource usage field ${field} has multiple owners`);
      }
      for (const field of source.fields) owners.set(field, source.name);
    }
    this.sources = [...sources];
  }

  async snapshot(scope: PlatformScopeV1): Promise<PlatformResourceUsageSnapshot> {
    const merged: Partial<Record<ResourceUsageField, number>> = {};
    for (const source of this.sources) {
      const snapshot = await source.provider.snapshot(scope);
      if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) throw new Error(`resource usage source ${source.name} returned an invalid snapshot`);
      for (const [field, value] of Object.entries(snapshot)) {
        if (field === "environmentId" || field === "policy" || field === "observedAt") continue;
        if (!isUsageField(field) || !source.fields.includes(field)) throw new Error(`resource usage source ${source.name} returned an unowned field`);
        if (!Number.isSafeInteger(value) || value < 0) throw new Error(`resource usage source ${source.name} returned invalid ${field}`);
        merged[field] = value;
      }
    }
    return merged;
  }
}
