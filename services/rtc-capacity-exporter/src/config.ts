import type { RtcCapacityUsageV1 } from "@yujian/livekit-compat";

export interface RtcCapacityExporterConfig {
  nodeId: string;
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
  platformUrl: string;
  credential: string;
  intervalMs: number;
  ttlMs: number;
  limits: RtcCapacityUsageV1;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (value === undefined || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${name} must be set and control-free`);
  return value;
}

function integer(environment: NodeJS.ProcessEnv, name: string, fallback: number, minimum: number, maximum: number): number {
  const value = environment[name] === undefined ? fallback : Number(environment[name]);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be ${minimum}-${maximum}`);
  return value;
}

function endpoint(value: string, protocols: readonly string[], name: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${name} must be a valid URL`); }
  if (!protocols.includes(parsed.protocol) || parsed.username !== "" || parsed.password !== "") throw new Error(`${name} protocol or credentials are invalid`);
  return value.replace(/\/$/u, "");
}

export function loadRtcCapacityExporterConfig(environment: NodeJS.ProcessEnv = process.env): RtcCapacityExporterConfig {
  const nodeId = required(environment, "YUJIAN_RTC_NODE_ID");
  if (!/^[a-z][a-z0-9-]{1,62}$/u.test(nodeId)) throw new Error("YUJIAN_RTC_NODE_ID is invalid");
  const credential = required(environment, "YUJIAN_RTC_CAPACITY_CREDENTIAL");
  if (credential.length < 32) throw new Error("YUJIAN_RTC_CAPACITY_CREDENTIAL must be at least 32 characters");
  const intervalMs = integer(environment, "YUJIAN_RTC_CAPACITY_INTERVAL_MS", 5_000, 1_000, 30_000);
  const ttlMs = integer(environment, "YUJIAN_RTC_CAPACITY_TTL_MS", 15_000, 5_000, 120_000);
  if (ttlMs < intervalMs * 2) throw new Error("YUJIAN_RTC_CAPACITY_TTL_MS must cover at least two report intervals");
  return {
    nodeId,
    livekitUrl: endpoint(required(environment, "YUJIAN_RTC_LOCAL_URL"), ["http:", "https:", "ws:", "wss:"], "YUJIAN_RTC_LOCAL_URL"),
    apiKey: required(environment, "YUJIAN_RTC_API_KEY"),
    apiSecret: required(environment, "YUJIAN_RTC_API_SECRET"),
    platformUrl: endpoint(required(environment, "YUJIAN_RTC_CAPACITY_PLATFORM_URL"), ["http:", "https:"], "YUJIAN_RTC_CAPACITY_PLATFORM_URL"),
    credential,
    intervalMs,
    ttlMs,
    limits: {
      activeRooms: integer(environment, "YUJIAN_RTC_MAX_ROOMS", 1_000, 1, 1_000_000),
      activeParticipants: integer(environment, "YUJIAN_RTC_MAX_PARTICIPANTS", 10_000, 1, 10_000_000),
      activePublishers: integer(environment, "YUJIAN_RTC_MAX_PUBLISHERS", 5_000, 1, 10_000_000),
      activeSubscriptions: integer(environment, "YUJIAN_RTC_MAX_SUBSCRIPTIONS", 100_000, 1, 100_000_000),
      activeTracks: integer(environment, "YUJIAN_RTC_MAX_TRACKS", 20_000, 1, 100_000_000),
    },
  };
}
