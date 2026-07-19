import type { RtcCapacityUsageV1 } from "./capacity-controller.js";

export interface RtcCapacityReportV1 {
  schemaVersion: 1;
  nodeId: string;
  observedAt: string;
  expiresAt: string;
  sequence: number;
  healthy: boolean;
  draining: boolean;
  source: "livekit-room-service-upper-bound";
  subscriptionAccounting: "participants-times-published-tracks-upper-bound";
  usage: RtcCapacityUsageV1;
  limits: RtcCapacityUsageV1;
}

const NODE_ID_PATTERN = /^[a-z][a-z0-9-]{1,62}$/u;
const USAGE_FIELDS = [
  "activeRooms",
  "activeParticipants",
  "activePublishers",
  "activeSubscriptions",
  "activeTracks",
] as const;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("RTC capacity report must be an object");
  return value as Record<string, unknown>;
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new TypeError(`${field} must be an ISO timestamp`);
  return value;
}

function count(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError(`${field} must be a non-negative safe integer`);
  return value as number;
}

export function parseRtcCapacityReport(value: unknown): RtcCapacityReportV1 {
  const input = record(value);
  if (input.schemaVersion !== 1 || typeof input.nodeId !== "string" || !NODE_ID_PATTERN.test(input.nodeId)) throw new TypeError("RTC capacity report identity is invalid");
  const observedAt = timestamp(input.observedAt, "observedAt");
  const expiresAt = timestamp(input.expiresAt, "expiresAt");
  const ttl = Date.parse(expiresAt) - Date.parse(observedAt);
  if (ttl < 5_000 || ttl > 120_000) throw new TypeError("RTC capacity report ttl must be 5-120 seconds");
  if (!Number.isSafeInteger(input.sequence) || (input.sequence as number) < 0) throw new TypeError("RTC capacity report sequence is invalid");
  if (typeof input.healthy !== "boolean" || typeof input.draining !== "boolean") throw new TypeError("RTC capacity report state is invalid");
  if (input.source !== "livekit-room-service-upper-bound"
    || input.subscriptionAccounting !== "participants-times-published-tracks-upper-bound") throw new TypeError("RTC capacity accounting source is invalid");
  const rawUsage = record(input.usage);
  const rawLimits = record(input.limits);
  const usage = Object.fromEntries(USAGE_FIELDS.map((field) => [field, count(rawUsage[field], `usage.${field}`)])) as unknown as RtcCapacityUsageV1;
  const limits = Object.fromEntries(USAGE_FIELDS.map((field) => [field, count(rawLimits[field], `limits.${field}`)])) as unknown as RtcCapacityUsageV1;
  if (USAGE_FIELDS.some((field) => limits[field] < 1)) throw new TypeError("RTC capacity limits must be positive");
  return {
    schemaVersion: 1,
    nodeId: input.nodeId,
    observedAt,
    expiresAt,
    sequence: input.sequence as number,
    healthy: input.healthy,
    draining: input.draining,
    source: input.source,
    subscriptionAccounting: input.subscriptionAccounting,
    usage,
    limits,
  };
}
