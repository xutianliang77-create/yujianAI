import type { QuotaPolicyV1 } from "@yujian/platform-contracts";
import type { YujianRtcNodeStatus } from "./node-pool.js";

export interface RtcCapacityUsageV1 {
  activeRooms: number;
  activeParticipants: number;
  activePublishers: number;
  activeSubscriptions: number;
  activeTracks: number;
}

export interface RtcCapacityRequestV1 {
  rooms?: number;
  participants?: number;
  publishers?: number;
  subscriptions?: number;
  tracks?: number;
}

export interface RtcCapacityDecisionV1 {
  admitted: boolean;
  nodeId: string;
  reason: "admitted" | "draining" | "unhealthy" | "room_limit" | "participant_limit" | "publisher_limit" | "subscription_limit" | "track_limit";
  utilization: number;
}

type CapacityState = {
  status: YujianRtcNodeStatus;
  usage: RtcCapacityUsageV1;
  draining: boolean;
};

const ZERO_USAGE: RtcCapacityUsageV1 = {
  activeRooms: 0,
  activeParticipants: 0,
  activePublishers: 0,
  activeSubscriptions: 0,
  activeTracks: 0,
};

function nonNegativeInteger(value: number | undefined, field: string): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative integer`);
  return value;
}

function utilization(
  usage: RtcCapacityUsageV1,
  quota: Pick<QuotaPolicyV1, "maxRooms" | "maxConcurrentParticipants" | "maxPublishers" | "maxSubscriptions" | "maxTracks">,
): number {
  const ratios = [
    usage.activeRooms / Math.max(1, quota.maxRooms),
    usage.activeParticipants / Math.max(1, quota.maxConcurrentParticipants),
    usage.activePublishers / Math.max(1, quota.maxPublishers),
    usage.activeSubscriptions / Math.max(1, quota.maxSubscriptions),
    usage.activeTracks / Math.max(1, quota.maxTracks),
  ];
  return Math.max(...ratios);
}

/** Driver-neutral RTC admission and drain state fed by LiveKit admin probes. */
export class YujianRtcCapacityController {
  private readonly states = new Map<string, CapacityState>();

  observe(statuses: readonly YujianRtcNodeStatus[]): void {
    const observedIds = new Set(statuses.map((status) => status.id));
    for (const nodeId of this.states.keys()) {
      if (!observedIds.has(nodeId)) this.states.delete(nodeId);
    }
    for (const status of statuses) {
      const current = this.states.get(status.id);
      this.states.set(status.id, {
        status,
        usage: {
          activeRooms: status.activeRoomCount ?? current?.usage.activeRooms ?? 0,
          activeParticipants: current?.usage.activeParticipants ?? 0,
          activePublishers: current?.usage.activePublishers ?? 0,
          activeSubscriptions: current?.usage.activeSubscriptions ?? 0,
          activeTracks: current?.usage.activeTracks ?? 0,
        },
        draining: current?.draining ?? false,
      });
    }
  }

  updateUsage(nodeId: string, usage: RtcCapacityUsageV1): void {
    const current = this.states.get(nodeId);
    if (current === undefined) throw new Error(`unknown RTC node: ${nodeId}`);
    this.states.set(nodeId, {
      ...current,
      usage: {
        activeRooms: nonNegativeInteger(usage.activeRooms, "activeRooms"),
        activeParticipants: nonNegativeInteger(usage.activeParticipants, "activeParticipants"),
        activePublishers: nonNegativeInteger(usage.activePublishers, "activePublishers"),
        activeSubscriptions: nonNegativeInteger(usage.activeSubscriptions, "activeSubscriptions"),
        activeTracks: nonNegativeInteger(usage.activeTracks, "activeTracks"),
      },
    });
  }

  setDraining(nodeId: string, draining: boolean): void {
    const current = this.states.get(nodeId);
    if (current === undefined) throw new Error(`unknown RTC node: ${nodeId}`);
    this.states.set(nodeId, { ...current, draining });
  }

  decide(
    nodeId: string,
    quota: Pick<QuotaPolicyV1, "maxRooms" | "maxConcurrentParticipants" | "maxPublishers" | "maxSubscriptions" | "maxTracks">,
    request: RtcCapacityRequestV1 = {},
  ): RtcCapacityDecisionV1 {
    const current = this.states.get(nodeId);
    if (current === undefined) throw new Error(`unknown RTC node: ${nodeId}`);
    const usage = current.usage;
    const requested = {
      rooms: nonNegativeInteger(request.rooms, "rooms"),
      participants: nonNegativeInteger(request.participants, "participants"),
      publishers: nonNegativeInteger(request.publishers, "publishers"),
      subscriptions: nonNegativeInteger(request.subscriptions, "subscriptions"),
      tracks: nonNegativeInteger(request.tracks, "tracks"),
    };
    const currentUtilization = utilization(usage, quota);
    if (!current.status.healthy) return { admitted: false, nodeId, reason: "unhealthy", utilization: currentUtilization };
    if (current.draining) return { admitted: false, nodeId, reason: "draining", utilization: currentUtilization };
    const checks: readonly [number, number, RtcCapacityDecisionV1["reason"]][] = [
      [usage.activeRooms + requested.rooms, quota.maxRooms, "room_limit"],
      [usage.activeParticipants + requested.participants, quota.maxConcurrentParticipants, "participant_limit"],
      [usage.activePublishers + requested.publishers, quota.maxPublishers, "publisher_limit"],
      [usage.activeSubscriptions + requested.subscriptions, quota.maxSubscriptions, "subscription_limit"],
      [usage.activeTracks + requested.tracks, quota.maxTracks, "track_limit"],
    ];
    const rejected = checks.find(([value, limit]) => value > limit);
    if (rejected !== undefined) return { admitted: false, nodeId, reason: rejected[2], utilization: currentUtilization };
    return {
      admitted: true,
      nodeId,
      reason: "admitted",
      utilization: utilization({
        activeRooms: usage.activeRooms + requested.rooms,
        activeParticipants: usage.activeParticipants + requested.participants,
        activePublishers: usage.activePublishers + requested.publishers,
        activeSubscriptions: usage.activeSubscriptions + requested.subscriptions,
        activeTracks: usage.activeTracks + requested.tracks,
      }, quota),
    };
  }

  choose(
    quota: Pick<QuotaPolicyV1, "maxRooms" | "maxConcurrentParticipants" | "maxPublishers" | "maxSubscriptions" | "maxTracks">,
    request: RtcCapacityRequestV1 = {},
  ): RtcCapacityDecisionV1 | undefined {
    return [...this.states.keys()]
      .map((nodeId) => this.decide(nodeId, quota, request))
      .filter((decision) => decision.admitted)
      .sort((left, right) => left.utilization - right.utilization)[0];
  }

  snapshot(): ReadonlyMap<string, { status: YujianRtcNodeStatus; usage: RtcCapacityUsageV1; draining: boolean }> {
    return new Map([...this.states.entries()].map(([id, state]) => [id, {
      status: state.status,
      usage: { ...ZERO_USAGE, ...state.usage },
      draining: state.draining,
    }]));
  }
}
