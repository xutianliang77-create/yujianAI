import type { RegionPolicyV1 } from "@yujian/platform-contracts";
import type { YujianRtcNodeConfig } from "./node-pool.js";

export interface YujianRegionDecision {
  node: YujianRtcNodeConfig;
  reason: "preferred-region" | "allowed-region" | "capacity-fallback";
}

/** Stateless admission/router policy shared by token and media-control paths. */
export class YujianRegionRouter {
  constructor(private readonly nodes: readonly YujianRtcNodeConfig[]) {
    if (nodes.length === 0) throw new TypeError("region router requires at least one node");
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
        node: [...candidates].sort((left, right) => (right.capacityScore ?? 1) - (left.capacityScore ?? 1))[0]!,
        reason: allowed.size > 0 || tags.size > 0 ? "allowed-region" : "capacity-fallback",
      };
    }
    if (allowed.size > 0 || tags.size > 0) throw new Error("no RTC node satisfies the region or residency policy");
    return {
      node: [...this.nodes].sort((left, right) => (right.capacityScore ?? 1) - (left.capacityScore ?? 1))[0]!,
      reason: "capacity-fallback",
    };
  }
}
