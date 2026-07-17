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
  connect?(): Promise<PlatformStoreSqlConnection>;
}

export interface PlatformStoreSqlConnection extends PlatformStoreSqlPool {
  release(): Promise<void> | void;
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
    if (this.pool.connect === undefined) {
      this.version = await this.saveSnapshot(this.pool, snapshot);
      return;
    }
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      await this.projectDomain(connection, snapshot);
      const version = await this.saveSnapshot(connection, snapshot);
      await connection.query("COMMIT");
      this.version = version;
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      await connection.release();
    }
  }

  private async saveSnapshot(pool: PlatformStoreSqlPool, snapshot: PlatformStoreSnapshot): Promise<number> {
    const result = await pool.query<{ version: string | number }>(
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
    return version;
  }

  private async projectDomain(pool: PlatformStoreSqlPool, snapshot: PlatformStoreSnapshot): Promise<void> {
    for (const tenant of snapshot.tenants) await pool.query(
      `INSERT INTO tenants (tenant_id, display_name, status, data_residency_policy, plan_id, billing_account_id, created_at, updated_at, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (tenant_id) DO UPDATE SET display_name=EXCLUDED.display_name, status=EXCLUDED.status,
         data_residency_policy=EXCLUDED.data_residency_policy, plan_id=EXCLUDED.plan_id,
         billing_account_id=EXCLUDED.billing_account_id, updated_at=EXCLUDED.updated_at, version=EXCLUDED.version`,
      [tenant.tenantId, tenant.displayName, tenant.status, tenant.dataResidencyPolicy, tenant.planId, tenant.billingAccountId ?? null, tenant.createdAt, tenant.updatedAt, tenant.version],
    );
    for (const project of snapshot.projects) await pool.query(
      `INSERT INTO projects (project_id, tenant_id, name, slug, status, default_region_policy_id, created_at, updated_at, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (project_id) DO UPDATE SET name=EXCLUDED.name, status=EXCLUDED.status,
         default_region_policy_id=EXCLUDED.default_region_policy_id, updated_at=EXCLUDED.updated_at, version=EXCLUDED.version`,
      [project.projectId, project.tenantId, project.name, project.slug, project.status, project.defaultRegionPolicyId, project.createdAt, project.updatedAt, project.version],
    );
    for (const quota of snapshot.quotas) await pool.query(
      `INSERT INTO quota_policies (quota_policy_id, max_rooms, max_participants_per_room, max_concurrent_participants,
         max_publishers, max_subscriptions, max_tracks, max_ingress_jobs, max_egress_jobs, max_recording_minutes_per_day,
         max_sip_concurrent_calls, max_sip_calls_per_minute, max_turn_bytes_per_minute, max_token_requests_per_minute,
         max_concurrent_token_requests, max_data_bytes_per_minute, max_agent_dispatches_per_minute, max_agent_workers,
         max_model_tokens_per_minute, version, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (quota_policy_id) DO UPDATE SET max_rooms=EXCLUDED.max_rooms,
         max_participants_per_room=EXCLUDED.max_participants_per_room, max_concurrent_participants=EXCLUDED.max_concurrent_participants,
         max_publishers=EXCLUDED.max_publishers, max_subscriptions=EXCLUDED.max_subscriptions, max_tracks=EXCLUDED.max_tracks,
         max_ingress_jobs=EXCLUDED.max_ingress_jobs, max_egress_jobs=EXCLUDED.max_egress_jobs,
         max_recording_minutes_per_day=EXCLUDED.max_recording_minutes_per_day, max_sip_concurrent_calls=EXCLUDED.max_sip_concurrent_calls,
         max_sip_calls_per_minute=EXCLUDED.max_sip_calls_per_minute, max_turn_bytes_per_minute=EXCLUDED.max_turn_bytes_per_minute,
         max_token_requests_per_minute=EXCLUDED.max_token_requests_per_minute, max_concurrent_token_requests=EXCLUDED.max_concurrent_token_requests,
         max_data_bytes_per_minute=EXCLUDED.max_data_bytes_per_minute, max_agent_dispatches_per_minute=EXCLUDED.max_agent_dispatches_per_minute,
         max_agent_workers=EXCLUDED.max_agent_workers, max_model_tokens_per_minute=EXCLUDED.max_model_tokens_per_minute,
         version=EXCLUDED.version, updated_at=EXCLUDED.updated_at`,
      [quota.quotaPolicyId, quota.maxRooms, quota.maxParticipantsPerRoom, quota.maxConcurrentParticipants, quota.maxPublishers,
        quota.maxSubscriptions, quota.maxTracks, quota.maxIngressJobs, quota.maxEgressJobs, quota.maxRecordingMinutesPerDay,
        quota.maxSipConcurrentCalls, quota.maxSipCallsPerMinute, quota.maxTurnBytesPerMinute, quota.maxTokenRequestsPerMinute,
        quota.maxConcurrentTokenRequests, quota.maxDataBytesPerMinute, quota.maxAgentDispatchesPerMinute, quota.maxAgentWorkers,
        quota.maxModelTokensPerMinute, quota.version, quota.updatedAt],
    );
    for (const environment of snapshot.environments) await pool.query(
      `INSERT INTO environments (environment_id, tenant_id, project_id, name, type, status, endpoint, region_policy_id,
         quota_policy_id, retention_policy_id, created_at, updated_at, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (environment_id) DO UPDATE SET name=EXCLUDED.name, type=EXCLUDED.type, status=EXCLUDED.status,
         endpoint=EXCLUDED.endpoint, region_policy_id=EXCLUDED.region_policy_id, quota_policy_id=EXCLUDED.quota_policy_id,
         retention_policy_id=EXCLUDED.retention_policy_id, updated_at=EXCLUDED.updated_at, version=EXCLUDED.version`,
      [environment.environmentId, environment.tenantId, environment.projectId, environment.name, environment.type,
        environment.status, environment.endpoint, environment.regionPolicyId, environment.quotaPolicyId,
        environment.retentionPolicyId, environment.createdAt, environment.updatedAt, environment.version],
    );
    for (const member of snapshot.members) await pool.query(
      `INSERT INTO tenant_members (member_id, tenant_id, subject, roles, status, created_at, updated_at, version)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)
       ON CONFLICT (member_id) DO UPDATE SET roles=EXCLUDED.roles, status=EXCLUDED.status,
         updated_at=EXCLUDED.updated_at, version=EXCLUDED.version`,
      [member.memberId, member.tenantId, member.subject, JSON.stringify(member.roles), member.status, member.createdAt, member.updatedAt, member.version],
    );
  }
}
