import type { MediaBudgetLease, MediaBudgetRedisClient } from "./media-budget.js";

export interface SipAdmissionCoordinator {
  reserve(input: {
    environmentId: string;
    trunkId: string;
    callId: string;
    maxConcurrentCalls: number;
    maxCallsPerMinute: number;
    expiresAt: string;
  }): Promise<MediaBudgetLease | undefined>;
  complete(input: { environmentId: string; trunkId: string; callId: string }): Promise<void>;
}

const RESERVE_SCRIPT = `
local active = redis.call('HGETALL', KEYS[1])
for index = 1, #active, 2 do
  if tonumber(active[index + 1]) <= tonumber(ARGV[1]) then redis.call('HDEL', KEYS[1], active[index]) end
end
if redis.call('HEXISTS', KEYS[1], ARGV[2]) == 1 then return 0 end
if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
local rate = tonumber(redis.call('GET', KEYS[2]) or '0')
if rate >= tonumber(ARGV[4]) then return 0 end
redis.call('HSET', KEYS[1], ARGV[2], ARGV[5])
redis.call('PEXPIRE', KEYS[1], ARGV[6])
redis.call('INCR', KEYS[2])
if rate == 0 then redis.call('PEXPIRE', KEYS[2], 60000) end
return 1
`;

const RELEASE_SCRIPT = `return redis.call('HDEL', KEYS[1], ARGV[1])`;

function key(value: string, field: string): string {
  if (value.length === 0 || value.length > 128 || /[{}|\u0000-\u001f\u007f]/u.test(value)) throw new TypeError(`${field} is invalid`);
  return value;
}

function limit(value: number, field: string, maximum: number): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new RangeError(`${field} is invalid`);
  return value;
}

/** Same-slot Redis admission for SIP frequency and active-call concurrency. */
export class RedisSipAdmissionCoordinator implements SipAdmissionCoordinator {
  constructor(private readonly client: MediaBudgetRedisClient, private readonly clock: () => number = Date.now) {}

  async reserve(input: Parameters<SipAdmissionCoordinator["reserve"]>[0]): Promise<MediaBudgetLease | undefined> {
    const environmentId = key(input.environmentId, "environmentId");
    const trunkId = key(input.trunkId, "trunkId");
    const callId = key(input.callId, "callId");
    const maxConcurrent = limit(input.maxConcurrentCalls, "maxConcurrentCalls", 100_000);
    const maxPerMinute = limit(input.maxCallsPerMinute, "maxCallsPerMinute", 1_000_000);
    const now = this.clock();
    const expiresAt = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt - now > 14_400_000) throw new RangeError("SIP admission lease expiry is invalid");
    const prefix = `yujian:sip:admission:{${environmentId}:${trunkId}}`;
    const activeKey = `${prefix}:active`;
    const result = await this.client.eval<number | string>(RESERVE_SCRIPT, [activeKey, `${prefix}:rate`], [String(now), callId, String(maxConcurrent), String(maxPerMinute), String(expiresAt), String(expiresAt - now + 60_000)]);
    if (Number(result) !== 1) return undefined;
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      await this.client.eval(RELEASE_SCRIPT, [activeKey], [callId]);
    };
    return { commit: async () => undefined, release, complete: release };
  }

  async complete(input: { environmentId: string; trunkId: string; callId: string }): Promise<void> {
    const environmentId = key(input.environmentId, "environmentId");
    const trunkId = key(input.trunkId, "trunkId");
    const callId = key(input.callId, "callId");
    await this.client.eval(RELEASE_SCRIPT, [`yujian:sip:admission:{${environmentId}:${trunkId}}:active`], [callId]);
  }
}

export { RELEASE_SCRIPT as REDIS_SIP_ADMISSION_RELEASE_SCRIPT, RESERVE_SCRIPT as REDIS_SIP_ADMISSION_RESERVE_SCRIPT };
