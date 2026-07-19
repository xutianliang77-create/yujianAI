import type {
  AuditEventV1,
  EnvironmentV1,
  OutboxEventV1,
  QuotaSnapshotV1,
  UsageRecordV1,
} from "@yujian/platform-contracts";

export interface PlatformPersistenceTransaction {
  insertAuditAndOutbox(audit: AuditEventV1, outbox: OutboxEventV1): Promise<void>;
  recordUsage(record: UsageRecordV1): Promise<UsageRecordV1>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface PlatformPersistenceAdapter {
  getEnvironment(environmentId: string): Promise<EnvironmentV1 | undefined>;
  quotaSnapshot(environmentId: string): Promise<QuotaSnapshotV1>;
  listUsage?(scope: { tenantId: string; projectId: string; environmentId: string }): Promise<readonly UsageRecordV1[]>;
  listAudit?(scope: { tenantId: string; projectId: string; environmentId: string }): Promise<readonly AuditEventV1[]>;
  begin(): Promise<PlatformPersistenceTransaction>;
  claimOutbox(limit: number): Promise<OutboxEventV1[]>;
  renewOutboxClaim(eventId: string): Promise<void>;
  markOutboxPublished(eventId: string, publishedAt: string): Promise<void>;
  markOutboxFailed?(eventId: string, error: string, nextAttemptAt?: string, deadLetteredAt?: string): Promise<void>;
  requeueOutbox?(eventId: string): Promise<void>;
  isWebhookDelivered?(eventId: string, destinationId: string): Promise<boolean>;
  markWebhookDelivered?(eventId: string, destinationId: string, deliveredAt: string): Promise<void>;
}

/** Production adapter contract; PlatformStore remains the no-I/O development implementation. */
export interface PlatformPersistenceOptions {
  postgresDsn: string;
  redisUrl: string;
  kmsKeyId: string;
}
