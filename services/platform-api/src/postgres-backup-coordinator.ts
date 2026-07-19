import { randomUUID } from "node:crypto";

export type BackupRunStatus = "planned" | "running" | "verified" | "failed";

export interface ControlPlaneBackupRun {
  backupRunId: string;
  provider: string;
  status: BackupRunStatus;
  snapshotAt?: string;
  artifactUri?: string;
  artifactSha256?: string;
  encryptionKeyRef: string;
  schemaMigration: string;
  rpoSeconds: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  version: number;
}

export interface ControlPlaneRestoreDrill {
  restoreDrillId: string;
  backupRunId: string;
  status: BackupRunStatus;
  isolated: true;
  productionOverwrite: false;
  rtoMilliseconds?: number;
  verification: Readonly<Record<string, boolean | number | string>>;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  version: number;
}

export interface BackupArtifactResult {
  snapshotAt: string;
  artifactUri: string;
  artifactSha256: string;
}

export interface RestoreDrillResult {
  verification: Readonly<Record<string, boolean | number | string>>;
}

export interface ControlPlaneBackupProvider {
  readonly name: string;
  createBackup(input: { backupRunId: string; encryptionKeyRef: string }): Promise<BackupArtifactResult>;
  restoreIsolated(input: { restoreDrillId: string; backup: ControlPlaneBackupRun }): Promise<RestoreDrillResult>;
}

export interface BackupSqlResult<Row extends object> { rows: readonly Row[] }
export interface BackupSqlPool { query<Row extends object>(text: string, values?: readonly unknown[]): Promise<BackupSqlResult<Row>> }

type BackupRow = {
  backup_run_id: string; provider: string; status: BackupRunStatus; snapshot_at: string | null;
  artifact_uri: string | null; artifact_sha256: string | null; encryption_key_ref: string;
  schema_migration: string; rpo_seconds: string | number; started_at: string | null;
  completed_at: string | null; created_at: string; version: string | number;
};

type DrillRow = {
  restore_drill_id: string; backup_run_id: string; status: BackupRunStatus; isolated: boolean;
  production_overwrite: boolean; rto_milliseconds: string | number | null; verification: unknown;
  started_at: string | null; completed_at: string | null; created_at: string; version: string | number;
};

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const ARTIFACT_URI = /^(s3|gs|https):\/\//u;
const KEY_REF = /^(openbao|vault|kms):\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]{3,2048}$/u;

function safeArtifactUri(value: string): boolean {
  if (!ARTIFACT_URI.test(value) || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return parsed.hostname !== "" && parsed.username === "" && parsed.password === "" && parsed.search === "" && parsed.hash === "";
  } catch {
    return false;
  }
}

function integer(value: string | number, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`invalid backup ${field}`);
  return parsed;
}

function time(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`invalid backup ${field}`);
  return new Date(parsed).toISOString();
}

function optionalTime(value: string | null, field: string): string | undefined {
  return value === null ? undefined : time(value, field);
}

function backupFrom(row: BackupRow | undefined): ControlPlaneBackupRun {
  if (row === undefined) throw new Error("backup run not found or state transition conflict");
  return {
    backupRunId: row.backup_run_id, provider: row.provider, status: row.status,
    ...(row.snapshot_at === null ? {} : { snapshotAt: time(row.snapshot_at, "snapshot_at") }),
    ...(row.artifact_uri === null ? {} : { artifactUri: row.artifact_uri }),
    ...(row.artifact_sha256 === null ? {} : { artifactSha256: row.artifact_sha256 }),
    encryptionKeyRef: row.encryption_key_ref, schemaMigration: row.schema_migration,
    rpoSeconds: integer(row.rpo_seconds, "rpo_seconds"),
    ...(optionalTime(row.started_at, "started_at") === undefined ? {} : { startedAt: optionalTime(row.started_at, "started_at") }),
    ...(optionalTime(row.completed_at, "completed_at") === undefined ? {} : { completedAt: optionalTime(row.completed_at, "completed_at") }),
    createdAt: time(row.created_at, "created_at"), version: integer(row.version, "version"),
  };
}

function verification(value: unknown): Readonly<Record<string, boolean | number | string>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid restore verification");
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > 32 || entries.some(([key, item]) => !/^[a-z][a-zA-Z0-9]{1,63}$/u.test(key) || !(typeof item === "boolean" || typeof item === "string" || (typeof item === "number" && Number.isFinite(item))))) throw new Error("invalid restore verification");
  return Object.fromEntries(entries) as Readonly<Record<string, boolean | number | string>>;
}

function drillFrom(row: DrillRow | undefined): ControlPlaneRestoreDrill {
  if (row === undefined) throw new Error("restore drill not found or state transition conflict");
  if (row.isolated !== true || row.production_overwrite !== false) throw new Error("restore drill isolation invariant violated");
  return {
    restoreDrillId: row.restore_drill_id, backupRunId: row.backup_run_id, status: row.status,
    isolated: true, productionOverwrite: false,
    ...(row.rto_milliseconds === null ? {} : { rtoMilliseconds: integer(row.rto_milliseconds, "rto_milliseconds") }),
    verification: verification(row.verification),
    ...(optionalTime(row.started_at, "started_at") === undefined ? {} : { startedAt: optionalTime(row.started_at, "started_at") }),
    ...(optionalTime(row.completed_at, "completed_at") === undefined ? {} : { completedAt: optionalTime(row.completed_at, "completed_at") }),
    createdAt: time(row.created_at, "created_at"), version: integer(row.version, "version"),
  };
}

export class PostgresControlPlaneBackupCoordinator {
  constructor(private readonly pool: BackupSqlPool, private readonly provider: ControlPlaneBackupProvider, private readonly clock: () => number = Date.now) {}

  async createBackup(input: { encryptionKeyRef: string; schemaMigration: string; rpoSeconds: number }): Promise<ControlPlaneBackupRun> {
    if (!/^[a-z][a-z0-9-]{2,63}$/u.test(this.provider.name)) throw new Error("invalid backup provider name");
    if (!KEY_REF.test(input.encryptionKeyRef)) throw new Error("backup encryptionKeyRef must be a KMS URI");
    if (!/^\d{3}_[a-z0-9_]+\.sql$/u.test(input.schemaMigration)) throw new Error("invalid schema migration id");
    if (!Number.isSafeInteger(input.rpoSeconds) || input.rpoSeconds < 0) throw new Error("invalid backup RPO");
    const id = `backup-${randomUUID()}`;
    const createdAt = new Date(this.clock()).toISOString();
    await this.pool.query<BackupRow>(
      `INSERT INTO control_plane_backup_runs
       (backup_run_id,provider,status,encryption_key_ref,schema_migration,rpo_seconds,created_at,version)
       VALUES ($1,$2,'planned',$3,$4,$5,$6,1)`,
      [id, this.provider.name, input.encryptionKeyRef, input.schemaMigration, input.rpoSeconds, createdAt],
    );
    const running = await this.transitionBackup(id, "planned", "running", { startedAt: createdAt });
    try {
      const artifact = await this.provider.createBackup({ backupRunId: id, encryptionKeyRef: input.encryptionKeyRef });
      if (!safeArtifactUri(artifact.artifactUri) || !DIGEST.test(artifact.artifactSha256)) throw new Error("backup provider returned invalid artifact metadata");
      time(artifact.snapshotAt, "snapshotAt");
      const completedAt = new Date(this.clock()).toISOString();
      const result = await this.pool.query<BackupRow>(
        `UPDATE control_plane_backup_runs SET status='verified',snapshot_at=$2,artifact_uri=$3,
         artifact_sha256=$4,completed_at=$5,version=version+1
         WHERE backup_run_id=$1 AND status='running' AND version=$6 RETURNING *`,
        [id, artifact.snapshotAt, artifact.artifactUri, artifact.artifactSha256, completedAt, running.version],
      );
      return backupFrom(result.rows[0]);
    } catch (error) {
      await this.failBackup(id);
      throw error;
    }
  }

  async runRestoreDrill(backupRunId: string): Promise<ControlPlaneRestoreDrill> {
    const backup = await this.getBackup(backupRunId);
    if (backup.status !== "verified" || backup.artifactUri === undefined || backup.artifactSha256 === undefined) throw new Error("restore drill requires a verified backup artifact");
    const id = `restore-${randomUUID()}`;
    const started = this.clock();
    const startedAt = new Date(started).toISOString();
    await this.pool.query<DrillRow>(
      `INSERT INTO control_plane_restore_drills
       (restore_drill_id,backup_run_id,status,isolated,production_overwrite,verification,created_at,version)
       VALUES ($1,$2,'planned',true,false,'{}'::jsonb,$3,1)`,
      [id, backupRunId, startedAt],
    );
    await this.pool.query<DrillRow>(
      "UPDATE control_plane_restore_drills SET status='running',started_at=$2,version=2 WHERE restore_drill_id=$1 AND status='planned' AND version=1",
      [id, startedAt],
    );
    try {
      const restored = await this.provider.restoreIsolated({ restoreDrillId: id, backup });
      const checked = verification(restored.verification);
      const completedAt = new Date(this.clock()).toISOString();
      const result = await this.pool.query<DrillRow>(
        `UPDATE control_plane_restore_drills SET status='verified',verification=$2::jsonb,
         rto_milliseconds=$3,completed_at=$4,version=3
         WHERE restore_drill_id=$1 AND status='running' AND version=2 AND isolated=true AND production_overwrite=false RETURNING *`,
        [id, JSON.stringify(checked), Math.max(0, this.clock() - started), completedAt],
      );
      return drillFrom(result.rows[0]);
    } catch (error) {
      await this.pool.query<DrillRow>(
        "UPDATE control_plane_restore_drills SET status='failed',completed_at=$2,version=version+1 WHERE restore_drill_id=$1 AND status='running' AND production_overwrite=false",
        [id, new Date(this.clock()).toISOString()],
      );
      throw error;
    }
  }

  async getBackup(backupRunId: string): Promise<ControlPlaneBackupRun> {
    const result = await this.pool.query<BackupRow>("SELECT * FROM control_plane_backup_runs WHERE backup_run_id=$1", [backupRunId]);
    return backupFrom(result.rows[0]);
  }

  private async transitionBackup(id: string, from: BackupRunStatus, to: BackupRunStatus, fields: { startedAt: string }): Promise<ControlPlaneBackupRun> {
    const result = await this.pool.query<BackupRow>(
      "UPDATE control_plane_backup_runs SET status=$3,started_at=$4,version=version+1 WHERE backup_run_id=$1 AND status=$2 RETURNING *",
      [id, from, to, fields.startedAt],
    );
    return backupFrom(result.rows[0]);
  }

  private async failBackup(id: string): Promise<void> {
    await this.pool.query<BackupRow>(
      "UPDATE control_plane_backup_runs SET status='failed',completed_at=$2,version=version+1 WHERE backup_run_id=$1 AND status='running'",
      [id, new Date(this.clock()).toISOString()],
    );
  }
}
