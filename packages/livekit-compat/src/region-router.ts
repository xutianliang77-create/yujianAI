import type { RegionPolicyV1 } from "@yujian/platform-contracts";
import type { YujianRtcNodeConfig } from "./node-pool.js";

export interface YujianRegionDecision {
  node: YujianRtcNodeConfig;
  reason: "preferred-region" | "allowed-region" | "capacity-fallback";
}

/** Stateless admission/router policy shared by token and media-control paths. */
export class YujianRegionRouter {
  private cursor = 0;

  constructor(private readonly nodes: readonly YujianRtcNodeConfig[]) {
    if (nodes.length === 0) throw new TypeError("region router requires at least one node");
  }

  private choose(candidates: readonly YujianRtcNodeConfig[]): YujianRtcNodeConfig {
    const highestCapacity = Math.max(...candidates.map((node) => node.capacityScore ?? 1));
    const balanced = candidates.filter((node) => (node.capacityScore ?? 1) === highestCapacity);
    const node = balanced[this.cursor % balanced.length];
    if (node === undefined) throw new Error("region router has no candidate node");
    this.cursor = (this.cursor + 1) % balanced.length;
    return node;
  }

  select(policy?: Pick<RegionPolicyV1, "allowedRegions" | "preferredRegions" | "residencyTags">): YujianRegionDecision {
    const allowed = new Set(policy?.allowedRegions ?? []);
    const preferred = policy?.preferredRegions ?? [];
    const tags = new Set(policy?.residencyTags ?? []);
    const candidates = this.nodes.filter((node) => {
      if (allowed.size > 0 && (node.regionId === undefined || !allowed.has(node.regionId))) return false;
      if (tags.size > 0 && !(node.residencyTags ?? []).some((tag) => tags.has(tag))) return false;
      return true;
    });
    const preferredNode = candidates.find((node) => node.regionId !== undefined && preferred.includes(node.regionId));
    if (preferredNode !== undefined) return { node: preferredNode, reason: "preferred-region" };
    if (candidates.length > 0) {
      return {
        node: this.choose(candidates),
        reason: allowed.size > 0 || tags.size > 0 ? "allowed-region" : "capacity-fallback",
      };
    }
    if (allowed.size > 0 || tags.size > 0) throw new Error("no RTC node satisfies the region or residency policy");
    return {
      node: this.choose(this.nodes),
      reason: "capacity-fallback",
    };
  }
}
