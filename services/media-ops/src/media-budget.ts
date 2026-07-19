export interface MediaBudgetRedisClient {
  eval<T = unknown>(script: string, keys: readonly string[], args: readonly string[]): Promise<T>;
}

export interface MediaBudgetLease {
  commit(): Promise<void>;
  release(): Promise<void>;
  complete?(): Promise<void>;
  resolvedSipTrunkId?: string;
}

export interface MediaBudgetCoordinator {
  reserve(input: { environmentId: string; reservationId: string; amountMicros: number; limitMicros: number; expiresAt: string }): Promise<MediaBudgetLease | undefined>;
}

const RESERVE_SCRIPT = `
local entries = redis.call('HGETALL', KEYS[2])
for index = 1, #entries, 2 do
  local parts = {}
  for value in string.gmatch(entries[index + 1], '[^|]+') do table.insert(parts, value) end
  if tonumber(parts[2]) <= tonumber(ARGV[1]) then
    redis.call('DECRBY', KEYS[1], tonumber(parts[1]))
    redis.call('HDEL', KEYS[2], entries[index])
  end
end
local existing = redis.call('HGET', KEYS[2], ARGV[2])
if existing then return 0 end
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
local amount = tonumber(ARGV[3])
if used + amount > tonumber(ARGV[4]) then return 0 end
redis.call('INCRBY', KEYS[1], amount)
redis.call('HSET', KEYS[2], ARGV[2], ARGV[3] .. '|' .. ARGV[5] .. '|' .. ARGV[7])
redis.call('PEXPIRE', KEYS[1], ARGV[6])
redis.call('PEXPIRE', KEYS[2], ARGV[6])
return 1
`;

const COMMIT_SCRIPT = `
local current = redis.call('HGET', KEYS[1], ARGV[1])
if not current or not string.match(current, '|' .. ARGV[2] .. '$') then return 0 end
return redis.call('HDEL', KEYS[1], ARGV[1])
`;

const RELEASE_SCRIPT = `
local current = redis.call('HGET', KEYS[2], ARGV[1])
if not current or not string.match(current, '|' .. ARGV[2] .. '$') then return 0 end
local amount = string.match(current, '^[^|]+')
redis.call('HDEL', KEYS[2], ARGV[1])
redis.call('DECRBY', KEYS[1], tonumber(amount))
return 1
`;

function keyPart(value: string, field: string): string {
  if (value.length === 0 || value.length > 128 || /[{}|\u0000-\u001f\u007f]/u.test(value)) throw new TypeError(`${field} is invalid`);
  return value;
}

function micros(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${field} must be a non-negative safe integer`);
  return value;
}

/** Atomic daily fail-closed budget reservation; committed amounts remain until the UTC period expires. */
export class RedisMediaBudgetCoordinator implements MediaBudgetCoordinator {
  constructor(private readonly client: MediaBudgetRedisClient, private readonly clock: () => number = Date.now) {}

  async reserve(input: { environmentId: string; reservationId: string; amountMicros: number; limitMicros: number; expiresAt: string }): Promise<MediaBudgetLease | undefined> {
    const environmentId = keyPart(input.environmentId, "environmentId");
    const reservationId = keyPart(input.reservationId, "reservationId");
    const amount = micros(input.amountMicros, "amountMicros");
    const limit = micros(input.limitMicros, "limitMicros");
    const now = this.clock();
    const expiresAt = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt - now > 86_400_000) throw new RangeError("budget lease expiry is invalid");
    const day = new Date(now).toISOString().slice(0, 10);
    const prefix = `yujian:media:budget:{${environmentId}}:${day}`;
    const keys = [`${prefix}:used`, `${prefix}:leases`] as const;
    const endOfWindow = Date.parse(`${day}T00:00:00.000Z`) + 172_800_000;
    const leaseToken = randomUUID();
    const result = await this.client.eval<number | string>(RESERVE_SCRIPT, keys, [String(now), reservationId, String(amount), String(limit), String(expiresAt), String(endOfWindow - now), leaseToken]);
    if (Number(result) !== 1) return undefined;
    let terminal = false;
    return {
      commit: async () => {
        if (terminal) return;
        terminal = true;
        await this.client.eval(COMMIT_SCRIPT, [keys[1]], [reservationId, leaseToken]);
      },
      release: async () => {
        if (terminal) return;
        terminal = true;
        await this.client.eval(RELEASE_SCRIPT, keys, [reservationId, leaseToken]);
      },
    };
  }
}

export { COMMIT_SCRIPT as REDIS_MEDIA_BUDGET_COMMIT_SCRIPT, RELEASE_SCRIPT as REDIS_MEDIA_BUDGET_RELEASE_SCRIPT, RESERVE_SCRIPT as REDIS_MEDIA_BUDGET_RESERVE_SCRIPT };
import { randomUUID } from "node:crypto";
