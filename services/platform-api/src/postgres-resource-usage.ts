import type { PlatformScopeV1 } from "@yujian/platform-contracts";
import type { PlatformResourceUsageProvider, PlatformResourceUsageSnapshot } from "./server.js";
import type { SqlPool } from "./postgres-persistence.js";

type UsageRow = {
  active_ingress_jobs: string | number;
  active_egress_jobs: string | number;
  active_sip_calls: string | number;
  agent_workers: string | number;
  token_requests_in_window: string | number;
};

function countOf(row: UsageRow, field: keyof UsageRow): number {
  const value = typeof row[field] === "number" ? row[field] : Number(row[field]);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`invalid resource usage count: ${field}`);
  return value;
}

/** Durable control-plane counters used as one input to platform quota snapshots. */
export class PostgresPlatformResourceUsageProvider implements PlatformResourceUsageProvider {
  constructor(private readonly pool: SqlPool) {}

  async snapshot(scope: PlatformScopeV1): Promise<PlatformResourceUsageSnapshot> {
    const result = await this.pool.query<UsageRow>(
      `SELECT
         (SELECT count(*) FROM ingress_jobs WHERE environment_id = $1 AND status IN ('requested', 'starting', 'active', 'draining')) AS active_ingress_jobs,
         (SELECT count(*) FROM egress_jobs WHERE environment_id = $1 AND status IN ('requested', 'starting', 'active', 'draining')) AS active_egress_jobs,
         (SELECT count(*) FROM sip_calls WHERE environment_id = $1 AND status IN ('requested', 'starting', 'active', 'draining')) AS active_sip_calls,
         (SELECT COALESCE(sum(observed_replicas), 0) FROM agent_deployments WHERE environment_id = $1 AND status IN ('canary', 'active', 'draining')) AS agent_workers,
         (SELECT count(*) FROM usage_records WHERE environment_id = $1 AND metric = 'token_issued' AND window_start >= date_trunc('minute', now())) AS token_requests_in_window`,
      [scope.environmentId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("resource usage query returned no row");
    return {
      activeIngressJobs: countOf(row, "active_ingress_jobs"),
      activeEgressJobs: countOf(row, "active_egress_jobs"),
      activeSipCalls: countOf(row, "active_sip_calls"),
      agentWorkers: countOf(row, "agent_workers"),
      tokenRequestsInWindow: countOf(row, "token_requests_in_window"),
    };
  }
}
