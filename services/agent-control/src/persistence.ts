import type { AgentControlSnapshot } from "./controller.js";

export interface AgentControlSqlResult<Row extends object> {
  rows: readonly Row[];
}

export interface AgentControlSqlPool {
  query<Row extends object>(text: string, values?: readonly unknown[]): Promise<AgentControlSqlResult<Row>>;
}

export interface AgentControlPersistence {
  load(): Promise<AgentControlSnapshot | undefined>;
  /** Implementations must reject stale snapshot writers. */
  save(snapshot: AgentControlSnapshot): Promise<void>;
}

type SnapshotRow = { snapshot: AgentControlSnapshot; version: string | number };

/** Durable single-row snapshot boundary; dispatch ownership remains enforced by AgentControlPlane. */
export class PostgresAgentControlPersistence implements AgentControlPersistence {
  private version = 0;

  constructor(private readonly pool: AgentControlSqlPool) {}

  async load(): Promise<AgentControlSnapshot | undefined> {
    const result = await this.pool.query<SnapshotRow>(
      "SELECT snapshot, version FROM agent_control_snapshots WHERE snapshot_id = 'default'",
    );
    const row = result.rows[0];
    if (row === undefined) { this.version = 0; return undefined; }
    const version = typeof row.version === "number" ? row.version : Number(row.version);
    if (!Number.isSafeInteger(version) || version < 1) throw new Error("agent control snapshot version is invalid");
    this.version = version;
    return row.snapshot;
  }

  async save(snapshot: AgentControlSnapshot): Promise<void> {
    const result = await this.pool.query<{ version: string | number }>(
      `INSERT INTO agent_control_snapshots (snapshot_id, snapshot, version, updated_at)
       VALUES ('default', $1::jsonb, 1, now())
       ON CONFLICT (snapshot_id) DO UPDATE SET snapshot = EXCLUDED.snapshot,
         version = agent_control_snapshots.version + 1, updated_at = EXCLUDED.updated_at
       WHERE agent_control_snapshots.version = $2
       RETURNING version`,
      [snapshot, this.version],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("agent control snapshot version conflict; reload before writing");
    const version = typeof row.version === "number" ? row.version : Number(row.version);
    if (!Number.isSafeInteger(version) || version < 1) throw new Error("agent control snapshot version is invalid");
    this.version = version;
  }
}
