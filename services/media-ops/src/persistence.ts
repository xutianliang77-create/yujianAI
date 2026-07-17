import type { EgressJobV1, IngressJobV1, SipCallV1 } from "@yujian/platform-contracts";

export interface MediaOpsSnapshot {
  calls: readonly SipCallV1[];
  ingress: readonly IngressJobV1[];
  egress: readonly EgressJobV1[];
  idempotency: readonly [string, SipCallV1 | IngressJobV1 | EgressJobV1][];
  idempotencyFingerprints: readonly [string, string][];
  operationResults: readonly [string, SipCallV1][];
}

export interface MediaOpsPersistence {
  load(): Promise<MediaOpsSnapshot | undefined>;
  /** Implementations must reject stale snapshot writers. */
  save(snapshot: MediaOpsSnapshot): Promise<void>;
}

export interface MediaOpsSqlResult<Row extends object> { rows: readonly Row[]; }
export interface MediaOpsSqlPool {
  query<Row extends object>(text: string, values?: readonly unknown[]): Promise<MediaOpsSqlResult<Row>>;
}

type SnapshotRow = { snapshot: MediaOpsSnapshot; version: string | number };

/** Single-row durable boundary; media state transitions remain owned by MediaOpsControl. */
export class PostgresMediaOpsPersistence implements MediaOpsPersistence {
  private version = 0;

  constructor(private readonly pool: MediaOpsSqlPool) {}

  async load(): Promise<MediaOpsSnapshot | undefined> {
    const result = await this.pool.query<SnapshotRow>("SELECT snapshot, version FROM media_ops_snapshots WHERE snapshot_id = 'default'");
    const row = result.rows[0];
    if (row === undefined) { this.version = 0; return undefined; }
    const version = typeof row.version === "number" ? row.version : Number(row.version);
    if (!Number.isSafeInteger(version) || version < 1) throw new Error("media ops snapshot version is invalid");
    this.version = version;
    return row.snapshot;
  }

  async save(snapshot: MediaOpsSnapshot): Promise<void> {
    const result = await this.pool.query<{ version: string | number }>(
      `INSERT INTO media_ops_snapshots (snapshot_id, snapshot, version, updated_at)
       VALUES ('default', $1::jsonb, 1, now())
       ON CONFLICT (snapshot_id) DO UPDATE SET snapshot = EXCLUDED.snapshot,
         version = media_ops_snapshots.version + 1, updated_at = EXCLUDED.updated_at
       WHERE media_ops_snapshots.version = $2
       RETURNING version`,
      [snapshot, this.version],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("media ops snapshot version conflict; reload before writing");
    const version = typeof row.version === "number" ? row.version : Number(row.version);
    if (!Number.isSafeInteger(version) || version < 1) throw new Error("media ops snapshot version is invalid");
    this.version = version;
  }
}
