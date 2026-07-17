import { randomUUID } from "node:crypto";

export interface RedisEvalClient {
  eval<T = unknown>(script: string, keys: readonly string[], args: readonly string[]): Promise<T>;
}

export interface RedisLease {
  readonly key: string;
  readonly token: string;
  readonly expiresAt: string;
  release(): Promise<boolean>;
}

const ACQUIRE_SCRIPT = `
local current = redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2])
if current then return 1 else return 0 end
`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

function validateKey(key: string): void {
  if (key.length === 0 || key.length > 256 || /[\u0000-\u001f\u007f]/u.test(key)) {
    throw new TypeError("Redis lease key must be 1-256 control-free characters");
  }
}

/**
 * Driver-neutral Redis lease primitive. The concrete Redis client is injected so
 * private deployments can use node-redis, ioredis, or a gateway adapter without
 * leaking that dependency into the platform contracts.
 */
export class RedisLeaseStore {
  constructor(private readonly client: RedisEvalClient) {}

  async acquire(key: string, ttlMs: number, now = Date.now()): Promise<RedisLease | undefined> {
    validateKey(key);
    if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 300_000) {
      throw new RangeError("Redis lease ttl must be 1-300 seconds");
    }
    const token = randomUUID();
    const acquired = await this.client.eval<number>(ACQUIRE_SCRIPT, [key], [token, String(ttlMs)]);
    if (Number(acquired) !== 1) return undefined;
    let released = false;
    return {
      key,
      token,
      expiresAt: new Date(now + ttlMs).toISOString(),
      release: async () => {
        if (released) return false;
        released = true;
        const result = await this.client.eval<number>(RELEASE_SCRIPT, [key], [token]);
        return Number(result) === 1;
      },
    };
  }
}

export { ACQUIRE_SCRIPT as REDIS_LEASE_ACQUIRE_SCRIPT, RELEASE_SCRIPT as REDIS_LEASE_RELEASE_SCRIPT };
