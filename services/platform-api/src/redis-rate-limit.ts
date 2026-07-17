import type { RateLimitDecision, RateLimiter } from "./rate-limit.js";
import type { RedisEvalClient } from "./redis-coordination.js";

const COUNTER_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

function validateKey(key: string): void {
  if (key.length === 0 || key.length > 256 || /[\u0000-\u001f\u007f]/u.test(key)) throw new TypeError("rate limit key is invalid");
}

/** Redis-backed fixed window counter; the Lua script makes increment and expiry atomic. */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly client: RedisEvalClient,
    private readonly limit = 120,
    private readonly windowMs = 60_000,
  ) {
    if (!Number.isInteger(limit) || limit < 1) throw new TypeError("rate limit must be positive");
    if (!Number.isInteger(windowMs) || windowMs < 1_000) throw new TypeError("rate limit window is invalid");
  }

  async check(key: string, now = Date.now()): Promise<RateLimitDecision> {
    validateKey(key);
    const result = await this.client.eval<readonly [number | string, number | string]>(COUNTER_SCRIPT, [key], [String(this.windowMs)]);
    const count = Number(result[0]);
    const ttl = Math.max(0, Number(result[1]));
    return {
      allowed: Number.isFinite(count) && count <= this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - count),
      resetAt: new Date(now + ttl).toISOString(),
    };
  }
}

export { COUNTER_SCRIPT as REDIS_RATE_LIMIT_SCRIPT };
