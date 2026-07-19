import type { MediaBudgetLease, MediaBudgetRedisClient } from "./media-budget.js";

export type MediaCapacityKind = "ingress" | "egress";
export interface MediaCapacityLimitProvider { limit(environmentId: string, kind: MediaCapacityKind): Promise<number> }
export interface MediaCapacityCoordinator {
  reserve(input: { environmentId: string; kind: MediaCapacityKind; resourceId: string; limit: number; expiresAt: string }): Promise<MediaBudgetLease | undefined>;
  complete(input: { environmentId: string; kind: MediaCapacityKind; resourceId: string }): Promise<void>;
}

const RESERVE_SCRIPT = `
local active = redis.call('HGETALL', KEYS[1])
for index = 1, #active, 2 do
  if tonumber(active[index + 1]) <= tonumber(ARGV[1]) then redis.call('HDEL', KEYS[1], active[index]) end
end
if redis.call('HEXISTS', KEYS[1], ARGV[2]) == 1 then return 0 end
if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('HSET', KEYS[1], ARGV[2], ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[5])
return 1
`;
const RELEASE_SCRIPT = `return redis.call('HDEL', KEYS[1], ARGV[1])`;

function part(value: string, field: string): string {
  if (value.length === 0 || value.length > 128 || /[{}|\u0000-\u001f\u007f]/u.test(value)) throw new TypeError(`${field} is invalid`);
  return value;
}

/** Distributed active Ingress/Egress capacity with terminal release and bounded crash cleanup. */
export class RedisMediaCapacityCoordinator implements MediaCapacityCoordinator {
  constructor(private readonly client: MediaBudgetRedisClient, private readonly clock: () => number = Date.now) {}

  async reserve(input: Parameters<MediaCapacityCoordinator["reserve"]>[0]): Promise<MediaBudgetLease | undefined> {
    const environmentId = part(input.environmentId, "environmentId");
    const resourceId = part(input.resourceId, "resourceId");
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100_000) throw new RangeError("media capacity limit is invalid");
    const now = this.clock();
    const expiresAt = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt - now > 86_400_000) throw new RangeError("media capacity lease expiry is invalid");
    const redisKey = `yujian:media:capacity:{${environmentId}}:${input.kind}`;
    const result = await this.client.eval<number | string>(RESERVE_SCRIPT, [redisKey], [String(now), resourceId, String(input.limit), String(expiresAt), String(expiresAt - now + 60_000)]);
    if (Number(result) !== 1) return undefined;
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      await this.client.eval(RELEASE_SCRIPT, [redisKey], [resourceId]);
    };
    return { commit: async () => undefined, release, complete: release };
  }

  async complete(input: { environmentId: string; kind: MediaCapacityKind; resourceId: string }): Promise<void> {
    const environmentId = part(input.environmentId, "environmentId");
    const resourceId = part(input.resourceId, "resourceId");
    await this.client.eval(RELEASE_SCRIPT, [`yujian:media:capacity:{${environmentId}}:${input.kind}`], [resourceId]);
  }
}

export { RELEASE_SCRIPT as REDIS_MEDIA_CAPACITY_RELEASE_SCRIPT, RESERVE_SCRIPT as REDIS_MEDIA_CAPACITY_RESERVE_SCRIPT };
