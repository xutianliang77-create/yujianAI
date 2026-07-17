import type { PlatformStoreSnapshot } from "./platform-store.js";

export interface PlatformStorePersistence {
  load(): Promise<PlatformStoreSnapshot | undefined>;
  /** Implementations must reject a stale writer instead of silently applying last-write-wins. */
  save(snapshot: PlatformStoreSnapshot): Promise<void>;
}

export interface PlatformStoreSqlResult<Row extends object> {
  rows: readonly Row[];
}

export interface PlatformStoreSqlPool {
  query<Row extends object>(text: string, values?: readonly unknown[]): Promise<PlatformStoreSqlResult<Row>>;
}

type SnapshotRow = { snapshot: PlatformStoreSnapshot; version: string | number };

/** Durable control-plane projection; API-key secrets are never included in the snapshot. */
export class PostgresPlatformStorePersistence implements PlatformStorePersistence {
  private version = 0;

  constructor(private readonly pool: PlatformStoreSqlPool) {}

  async load(): Promise<PlatformStoreSnapshot | undefined> {
    const result = await this.pool.query<SnapshotRow>(
      "SELECT snapshot, version FROM platform_store_snapshots WHERE snapshot_id = 'default'",
    );
    const row = result.rows[0];
    if (row === undefined) { this.version = 0; return undefined; }
    const version = typeof row.version === "number" ? row.version : Number(row.version);
    if (!Number.isSafeInteger(version) || version < 1) throw new Error("platform store snapshot version is invalid");
    this.version = version;
    return row.snapshot;
  }

  async save(snapshot: PlatformStoreSnapshot): Promise<void> {
    const result = await this.pool.query<{ version: string | number }>(
      `INSERT INTO platform_store_snapshots (snapshot_id, snapshot, version, updated_at)
       VALUES ('default', $1::jsonb, 1, now())
       ON CONFLICT (snapshot_id) DO UPDATE SET snapshot = EXCLUDED.snapshot,
         version = platform_store_snapshots.version + 1, updated_at = EXCLUDED.updated_at
       WHERE platform_store_snapshots.version = $2
       RETURNING version`,
      [snapshot, this.version],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("platform store snapshot version conflict; reload before writing");
    const version = typeof row.version === "number" ? row.version : Number(row.version);
    if (!Number.isSafeInteger(version) || version < 1) throw new Error("platform store snapshot version is invalid");
    this.version = version;
  }
}
