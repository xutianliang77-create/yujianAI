import type { AgentDispatchV1 } from "@yujian/platform-contracts";

export interface AgentQuotaRedisClient {
  eval<T = unknown>(script: string, keys: readonly string[], args: readonly string[]): Promise<T>;
}

export interface AgentDispatchQuotaPolicy {
  maxActivePerEnvironment: number;
  maxActivePerDeployment: number;
  leaseGraceMs: number;
}

export type AgentDispatchAdmission = "acquired" | "existing" | "quota_exceeded";

export interface AgentDispatchQuotaCoordinator {
  admit(dispatch: AgentDispatchV1): Promise<AgentDispatchAdmission>;
  release(dispatch: AgentDispatchV1): Promise<boolean>;
  reconcile(dispatches: readonly AgentDispatchV1[]): Promise<void>;
}

const ADMIT_SCRIPT = `
local now = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
local in_env = redis.call('ZSCORE', KEYS[1], ARGV[3])
local in_deployment = redis.call('ZSCORE', KEYS[2], ARGV[3])
if in_env and in_deployment then return {2, 'existing'} end
if in_env or in_deployment then
  redis.call('ZREM', KEYS[1], ARGV[3])
  redis.call('ZREM', KEYS[2], ARGV[3])
end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[4]) then return {0, 'environment'} end
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[5]) then return {0, 'deployment'} end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[6])
redis.call('PEXPIRE', KEYS[2], ARGV[6])
return {1, 'acquired'}
`;

const RELEASE_SCRIPT = `
local first = redis.call('ZREM', KEYS[1], ARGV[1])
local second = redis.call('ZREM', KEYS[2], ARGV[1])
if first == 1 or second == 1 then return 1 else return 0 end
`;

function keyPart(value: string, field: string): string {
  if (value.length === 0 || value.length > 128 || /[{}|\u0000-\u001f\u007f]/u.test(value)) throw new TypeError(`${field} is invalid for Redis quota coordination`);
  return value;
}

function limit(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100_000) throw new RangeError(`${field} is invalid`);
  return value;
}

function active(dispatch: AgentDispatchV1): boolean {
  return ["queued", "starting", "running", "draining"].includes(dispatch.status);
}

/** Redis Cluster-safe atomic queue/concurrency admission shared by all Agent Control replicas. */
export class RedisAgentDispatchQuota implements AgentDispatchQuotaCoordinator {
  constructor(
    private readonly client: AgentQuotaRedisClient,
    private readonly policy: AgentDispatchQuotaPolicy,
    private readonly clock: () => number = Date.now,
  ) {
    limit(policy.maxActivePerEnvironment, "maxActivePerEnvironment");
    limit(policy.maxActivePerDeployment, "maxActivePerDeployment");
    if (!Number.isSafeInteger(policy.leaseGraceMs) || policy.leaseGraceMs < 5_000 || policy.leaseGraceMs > 3_600_000) throw new RangeError("leaseGraceMs is invalid");
  }

  async admit(dispatch: AgentDispatchV1): Promise<AgentDispatchAdmission> {
    if (!active(dispatch)) throw new TypeError("only active dispatches can enter quota coordination");
    const now = this.clock();
    const deadline = Date.parse(dispatch.deadlineAt);
    if (!Number.isFinite(deadline) || deadline <= now) return "quota_exceeded";
    const keys = this.keys(dispatch);
    const ttl = Math.min(86_400_000 + this.policy.leaseGraceMs, deadline - now + this.policy.leaseGraceMs);
    const result = await this.client.eval<readonly [number | string, string]>(ADMIT_SCRIPT, keys, [
      String(now), String(deadline), keyPart(dispatch.dispatchId, "dispatchId"),
      String(this.policy.maxActivePerEnvironment), String(this.policy.maxActivePerDeployment), String(ttl),
    ]);
    return Number(result[0]) === 2 ? "existing" : Number(result[0]) === 1 ? "acquired" : "quota_exceeded";
  }

  async release(dispatch: AgentDispatchV1): Promise<boolean> {
    const result = await this.client.eval<number | string>(RELEASE_SCRIPT, this.keys(dispatch), [keyPart(dispatch.dispatchId, "dispatchId")]);
    return Number(result) === 1;
  }

  async reconcile(dispatches: readonly AgentDispatchV1[]): Promise<void> {
    const current = dispatches.filter(active).sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    for (const dispatch of current) {
      const result = await this.admit(dispatch);
      if (result === "quota_exceeded") throw new Error("agent dispatch quota cannot reconstruct active state");
    }
  }

  private keys(dispatch: AgentDispatchV1): readonly [string, string] {
    const environmentId = keyPart(dispatch.environmentId, "environmentId");
    const deploymentId = keyPart(dispatch.deploymentId, "deploymentId");
    const prefix = `yujian:agent:quota:{${environmentId}}`;
    return [`${prefix}:environment`, `${prefix}:deployment:${deploymentId}`];
  }
}

export { ADMIT_SCRIPT as REDIS_AGENT_QUOTA_ADMIT_SCRIPT, RELEASE_SCRIPT as REDIS_AGENT_QUOTA_RELEASE_SCRIPT };
