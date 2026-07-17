import { LiveKitAdminProbe, type LiveKitProbeResult } from "./admin-probe.js";
import {
  validateLiveKitConnectionConfig,
  type LiveKitConnectionConfig,
} from "./config.js";

/**
 * A Yujian-owned name for a pinned RTC entry point.  The underlying
 * connection still speaks the official LiveKit Server API and protocol.
 */
export interface YujianRtcNodeConfig extends LiveKitConnectionConfig {
  id: string;
  regionId?: string;
  residencyTags?: readonly string[];
  capacityScore?: number;
}

export interface YujianRtcNodeStatus {
  id: string;
  url: string;
  healthy: boolean;
  latencyMs?: number;
  activeRoomCount?: number;
  error?: string;
}

export interface YujianRtcReadiness {
  ready: boolean;
  nodes: YujianRtcNodeStatus[];
}

const NODE_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/u;
const REGION_TAG_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;

function validateNode(node: YujianRtcNodeConfig): YujianRtcNodeConfig {
  if (!NODE_ID_PATTERN.test(node.id)) {
    throw new TypeError(
      "YUJIAN RTC node id must be 2-32 lowercase letters, digits, or hyphens",
    );
  }
  if (node.regionId !== undefined && !REGION_TAG_PATTERN.test(node.regionId)) throw new TypeError("YUJIAN RTC region id is invalid");
  const residencyTags = node.residencyTags === undefined ? undefined : [...new Set(node.residencyTags)];
  if (residencyTags?.some((tag) => !REGION_TAG_PATTERN.test(tag))) throw new TypeError("YUJIAN RTC residency tag is invalid");
  const capacityScore = node.capacityScore ?? 1;
  if (!Number.isFinite(capacityScore) || capacityScore <= 0) {
    throw new TypeError("YUJIAN RTC node capacity score must be greater than zero");
  }
  return {
    id: node.id,
    ...validateLiveKitConnectionConfig(node),
    ...(node.regionId === undefined ? {} : { regionId: node.regionId }),
    ...(residencyTags === undefined ? {} : { residencyTags }),
    capacityScore,
  };
}

/**
 * Keeps node selection and readiness in one place so the control plane does
 * not grow a second, subtly different failover implementation.
 */
export class YujianRtcNodePool {
  readonly nodes: readonly YujianRtcNodeConfig[];
  private readonly probes: ReadonlyMap<string, LiveKitAdminProbe>;
  private cursor = 0;

  constructor(nodes: readonly YujianRtcNodeConfig[], requestTimeoutSeconds = 3) {
    if (nodes.length === 0 || nodes.length > 16) {
      throw new TypeError("YUJIAN RTC node pool must contain 1-16 nodes");
    }
    const validated = nodes.map(validateNode);
    const ids = new Set<string>();
    for (const node of validated) {
      if (ids.has(node.id)) throw new TypeError(`duplicate YUJIAN RTC node id: ${node.id}`);
      ids.add(node.id);
    }
    this.nodes = validated;
    this.probes = new Map<string, LiveKitAdminProbe>(
      validated.map(
        (node): [string, LiveKitAdminProbe] => [
          node.id,
          new LiveKitAdminProbe(node, requestTimeoutSeconds),
        ],
      ),
    );
  }

  next(): YujianRtcNodeConfig {
    const node = this.nodes[this.cursor % this.nodes.length];
    if (node === undefined) throw new Error("YUJIAN RTC node pool is empty");
    this.cursor = (this.cursor + 1) % this.nodes.length;
    return node;
  }

  get(id: string): YujianRtcNodeConfig {
    const node = this.nodes.find((candidate) => candidate.id === id);
    if (node === undefined) throw new Error(`unknown YUJIAN RTC node: ${id}`);
    return node;
  }

  async check(): Promise<YujianRtcReadiness> {
    const statuses = await Promise.all(
      this.nodes.map(async (node): Promise<YujianRtcNodeStatus> => {
        const probe = this.probes.get(node.id);
        if (probe === undefined) {
          return { id: node.id, url: node.wsUrl, healthy: false, error: "probe unavailable" };
        }
        try {
          const result: LiveKitProbeResult = await probe.check();
          return { id: node.id, url: node.wsUrl, healthy: true, ...result };
        } catch (error) {
          return {
            id: node.id,
            url: node.wsUrl,
            healthy: false,
            error: error instanceof Error ? error.message : "probe failed",
          };
        }
      }),
    );
    return { ready: statuses.every((status) => status.healthy), nodes: statuses };
  }
}
