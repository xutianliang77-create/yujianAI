import type { PlatformScopeV1, QuotaPolicyV1 } from "@yujian/platform-contracts";
import type { RedisEvalClient } from "./redis-coordination.js";
import { PlatformStoreError } from "./platform-store.js";

const RESERVE_SCRIPT = `
local requests = redis.call('INCR', KEYS[1])
if requests == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[3]) end
local ttl = redis.call('PTTL', KEYS[1])
if requests > tonumber(ARGV[1]) then return { 0, requests, 0, ttl } end
local concurrent = redis.call('INCR', KEYS[2])
if concurrent == 1 then redis.call('PEXPIRE', KEYS[2], ARGV[4]) end
if concurrent > tonumber(ARGV[2]) then redis.call('DECR', KEYS[2]); return { 0, requests, concurrent - 1, ttl } end
return { 1, requests, concurrent, ttl }
`;

const RELEASE_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current <= 0 then return 0 end
return redis.call('DECR', KEYS[1])
`;

export interface PlatformTokenQuotaProvider {
  reserve(scope: PlatformScopeV1, policy: QuotaPolicyV1): Promise<() => void | Promise<void>>;
}

function keyPart(value: string, field: string): string {
  if (value.length === 0 || value.length > 128 || /[^A-Za-z0-9._:-]/u.test(value)) throw new TypeError(`${field} contains unsupported characters`);
  return value;
}

/** Redis atomic fixed-window request and concurrent-token reservation. */
export class RedisTokenQuotaProvider implements PlatformTokenQuotaProvider {
  constructor(private readonly client: RedisEvalClient, private readonly clock: () => number = Date.now) {}

  async reserve(scope: PlatformScopeV1, policy: QuotaPolicyV1): Promise<() => void | Promise<void>> {
    if (!Number.isSafeInteger(policy.maxTokenRequestsPerMinute) || policy.maxTokenRequestsPerMinute < 1 || !Number.isSafeInteger(policy.maxConcurrentTokenRequests) || policy.maxConcurrentTokenRequests < 1) throw new RangeError("token quota policy is invalid");
    const environmentId = keyPart(scope.environmentId, "environmentId");
    const minute = Math.floor(this.clock() / 60_000);
    const requestKey = `yujian:token:requests:${environmentId}:${minute}`;
    const concurrentKey = `yujian:token:concurrent:${environmentId}`;
    const result = await this.client.eval<readonly [number | string, number | string, number | string, number | string]>(RESERVE_SCRIPT, [requestKey, concurrentKey], [String(policy.maxTokenRequestsPerMinute), String(policy.maxConcurrentTokenRequests), "60000", "300000"]);
    if (Number(result[0]) !== 1) throw new PlatformStoreError("QUOTA_EXCEEDED", "token request quota exceeded");
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      await this.client.eval(RELEASE_SCRIPT, [concurrentKey], []);
    };
  }
}

export { RESERVE_SCRIPT as REDIS_TOKEN_QUOTA_RESERVE_SCRIPT, RELEASE_SCRIPT as REDIS_TOKEN_QUOTA_RELEASE_SCRIPT };
