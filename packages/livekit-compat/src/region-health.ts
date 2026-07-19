import type { RegionPolicyV1 } from "@yujian/platform-contracts";
import type { YujianRtcNodeConfig } from "./node-pool.js";

export type YujianRegionHealthState = "healthy" | "degraded" | "unavailable" | "draining";

export interface YujianRegionHealthObservation {
  nodeId: string;
  sequence: number;
  state: YujianRegionHealthState;
  observedAt: string;
  expiresAt: string;
  availableCapacityScore: number;
  evidenceDigest: string;
}

export interface YujianHealthRoutingPolicy extends Pick<RegionPolicyV1, "allowedRegions" | "preferredRegions" | "residencyTags"> {
  excludedFailureDomains?: readonly string[];
  allowDegraded?: boolean;
}

export interface YujianHealthRegionDecision {
  node: YujianRtcNodeConfig;
  health: YujianRegionHealthState;
  reason: "preferred-region" | "allowed-region" | "healthy-capacity" | "degraded-fallback";
  observationSequence: number;
}

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const TAG = /^[a-z][a-z0-9-]{0,63}$/u;

function time(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`region health ${field} is invalid`);
  return parsed;
}

/** Monotonic, expiry-aware health registry. Stale observations fail closed. */
export class YujianRegionHealthRegistry {
  private readonly observations = new Map<string, YujianRegionHealthObservation>();

  constructor(private readonly nodeIds: ReadonlySet<string>, private readonly clock: () => number = Date.now) {}

  record(input: YujianRegionHealthObservation): void {
    if (!this.nodeIds.has(input.nodeId) || !Number.isSafeInteger(input.sequence) || input.sequence < 1 || !DIGEST.test(input.evidenceDigest)) throw new TypeError("region health observation identity is invalid");
    const observedAt = time(input.observedAt, "observedAt");
    const expiresAt = time(input.expiresAt, "expiresAt");
    if (expiresAt <= observedAt || expiresAt > observedAt + 300_000 || observedAt > this.clock() + 30_000) throw new TypeError("region health observation lifetime is invalid");
    if (!Number.isFinite(input.availableCapacityScore) || input.availableCapacityScore < 0 || ((input.state === "healthy" || input.state === "degraded") && input.availableCapacityScore === 0)) throw new TypeError("region health capacity is invalid");
    const current = this.observations.get(input.nodeId);
    if (current !== undefined && input.sequence <= current.sequence) throw new Error("region health observation sequence conflict");
    this.observations.set(input.nodeId, Object.freeze({ ...input }));
  }

  current(nodeId: string): YujianRegionHealthObservation | undefined {
    const observation = this.observations.get(nodeId);
    return observation !== undefined && time(observation.expiresAt, "expiresAt") > this.clock() ? observation : undefined;
  }
}

/** Health-aware admission router. It never crosses residency or explicit failure-domain boundaries. */
export class YujianRegionHealthRouter {
  private cursor = 0;
  readonly registry: YujianRegionHealthRegistry;

  constructor(private readonly nodes: readonly YujianRtcNodeConfig[], clock: () => number = Date.now) {
    if (nodes.length === 0) throw new TypeError("region health router requires at least one node");
    const ids = new Set(nodes.map((node) => node.id));
    if (ids.size !== nodes.length) throw new TypeError("region health router node ids must be unique");
    this.registry = new YujianRegionHealthRegistry(ids, clock);
  }

  select(policy?: YujianHealthRoutingPolicy): YujianHealthRegionDecision {
    const allowed = new Set(policy?.allowedRegions ?? []);
    const residency = new Set(policy?.residencyTags ?? []);
    const excluded = new Set(policy?.excludedFailureDomains ?? []);
    if ([...excluded].some((tag) => !TAG.test(tag))) throw new TypeError("excluded failure domain is invalid");
    const observed = this.nodes.flatMap((node) => {
      const health = this.registry.current(node.id);
      if (health === undefined || health.state === "unavailable" || health.state === "draining") return [];
      if (allowed.size > 0 && (node.regionId === undefined || !allowed.has(node.regionId))) return [];
      if (residency.size > 0 && !(node.residencyTags ?? []).some((tag) => residency.has(tag))) return [];
      if (node.failureDomain !== undefined && excluded.has(node.failureDomain)) return [];
      if (health.state === "degraded" && policy?.allowDegraded !== true) return [];
      return [{ node, health }];
    });
    if (observed.length === 0) throw new Error("no healthy RTC node satisfies health, region, residency and failure-domain policy");
    const preferred = new Set(policy?.preferredRegions ?? []);
    const preferredNodes = observed.filter(({ node }) => node.regionId !== undefined && preferred.has(node.regionId));
    const pool = preferredNodes.length > 0 ? preferredNodes : observed;
    const bestHealth = pool.some(({ health }) => health.state === "healthy") ? "healthy" : "degraded";
    const healthPool = pool.filter(({ health }) => health.state === bestHealth);
    const highestCapacity = Math.max(...healthPool.map(({ node, health }) => (node.capacityScore ?? 1) * health.availableCapacityScore));
    const candidates = healthPool.filter(({ node, health }) => (node.capacityScore ?? 1) * health.availableCapacityScore === highestCapacity);
    const selected = candidates[this.cursor % candidates.length];
    if (selected === undefined) throw new Error("region health router has no candidate node");
    this.cursor = (this.cursor + 1) % candidates.length;
    return {
      node: selected.node,
      health: selected.health.state,
      observationSequence: selected.health.sequence,
      reason: bestHealth === "degraded" ? "degraded-fallback" : preferredNodes.length > 0 ? "preferred-region" : allowed.size > 0 || residency.size > 0 ? "allowed-region" : "healthy-capacity",
    };
  }
}
