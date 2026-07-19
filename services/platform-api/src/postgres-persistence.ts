import { randomUUID } from "node:crypto";
import type {
  AuditEventV1,
  EnvironmentV1,
  OutboxEventV1,
  QuotaPolicyV1,
  QuotaSnapshotV1,
  UsageRecordV1,
} from "@yujian/platform-contracts";
import type {
  PlatformPersistenceAdapter,
  PlatformPersistenceTransaction,
} from "./persistence.js";

export interface SqlResult<Row extends object> {
  rows: readonly Row[];
}

export interface SqlConnection {
  query<Row extends object>(text: string, values?: readonly unknown[]): Promise<SqlResult<Row>>;
  release(): Promise<void> | void;
}

export interface SqlPool {
  query<Row extends object>(text: string, values?: readonly unknown[]): Promise<SqlResult<Row>>;
  connect(): Promise<SqlConnection>;
}

type EnvironmentRow = {
  environment_id: string;
  project_id: string;
  tenant_id: string;
  name: string;
  type: EnvironmentV1["type"];
  status: EnvironmentV1["status"];
  endpoint: string;
  region_policy_id: string;
  quota_policy_id: string;
  retention_policy_id: string;
  created_at: string;
  updated_at: string;
  version: string | number;
};

type QuotaRow = {
  quota_policy_id: string;
  [key: string]: string | number;
};

function numberOf(row: object, key: string): number {
  const values = row as Record<string, unknown>;
  const value = values[key];
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result)) throw new Error(`invalid numeric SQL value: ${key}`);
  return result;
}

function environmentFrom(row: EnvironmentRow): EnvironmentV1 {
  return {
    environmentId: row.environment_id,
    projectId: row.project_id,
    tenantId: row.tenant_id,
    name: row.name,
    type: row.type,
    status: row.status,
    endpoint: row.endpoint,
    regionPolicyId: row.region_policy_id,
    quotaPolicyId: row.quota_policy_id,
    retentionPolicyId: row.retention_policy_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    version: numberOf(row, "version"),
  };
}

function quotaFrom(row: QuotaRow): QuotaPolicyV1 {
  return {
    quotaPolicyId: row.quota_policy_id,
    maxRooms: numberOf(row, "max_rooms"),
    maxParticipantsPerRoom: numberOf(row, "max_participants_per_room"),
    maxConcurrentParticipants: numberOf(row, "max_concurrent_participants"),
    maxPublishers: numberOf(row, "max_publishers"),
    maxSubscriptions: numberOf(row, "max_subscriptions"),
    maxTracks: numberOf(row, "max_tracks"),
    maxIngressJobs: numberOf(row, "max_ingress_jobs"),
    maxEgressJobs: numberOf(row, "max_egress_jobs"),
    maxRecordingMinutesPerDay: numberOf(row, "max_recording_minutes_per_day"),
    maxSipConcurrentCalls: numberOf(row, "max_sip_concurrent_calls"),
    maxSipCallsPerMinute: numberOf(row, "max_sip_calls_per_minute"),
    maxTurnBytesPerMinute: numberOf(row, "max_turn_bytes_per_minute"),
    maxTokenRequestsPerMinute: numberOf(row, "max_token_requests_per_minute"),
    maxConcurrentTokenRequests: numberOf(row, "max_concurrent_token_requests"),
    maxDataBytesPerMinute: numberOf(row, "max_data_bytes_per_minute"),
    maxAgentDispatchesPerMinute: numberOf(row, "max_agent_dispatches_per_minute"),
    maxAgentWorkers: numberOf(row, "max_agent_workers"),
    maxModelTokensPerMinute: numberOf(row, "max_model_tokens_per_minute"),
    version: numberOf(row, "version"),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function usageFrom(row: Record<string, unknown>): UsageRecordV1 {
  return {
    usageRecordId: String(row.usage_record_id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    environmentId: String(row.environment_id),
    resourceType: String(row.resource_type),
    resourceId: String(row.resource_id),
    metric: String(row.metric),
    quantity: numberOf(row, "quantity"),
    unit: String(row.unit),
    windowStart: new Date(String(row.window_start)).toISOString(),
    windowEnd: new Date(String(row.window_end)).toISOString(),
    source: String(row.source),
    dedupeKey: String(row.dedupe_key),
    ...(row.finalized_at === null || row.finalized_at === undefined
      ? {}
      : { finalizedAt: new Date(String(row.finalized_at)).toISOString() }),
  };
}

function auditFrom(row: Record<string, unknown>): AuditEventV1 {
  const actorType = row.actor_type;
  const result = row.result;
  const riskLevel = row.risk_level;
  if (actorType !== "human" && actorType !== "service" && actorType !== "system") throw new Error("invalid audit actor type SQL value");
  if (result !== "success" && result !== "denied" && result !== "failure") throw new Error("invalid audit result SQL value");
  if (riskLevel !== "low" && riskLevel !== "medium" && riskLevel !== "high" && riskLevel !== "critical") throw new Error("invalid audit risk level SQL value");
  const details = row.details;
  if (details !== null && details !== undefined && (typeof details !== "object" || Array.isArray(details))) {
    throw new Error("invalid audit details SQL value");
  }
  const normalizedDetails = details === null || details === undefined
    ? undefined
    : Object.fromEntries(Object.entries(details as Record<string, unknown>).map(([key, value]) => {
        if (typeof value !== "string") throw new Error("audit detail values must be strings");
        return [key, value];
      }));
  return {
    auditEventId: String(row.audit_event_id),
    ...(row.tenant_id === null || row.tenant_id === undefined ? {} : { tenantId: String(row.tenant_id) }),
    ...(row.project_id === null || row.project_id === undefined ? {} : { projectId: String(row.project_id) }),
    ...(row.environment_id === null || row.environment_id === undefined ? {} : { environmentId: String(row.environment_id) }),
    actorType,
    actorId: String(row.actor_id),
    action: String(row.action),
    resourceType: String(row.resource_type),
    ...(row.resource_id === null || row.resource_id === undefined ? {} : { resourceId: String(row.resource_id) }),
    requestId: String(row.request_id),
    ...(row.source_ip_hash === null || row.source_ip_hash === undefined ? {} : { sourceIpHash: String(row.source_ip_hash) }),
    result,
    riskLevel,
    occurredAt: new Date(String(row.occurred_at)).toISOString(),
    ...(normalizedDetails === undefined ? {} : { details: normalizedDetails }),
  };
}

function outboxFrom(row: Record<string, unknown>): OutboxEventV1 {
  return {
    eventId: String(row.event_id),
    aggregateType: String(row.aggregate_type),
    aggregateId: String(row.aggregate_id),
    eventType: String(row.event_type),
    schemaVersion: String(row.schema_version),
    producer: String(row.producer),
    ...(row.tenant_id === null || row.tenant_id === undefined ? {} : { tenantId: String(row.tenant_id) }),
    ...(row.project_id === null || row.project_id === undefined ? {} : { projectId: String(row.project_id) }),
    ...(row.environment_id === null || row.environment_id === undefined ? {} : { environmentId: String(row.environment_id) }),
    resource: row.resource as OutboxEventV1["resource"],
    payload: row.payload,
    occurredAt: new Date(String(row.occurred_at)).toISOString(),
    dedupeKey: String(row.dedupe_key),
    ...(row.trace_id === null || row.trace_id === undefined ? {} : { traceId: String(row.trace_id) }),
    ...(row.published_at === null || row.published_at === undefined ? {} : { publishedAt: new Date(String(row.published_at)).toISOString() }),
    attemptCount: numberOf(row, "attempt_count"),
  };
}

class SqlPersistenceTransaction implements PlatformPersistenceTransaction {
  constructor(private readonly connection: SqlConnection) {}

  async insertAuditAndOutbox(audit: AuditEventV1, outbox: OutboxEventV1): Promise<void> {
    await this.connection.query(
      `INSERT INTO audit_events (audit_event_id, tenant_id, project_id, environment_id, actor_type, actor_id, action, resource_type, resource_id, request_id, source_ip_hash, result, risk_level, occurred_at, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [audit.auditEventId, audit.tenantId ?? null, audit.projectId ?? null, audit.environmentId ?? null, audit.actorType, audit.actorId, audit.action, audit.resourceType, audit.resourceId ?? null, audit.requestId, audit.sourceIpHash ?? null, audit.result, audit.riskLevel, audit.occurredAt, audit.details ?? null],
    );
    await this.connection.query(
      `INSERT INTO outbox_events (event_id, aggregate_type, aggregate_id, event_type, schema_version, producer, tenant_id, project_id, environment_id, resource, payload, occurred_at, dedupe_key, trace_id, attempt_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [outbox.eventId, outbox.aggregateType, outbox.aggregateId, outbox.eventType, outbox.schemaVersion, outbox.producer, outbox.tenantId ?? null, outbox.projectId ?? null, outbox.environmentId ?? null, outbox.resource, outbox.payload, outbox.occurredAt, outbox.dedupeKey, outbox.traceId ?? null, outbox.attemptCount],
    );
  }

  async recordUsage(record: UsageRecordV1): Promise<UsageRecordV1> {
    const result = await this.connection.query<Record<string, unknown>>(
      `INSERT INTO usage_records (usage_record_id, tenant_id, project_id, environment_id, resource_type, resource_id, metric, quantity, unit, window_start, window_end, source, dedupe_key, finalized_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (dedupe_key) DO UPDATE SET dedupe_key = EXCLUDED.dedupe_key
       RETURNING *`,
      [record.usageRecordId, record.tenantId, record.projectId, record.environmentId, record.resourceType, record.resourceId, record.metric, record.quantity, record.unit, record.windowStart, record.windowEnd, record.source, record.dedupeKey, record.finalizedAt ?? null],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("usage insert returned no row");
    return usageFrom(row);
  }

  async commit(): Promise<void> {
    try {
      await this.connection.query("COMMIT");
    } finally {
      await this.connection.release();
    }
  }

  async rollback(): Promise<void> {
    try { await this.connection.query("ROLLBACK"); } finally { await this.connection.release(); }
  }
}

export class PostgresPlatformPersistence implements PlatformPersistenceAdapter {
  private readonly outboxClaims = new Map<string, string>();

  constructor(private readonly pool: SqlPool) {}

  async getEnvironment(environmentId: string): Promise<EnvironmentV1 | undefined> {
    const result = await this.pool.query<EnvironmentRow>("SELECT * FROM environments WHERE environment_id = $1", [environmentId]);
    const row = result.rows[0];
    return row === undefined ? undefined : environmentFrom(row);
  }

  async quotaSnapshot(environmentId: string): Promise<QuotaSnapshotV1> {
    const result = await this.pool.query<QuotaRow>(
      `SELECT q.* FROM quota_policies q JOIN environments e ON e.quota_policy_id = q.quota_policy_id WHERE e.environment_id = $1`,
      [environmentId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error(`quota policy not found for environment ${environmentId}`);
    const policy = quotaFrom(row);
    const now = new Date().toISOString();
    return {
      environmentId,
      policy,
      activeRooms: 0,
      activeParticipants: 0,
      activePublishers: 0,
      activeSubscriptions: 0,
      activeTracks: 0,
      activeIngressJobs: 0,
      activeEgressJobs: 0,
      activeSipCalls: 0,
      turnBytesInWindow: 0,
      tokenRequestsInWindow: 0,
      concurrentTokenRequests: 0,
      agentWorkers: 0,
      modelTokensInWindow: 0,
      observedAt: now,
    };
  }

  async listUsage(scope: { tenantId: string; projectId: string; environmentId: string }): Promise<readonly UsageRecordV1[]> {
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM usage_records
       WHERE tenant_id = $1 AND project_id = $2 AND environment_id = $3
       ORDER BY window_start DESC, usage_record_id DESC`,
      [scope.tenantId, scope.projectId, scope.environmentId],
    );
    return result.rows.map(usageFrom);
  }

  async listAudit(scope: { tenantId: string; projectId: string; environmentId: string }): Promise<readonly AuditEventV1[]> {
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM audit_events
       WHERE tenant_id = $1 AND project_id = $2 AND environment_id = $3
       ORDER BY occurred_at DESC, audit_event_id DESC`,
      [scope.tenantId, scope.projectId, scope.environmentId],
    );
    return result.rows.map(auditFrom);
  }

  async begin(): Promise<PlatformPersistenceTransaction> {
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      return new SqlPersistenceTransaction(connection);
    } catch (error) {
      await connection.release();
      throw error;
    }
  }

  async claimOutbox(limit: number): Promise<OutboxEventV1[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("outbox limit must be 1-1000");
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      const result = await connection.query<Record<string, unknown>>(
        `SELECT * FROM outbox_events
         WHERE published_at IS NULL AND dead_lettered_at IS NULL
           AND (next_attempt_at IS NULL OR next_attempt_at <= now())
           AND (claimed_until IS NULL OR claimed_until <= now())
         ORDER BY occurred_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [limit],
      );
      const ids = result.rows.map((row) => String(row.event_id));
      const claimToken = randomUUID();
      if (ids.length > 0) await connection.query(
        "UPDATE outbox_events SET attempt_count = attempt_count + 1, claimed_until = now() + interval '60 seconds', claim_token = $2, claim_renewal_count = 0 WHERE event_id = ANY($1::text[])",
        [ids, claimToken],
      );
      await connection.query("COMMIT");
      await connection.release();
      for (const eventId of ids) this.outboxClaims.set(eventId, claimToken);
      return result.rows.map(outboxFrom);
    } catch (error) {
      try { await connection.query("ROLLBACK"); } finally { await connection.release(); }
      throw error;
    }
  }

  async renewOutboxClaim(eventId: string): Promise<void> {
    const claimToken = this.outboxClaim(eventId);
    const result = await this.pool.query<{ event_id: string }>(
      `UPDATE outbox_events
       SET claimed_until = now() + interval '60 seconds', claim_renewal_count = claim_renewal_count + 1
       WHERE event_id = $1 AND claim_token = $2 AND published_at IS NULL AND dead_lettered_at IS NULL
       RETURNING event_id`,
      [eventId, claimToken],
    );
    if (result.rows.length !== 1) {
      this.outboxClaims.delete(eventId);
      throw new Error("outbox claim ownership was lost");
    }
  }

  async markOutboxPublished(eventId: string, publishedAt: string): Promise<void> {
    const claimToken = this.outboxClaim(eventId);
    const result = await this.pool.query<{ event_id: string }>(
      "UPDATE outbox_events SET published_at = $2, claimed_until = NULL, claim_token = NULL WHERE event_id = $1 AND claim_token = $3 AND published_at IS NULL RETURNING event_id",
      [eventId, publishedAt, claimToken],
    );
    this.outboxClaims.delete(eventId);
    if (result.rows.length !== 1) throw new Error("outbox publish claim ownership was lost");
  }

  async markOutboxFailed(eventId: string, error: string, nextAttemptAt?: string, deadLetteredAt?: string): Promise<void> {
    const claimToken = this.outboxClaim(eventId);
    const result = await this.pool.query<{ event_id: string }>(
      `UPDATE outbox_events
       SET last_error = $2, next_attempt_at = $3, dead_lettered_at = $4, claimed_until = NULL, claim_token = NULL
       WHERE event_id = $1 AND claim_token = $5 AND published_at IS NULL RETURNING event_id`,
      [eventId, error.slice(0, 2048), nextAttemptAt ?? null, deadLetteredAt ?? null, claimToken],
    );
    this.outboxClaims.delete(eventId);
    if (result.rows.length !== 1) throw new Error("outbox failure claim ownership was lost");
  }

  async requeueOutbox(eventId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE outbox_events
       SET next_attempt_at = now(), last_error = NULL, dead_lettered_at = NULL, claimed_until = NULL, claim_token = NULL, claim_renewal_count = 0
       WHERE event_id = $1 AND published_at IS NULL AND dead_lettered_at IS NOT NULL
       RETURNING event_id`,
      [eventId],
    );
    this.outboxClaims.delete(eventId);
    if (result.rows.length === 0) throw new Error("outbox event is not a dead letter or was already published");
  }

  async isWebhookDelivered(eventId: string, destinationId: string): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM webhook_deliveries WHERE event_id = $1 AND destination_id = $2 AND delivered_at IS NOT NULL",
      [eventId, destinationId],
    );
    return result.rows.length > 0;
  }

  async markWebhookDelivered(eventId: string, destinationId: string, deliveredAt: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO webhook_deliveries (event_id, destination_id, delivered_at, updated_at)
       VALUES ($1,$2,$3,now())
       ON CONFLICT (event_id, destination_id) DO UPDATE
       SET delivered_at = COALESCE(webhook_deliveries.delivered_at, EXCLUDED.delivered_at), updated_at = now()`,
      [eventId, destinationId, deliveredAt],
    );
  }

  private outboxClaim(eventId: string): string {
    const claimToken = this.outboxClaims.get(eventId);
    if (claimToken === undefined) throw new Error("outbox event is not claimed by this persistence instance");
    return claimToken;
  }
}
