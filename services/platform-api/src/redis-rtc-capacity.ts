import { randomUUID } from "node:crypto";
import { parseRtcCapacityReport, type RtcCapacityReportV1, type RtcCapacityRequestV1 } from "@yujian/livekit-compat";
import type { QuotaPolicyV1 } from "@yujian/platform-contracts";
import type { RedisEvalClient } from "./redis-coordination.js";

const PUBLISH_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current then
  local prior = cjson.decode(current)
  local next = cjson.decode(ARGV[1])
  if tonumber(prior.sequence) >= tonumber(next.sequence) then return 0 end
end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
return 1
`;

const RESERVE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {0, 'stale'} end
local report = cjson.decode(raw)
if report.healthy ~= true then return {0, 'unhealthy'} end
if report.draining == true then return {0, 'draining'} end
local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ARGV[1], 'LIMIT', 0, 1000)
for _, member in ipairs(expired) do
  local values = {}
  for value in string.gmatch(member, '[^|]+') do table.insert(values, value) end
  for index = 1, 5 do redis.call('HINCRBY', KEYS[3], tostring(index), -tonumber(values[index + 1])) end
end
if #expired > 0 then redis.call('ZREM', KEYS[2], unpack(expired)) end
local usageFields = {'activeRooms','activeParticipants','activePublishers','activeSubscriptions','activeTracks'}
local quotaLimits = {tonumber(ARGV[9]),tonumber(ARGV[10]),tonumber(ARGV[11]),tonumber(ARGV[12]),tonumber(ARGV[13])}
local requested = {tonumber(ARGV[4]),tonumber(ARGV[5]),tonumber(ARGV[6]),tonumber(ARGV[7]),tonumber(ARGV[8])}
for index = 1, 5 do
  local base = tonumber(report.usage[usageFields[index]])
  local nodeLimit = tonumber(report.limits[usageFields[index]])
  local reserved = tonumber(redis.call('HGET', KEYS[3], tostring(index)) or '0')
  local effectiveLimit = math.min(nodeLimit, quotaLimits[index])
  if base + reserved + requested[index] > effectiveLimit then return {0, usageFields[index]} end
end
local member = ARGV[3]
for index = 1, 5 do member = member .. '|' .. tostring(requested[index]) end
redis.call('ZADD', KEYS[2], ARGV[2], member)
for index = 1, 5 do redis.call('HINCRBY', KEYS[3], tostring(index), requested[index]) end
local ttl = tonumber(ARGV[14])
redis.call('PEXPIRE', KEYS[2], ttl)
redis.call('PEXPIRE', KEYS[3], ttl)
return {1, member}
`;

const RELEASE_SCRIPT = `
local members = redis.call('ZRANGE', KEYS[1], 0, -1)
for _, member in ipairs(members) do
  if string.sub(member, 1, string.len(ARGV[1]) + 1) == ARGV[1] .. '|' then
    local values = {}
    for value in string.gmatch(member, '[^|]+') do table.insert(values, value) end
    for index = 1, 5 do redis.call('HINCRBY', KEYS[2], tostring(index), -tonumber(values[index + 1])) end
    redis.call('ZREM', KEYS[1], member)
    return 1
  end
end
return 0
`;

export interface RedisRtcCapacityClient extends RedisEvalClient {}

export interface RtcCapacityAdmissionLease {
  nodeId: string;
  leaseId: string;
  expiresAt: string;
  release(): Promise<void>;
}

export interface PlatformRtcCapacityProvider {
  publish(value: unknown): Promise<RtcCapacityReportV1>;
  reserve(nodeIds: readonly string[], policy: QuotaPolicyV1, request: RtcCapacityRequestV1): Promise<RtcCapacityAdmissionLease | undefined>;
}

function nodeKey(nodeId: string): string {
  if (!/^[a-z][a-z0-9-]{1,62}$/u.test(nodeId)) throw new TypeError("RTC capacity node id is invalid");
  return nodeId;
}

function requestCount(value: number | undefined, field: string): number {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative safe integer`);
  return value;
}

export class RedisRtcCapacityProvider implements PlatformRtcCapacityProvider {
  constructor(
    private readonly client: RedisRtcCapacityClient,
    private readonly clock: () => number = Date.now,
    private readonly leaseTtlMs = 60_000,
  ) {
    if (!Number.isSafeInteger(leaseTtlMs) || leaseTtlMs < 5_000 || leaseTtlMs > 300_000) throw new RangeError("RTC capacity lease ttl must be 5-300 seconds");
  }

  async publish(value: unknown): Promise<RtcCapacityReportV1> {
    const report = parseRtcCapacityReport(value);
    const now = this.clock();
    const ttl = Date.parse(report.expiresAt) - now;
    if (ttl < 1 || ttl > 120_000 || Date.parse(report.observedAt) > now + 5_000) throw new RangeError("RTC capacity report is stale or from the future");
    const accepted = await this.client.eval<number | string>(PUBLISH_SCRIPT, [`yujian:rtc:capacity:${nodeKey(report.nodeId)}:report`], [JSON.stringify(report), String(ttl)]);
    if (Number(accepted) !== 1) throw new RangeError("RTC capacity report sequence is not newer than the stored report");
    return report;
  }

  async reserve(nodeIds: readonly string[], policy: QuotaPolicyV1, request: RtcCapacityRequestV1): Promise<RtcCapacityAdmissionLease | undefined> {
    const requested = [
      requestCount(request.rooms, "rooms"), requestCount(request.participants, "participants"),
      requestCount(request.publishers, "publishers"), requestCount(request.subscriptions, "subscriptions"),
      requestCount(request.tracks, "tracks"),
    ];
    const quota = [policy.maxRooms, policy.maxConcurrentParticipants, policy.maxPublishers, policy.maxSubscriptions, policy.maxTracks];
    if (quota.some((value) => !Number.isSafeInteger(value) || value < 1)) throw new RangeError("RTC quota policy is invalid");
    const now = this.clock();
    for (const rawNodeId of nodeIds) {
      const nodeId = nodeKey(rawNodeId);
      const leaseId = randomUUID();
      const expiresAtMs = now + this.leaseTtlMs;
      const prefix = `yujian:rtc:capacity:${nodeId}`;
      const result = await this.client.eval<readonly [number | string, string]>(RESERVE_SCRIPT,
        [`${prefix}:report`, `${prefix}:leases`, `${prefix}:reserved`],
        [String(now), String(expiresAtMs), leaseId, ...requested.map(String), ...quota.map(String), String(this.leaseTtlMs + 5_000)]);
      if (Number(result[0]) !== 1) continue;
      let released = false;
      return {
        nodeId,
        leaseId,
        expiresAt: new Date(expiresAtMs).toISOString(),
        release: async () => {
          if (released) return;
          released = true;
          await this.client.eval(RELEASE_SCRIPT, [`${prefix}:leases`, `${prefix}:reserved`], [leaseId]);
        },
      };
    }
    return undefined;
  }
}

export { PUBLISH_SCRIPT as REDIS_RTC_CAPACITY_PUBLISH_SCRIPT, RESERVE_SCRIPT as REDIS_RTC_CAPACITY_RESERVE_SCRIPT, RELEASE_SCRIPT as REDIS_RTC_CAPACITY_RELEASE_SCRIPT };
