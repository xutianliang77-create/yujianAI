/** Versioned control-plane domain contracts shared by API, workers and tooling. */
export const PLATFORM_DOMAIN_VERSION = "platform.yujian.ai/domain/v1" as const;
export type TimestampV1 = string;

export type TenantStatusV1 = "trial" | "active" | "suspended" | "closing" | "closed";
export type ProjectStatusV1 = "active" | "suspended" | "closed";
export type EnvironmentTypeV1 = "dev" | "test" | "staging" | "prod";
export type EnvironmentStatusV1 = "active" | "suspended" | "retiring" | "retired";
export type PlatformRoleV1 =
  | "tenant_owner"
  | "tenant_admin"
  | "developer"
  | "billing_admin"
  | "security_auditor"
  | "support_operator"
  | "private_deployment_admin";
export type ApiKeyStatusV1 = "active" | "revoked" | "expired";
export type ActorTypeV1 = "human" | "service" | "system";
export type AuditResultV1 = "success" | "denied" | "failure";
export type AuditRiskLevelV1 = "low" | "medium" | "high" | "critical";

export interface TenantV1 {
  tenantId: string;
  displayName: string;
  status: TenantStatusV1;
  dataResidencyPolicy: string;
  planId: string;
  billingAccountId?: string;
  createdAt: TimestampV1;
  updatedAt: TimestampV1;
  version: number;
}

export interface TenantMemberV1 {
  tenantId: string;
  memberId: string;
  subject: string;
  roles: readonly PlatformRoleV1[];
  status: "invited" | "active" | "suspended" | "removed";
  createdAt: TimestampV1;
  updatedAt: TimestampV1;
  version: number;
}

export interface ProjectV1 {
  projectId: string;
  tenantId: string;
  name: string;
  slug: string;
  status: ProjectStatusV1;
  defaultRegionPolicyId: string;
  createdAt: TimestampV1;
  updatedAt: TimestampV1;
  version: number;
}

export interface EnvironmentV1 {
  environmentId: string;
  projectId: string;
  tenantId: string;
  name: string;
  type: EnvironmentTypeV1;
  status: EnvironmentStatusV1;
  endpoint: string;
  regionPolicyId: string;
  quotaPolicyId: string;
  retentionPolicyId: string;
  createdAt: TimestampV1;
  updatedAt: TimestampV1;
  version: number;
}

export interface ApiKeyMetadataV1 {
  apiKeyId: string;
  tenantId: string;
  projectId: string;
  environmentId: string;
  keyPrefix: string;
  scopes: readonly string[];
  status: ApiKeyStatusV1;
  expiresAt?: TimestampV1;
  lastUsedAt?: TimestampV1;
  createdAt: TimestampV1;
  revokedAt?: TimestampV1;
  version: number;
}

export interface IssuedApiKeyV1 {
  metadata: ApiKeyMetadataV1;
  /** Returned only by the create/rotate operation and never persisted in plaintext. */
  secret: string;
}

export interface CreateApiKeyRequestV1 {
  scopes: readonly string[];
  expiresAt?: TimestampV1;
}

export interface CreateTenantMemberRequestV1 {
  subject: string;
  roles: readonly PlatformRoleV1[];
}

export interface OnboardTenantRequestV1 {
  tenantDisplayName: string;
  projectName: string;
  projectSlug: string;
  environmentName: string;
}

export interface OnboardTenantResultV1 {
  tenant: TenantV1;
  member: TenantMemberV1;
  project: ProjectV1;
  environment: EnvironmentV1;
}

export interface UpdateTenantMemberRequestV1 {
  roles?: readonly PlatformRoleV1[];
  status?: "active" | "suspended" | "removed";
}

export interface RegionEndpointV1 {
  regionId: string;
  rtcUrl: string;
  turnUrls: readonly string[];
  status: "healthy" | "draining" | "unavailable";
  capacityScore: number;
  residencyTags: readonly string[];
}

export interface RegionPolicyV1 {
  regionPolicyId: string;
  allowedRegions: readonly string[];
  preferredRegions: readonly string[];
  residencyTags: readonly string[];
  version: number;
  updatedAt: TimestampV1;
}

export interface QuotaPolicyV1 {
  quotaPolicyId: string;
  maxRooms: number;
  maxParticipantsPerRoom: number;
  maxConcurrentParticipants: number;
  maxPublishers: number;
  maxSubscriptions: number;
  maxTracks: number;
  maxIngressJobs: number;
  maxEgressJobs: number;
  maxRecordingMinutesPerDay: number;
  maxSipConcurrentCalls: number;
  maxSipCallsPerMinute: number;
  maxTurnBytesPerMinute: number;
  maxTokenRequestsPerMinute: number;
  maxConcurrentTokenRequests: number;
  maxDataBytesPerMinute: number;
  maxAgentDispatchesPerMinute: number;
  maxAgentWorkers: number;
  maxModelTokensPerMinute: number;
  version: number;
  updatedAt: TimestampV1;
}

export interface UsageRecordV1 {
  usageRecordId: string;
  tenantId: string;
  projectId: string;
  environmentId: string;
  resourceType: string;
  resourceId: string;
  metric: string;
  quantity: number;
  unit: string;
  windowStart: TimestampV1;
  windowEnd: TimestampV1;
  source: string;
  dedupeKey: string;
  finalizedAt?: TimestampV1;
}

export interface AuditEventV1 {
  auditEventId: string;
  tenantId?: string;
  projectId?: string;
  environmentId?: string;
  actorType: ActorTypeV1;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  requestId: string;
  sourceIpHash?: string;
  result: AuditResultV1;
  riskLevel: AuditRiskLevelV1;
  occurredAt: TimestampV1;
  details?: Readonly<Record<string, string>>;
}

export interface OutboxEventV1<TPayload = unknown> {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  schemaVersion: string;
  producer: string;
  tenantId?: string;
  projectId?: string;
  environmentId?: string;
  resource: { type: string; id: string };
  payload: TPayload;
  occurredAt: TimestampV1;
  dedupeKey: string;
  traceId?: string;
  publishedAt?: TimestampV1;
  attemptCount: number;
}

export interface CreateTenantRequestV1 {
  displayName: string;
  dataResidencyPolicy?: string;
  planId?: string;
}

export interface CreateProjectRequestV1 {
  tenantId: string;
  name: string;
  slug: string;
  defaultRegionPolicyId?: string;
}

export interface CreateEnvironmentRequestV1 {
  tenantId: string;
  projectId: string;
  name: string;
  type: EnvironmentTypeV1;
  endpoint: string;
  regionPolicyId?: string;
  quotaPolicyId?: string;
  retentionPolicyId?: string;
}

export interface UpdateEnvironmentRequestV1 {
  version: number;
  name?: string;
  endpoint?: string;
  status?: EnvironmentStatusV1;
  regionPolicyId?: string;
  quotaPolicyId?: string;
  retentionPolicyId?: string;
}

export interface QuotaSnapshotV1 {
  environmentId: string;
  policy: QuotaPolicyV1;
  activeRooms: number;
  activeParticipants: number;
  activePublishers: number;
  activeSubscriptions: number;
  activeTracks: number;
  activeIngressJobs: number;
  activeEgressJobs: number;
  activeSipCalls: number;
  turnBytesInWindow: number;
  tokenRequestsInWindow: number;
  concurrentTokenRequests: number;
  agentWorkers: number;
  modelTokensInWindow: number;
  observedAt: TimestampV1;
}

export interface RoomPolicyV1 {
  roomPolicyId: string;
  environmentId: string;
  emptyTimeoutSeconds: number;
  maxParticipants: number;
  maxPublishers: number;
  enabledCodecs: readonly string[];
  recordingEnabled: boolean;
  metadataSizeLimit: number;
  version: number;
  updatedAt: TimestampV1;
}

export interface RoomInstanceV1 {
  roomName: string;
  roomSid?: string;
  environmentId: string;
  regionId?: string;
  createdAt: TimestampV1;
  endedAt?: TimestampV1;
  closeReason?: string;
  policySnapshot?: Readonly<Record<string, unknown>>;
}

export interface ParticipantInstanceV1 {
  roomName: string;
  roomSid?: string;
  participantIdentity: string;
  participantSid?: string;
  kind?: string;
  joinedAt: TimestampV1;
  leftAt?: TimestampV1;
  disconnectReason?: string;
  sourceIpHash?: string;
  clientInfo?: Readonly<Record<string, string>>;
}

export interface TrackInstanceV1 {
  trackSid: string;
  participantSid: string;
  kind: "audio" | "video" | "data" | string;
  source?: string;
  codec?: string;
  publishedAt: TimestampV1;
  unpublishedAt?: TimestampV1;
  qualitySummary?: Readonly<Record<string, number>>;
}

export interface SipTrunkV1 {
  trunkId: string;
  environmentId: string;
  direction: "inbound" | "outbound" | "bidirectional";
  provider: string;
  region: string;
  /** KMS/provider references or irreversible hashes; never complete phone numbers. */
  numberRefs: readonly string[];
  credentialRef: string;
  allowedDestinationPrefixes: readonly string[];
  secureTransport: "tls-srtp" | "provider-managed";
  fraudPolicyRef: string;
  dispatchRuleRef: string;
  maxConcurrentCalls: number;
  maxCallsPerMinute: number;
  maxDailyCostMicros: number;
  allowInternational: boolean;
  status: "active" | "suspended" | "retiring";
  version: number;
  updatedAt: string;
}

export interface ProviderBindingV1 {
  bindingId: string;
  environmentId: string;
  capability: "llm" | "realtime_model" | "asr" | "tts" | "vlm" | "moderation";
  provider: string;
  model: string;
  region?: string;
  secretRef: string;
  dataPolicy: string;
  timeoutMs: number;
  costPolicy?: string;
}
