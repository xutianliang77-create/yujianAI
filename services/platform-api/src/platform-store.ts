import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  AuditEventV1,
  CreateEnvironmentRequestV1,
  CreateTenantMemberRequestV1,
  CreateProjectRequestV1,
  CreateTenantRequestV1,
  EnvironmentV1,
  ApiKeyMetadataV1,
  IssuedApiKeyV1,
  OnboardTenantRequestV1,
  OnboardTenantResultV1,
  OutboxEventV1,
  PlatformScopeV1,
  ProjectV1,
  QuotaPolicyV1,
  QuotaSnapshotV1,
  TenantMemberV1,
  TenantV1,
  UpdateTenantMemberRequestV1,
  UsageRecordV1,
} from "@yujian/platform-contracts";

export type StoreErrorCodeV1 =
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_CONFLICT"
  | "QUOTA_EXCEEDED"
  | "AUTHORIZATION_FAILED";

export class PlatformStoreError extends Error {
  readonly code: StoreErrorCodeV1;
  readonly statusCode: number;

  constructor(code: StoreErrorCodeV1, message: string) {
    super(message);
    this.name = "PlatformStoreError";
    this.code = code;
    this.statusCode = code === "RESOURCE_NOT_FOUND"
      ? 404
      : code === "RESOURCE_CONFLICT"
        ? 409
        : code === "AUTHORIZATION_FAILED"
          ? 403
          : 429;
  }
}

export interface PlatformStoreClock {
  now(): Date;
}

export interface PlatformStoreOptions {
  /** Grace period during which the previous API key secret remains accepted after rotation. */
  apiKeyGraceMs?: number;
}

export interface PlatformStoreSeed {
  scope: PlatformScopeV1;
  endpoint: string;
}

export interface PlatformStoreSnapshot {
  tenants: readonly TenantV1[];
  members: readonly TenantMemberV1[];
  projects: readonly ProjectV1[];
  environments: readonly EnvironmentV1[];
  quotas: readonly QuotaPolicyV1[];
  apiKeys: readonly ApiKeyMetadataV1[];
  usage: readonly UsageRecordV1[];
  audits: readonly AuditEventV1[];
  outbox: readonly OutboxEventV1[];
  apiKeySecretHashes: readonly { apiKeyId: string; hash: string }[];
  apiKeyGraceHashes: readonly { apiKeyId: string; hash: string; expiresAt: number }[];
  tokenWindows: readonly { environmentId: string; startMs: number; requests: number; concurrent: number }[];
  idempotency?: readonly { cacheKey: string; fingerprint?: string; value?: unknown; tombstone?: boolean }[];
}

interface TokenWindow {
  startMs: number;
  requests: number;
  concurrent: number;
}

const DEFAULT_QUOTA: Omit<QuotaPolicyV1, "quotaPolicyId" | "updatedAt"> = {
  maxRooms: 100,
  maxParticipantsPerRoom: 100,
  maxConcurrentParticipants: 500,
  maxPublishers: 100,
  maxSubscriptions: 500,
  maxTracks: 500,
  maxIngressJobs: 20,
  maxEgressJobs: 20,
  maxRecordingMinutesPerDay: 10_000,
  maxSipConcurrentCalls: 0,
  maxSipCallsPerMinute: 0,
  maxTurnBytesPerMinute: 100 * 1024 * 1024,
  maxTokenRequestsPerMinute: 600,
  maxConcurrentTokenRequests: 50,
  maxDataBytesPerMinute: 10 * 1024 * 1024,
  maxAgentDispatchesPerMinute: 120,
  maxAgentWorkers: 10,
  maxModelTokensPerMinute: 100_000,
  version: 1,
};

function id(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function iso(clock: PlatformStoreClock): string {
  return clock.now().toISOString();
}

function scopedKey(key: string | undefined, ...scope: string[]): string | undefined {
  return key === undefined ? undefined : `${scope.join(":")}:${key}`;
}

function fingerprintEntry(fingerprints: ReadonlyMap<string, string>, cacheKey: string): { fingerprint?: string } {
  const fingerprint = fingerprints.get(cacheKey);
  return fingerprint === undefined ? {} : { fingerprint };
}

export class PlatformStore {
  readonly tenants = new Map<string, TenantV1>();
  readonly members = new Map<string, TenantMemberV1>();
  readonly projects = new Map<string, ProjectV1>();
  readonly environments = new Map<string, EnvironmentV1>();
  readonly quotas = new Map<string, QuotaPolicyV1>();
  readonly apiKeys = new Map<string, ApiKeyMetadataV1>();
  readonly usage = new Map<string, UsageRecordV1>();
  readonly audits = new Map<string, AuditEventV1>();
  readonly outbox = new Map<string, OutboxEventV1>();

  private readonly clock: PlatformStoreClock;
  private readonly idempotency = new Map<string, unknown>();
  private readonly idempotencyFingerprints = new Map<string, string>();
  private readonly idempotencyTombstones = new Set<string>();
  private readonly apiKeySecretHashes = new Map<string, string>();
  private readonly apiKeyGraceHashes = new Map<string, { hash: string; expiresAt: number }>();
  private readonly tokenWindows = new Map<string, TokenWindow>();
  private readonly apiKeyGraceMs: number;

  constructor(clock: PlatformStoreClock = { now: () => new Date() }, options: PlatformStoreOptions = {}) {
    this.clock = clock;
    this.apiKeyGraceMs = options.apiKeyGraceMs ?? 300_000;
    if (!Number.isInteger(this.apiKeyGraceMs) || this.apiKeyGraceMs < 0 || this.apiKeyGraceMs > 86_400_000) throw new RangeError("api key grace period must be 0-86400000ms");
  }

  snapshot(): PlatformStoreSnapshot {
    return {
      tenants: [...this.tenants.values()],
      members: [...this.members.values()],
      projects: [...this.projects.values()],
      environments: [...this.environments.values()],
      quotas: [...this.quotas.values()],
      apiKeys: [...this.apiKeys.values()],
      usage: [...this.usage.values()],
      audits: [...this.audits.values()],
      outbox: [...this.outbox.values()],
      apiKeySecretHashes: [...this.apiKeySecretHashes.entries()].map(([apiKeyId, hash]) => ({ apiKeyId, hash })),
      apiKeyGraceHashes: [...this.apiKeyGraceHashes.entries()].map(([apiKeyId, value]) => ({ apiKeyId, ...value })),
      tokenWindows: [...this.tokenWindows.entries()].map(([environmentId, value]) => ({ environmentId, ...value })),
      idempotency: [
        ...[...this.idempotency.entries()].map(([cacheKey, value]) => cacheKey.startsWith("api-key")
          ? { cacheKey, tombstone: true, ...fingerprintEntry(this.idempotencyFingerprints, cacheKey) }
          : { cacheKey, value, ...fingerprintEntry(this.idempotencyFingerprints, cacheKey) }),
        ...[...this.idempotencyTombstones].map((cacheKey) => ({ cacheKey, tombstone: true, ...fingerprintEntry(this.idempotencyFingerprints, cacheKey) })),
      ],
    };
  }

  restore(snapshot: PlatformStoreSnapshot): void {
    if (typeof snapshot !== "object" || snapshot === null) throw new Error("platform store snapshot must be an object");
    const collections = [
      [snapshot.tenants, "tenantId"], [snapshot.members, "memberId"], [snapshot.projects, "projectId"],
      [snapshot.environments, "environmentId"], [snapshot.quotas, "quotaPolicyId"], [snapshot.apiKeys, "apiKeyId"],
      [snapshot.usage, "usageRecordId"], [snapshot.audits, "auditEventId"], [snapshot.outbox, "eventId"],
    ] as const;
    const maps = collections.map(([values, field]) => {
      if (!Array.isArray(values)) throw new Error(`platform store snapshot ${field} must be an array`);
      const map = new Map<string, object>();
      for (const value of values) {
        if (typeof value !== "object" || value === null) throw new Error(`platform store snapshot ${field} contains an invalid value`);
        const idValue = (value as Record<string, unknown>)[field];
        if (typeof idValue !== "string" || idValue.length === 0 || map.has(idValue)) throw new Error(`platform store snapshot ${field} contains an invalid id`);
        map.set(idValue, value);
      }
      return map;
    });
    if (!Array.isArray(snapshot.apiKeySecretHashes) || !Array.isArray(snapshot.apiKeyGraceHashes) || !Array.isArray(snapshot.tokenWindows) || (snapshot.idempotency !== undefined && !Array.isArray(snapshot.idempotency))) throw new Error("platform store snapshot auxiliary collections are invalid");
    const tenantIds = new Set(maps[0]!.keys());
    const projectIds = new Set(maps[2]!.keys());
    const environmentIds = new Set(maps[3]!.keys());
    const quotaIds = new Set(maps[4]!.keys());
    for (const value of maps[2]!.values()) if (!tenantIds.has(String((value as ProjectV1).tenantId))) throw new Error("project snapshot references an unknown tenant");
    for (const value of maps[3]!.values()) {
      const environment = value as EnvironmentV1;
      if (!tenantIds.has(environment.tenantId) || !projectIds.has(environment.projectId) || !quotaIds.has(environment.quotaPolicyId)) throw new Error("environment snapshot references an unknown resource");
    }
    for (const value of maps[1]!.values()) if (!tenantIds.has(String((value as TenantMemberV1).tenantId))) throw new Error("member snapshot references an unknown tenant");
    for (const value of maps[5]!.values()) {
      const key = value as ApiKeyMetadataV1;
      if (!tenantIds.has(key.tenantId) || !projectIds.has(key.projectId) || !environmentIds.has(key.environmentId)) throw new Error("API key snapshot references an unknown resource");
    }
    this.tenants.clear(); this.members.clear(); this.projects.clear(); this.environments.clear(); this.quotas.clear();
    this.apiKeys.clear(); this.usage.clear(); this.audits.clear(); this.outbox.clear(); this.apiKeySecretHashes.clear();
    this.apiKeyGraceHashes.clear(); this.tokenWindows.clear(); this.idempotency.clear(); this.idempotencyFingerprints.clear(); this.idempotencyTombstones.clear();
    for (const [key, value] of maps[0]!) this.tenants.set(key, value as TenantV1);
    for (const [key, value] of maps[1]!) this.members.set(key, value as TenantMemberV1);
    for (const [key, value] of maps[2]!) this.projects.set(key, value as ProjectV1);
    for (const [key, value] of maps[3]!) this.environments.set(key, value as EnvironmentV1);
    for (const [key, value] of maps[4]!) this.quotas.set(key, value as QuotaPolicyV1);
    for (const [key, value] of maps[5]!) this.apiKeys.set(key, value as ApiKeyMetadataV1);
    for (const [key, value] of maps[6]!) this.usage.set(key, value as UsageRecordV1);
    for (const [key, value] of maps[7]!) this.audits.set(key, value as AuditEventV1);
    for (const [key, value] of maps[8]!) this.outbox.set(key, value as OutboxEventV1);
    for (const entry of snapshot.apiKeySecretHashes) {
      if (typeof entry.apiKeyId !== "string" || !/^[0-9a-f]{64}$/u.test(entry.hash)) throw new Error("invalid API key hash snapshot");
      this.apiKeySecretHashes.set(entry.apiKeyId, entry.hash);
    }
    for (const entry of snapshot.apiKeyGraceHashes) {
      if (typeof entry.apiKeyId !== "string" || !/^[0-9a-f]{64}$/u.test(entry.hash) || !Number.isSafeInteger(entry.expiresAt) || entry.expiresAt < 0) throw new Error("invalid API key grace snapshot");
      this.apiKeyGraceHashes.set(entry.apiKeyId, { hash: entry.hash, expiresAt: entry.expiresAt });
    }
    for (const entry of snapshot.tokenWindows) {
      if (typeof entry.environmentId !== "string" || !Number.isSafeInteger(entry.startMs) || entry.startMs < 0 || !Number.isSafeInteger(entry.requests) || entry.requests < 0 || !Number.isSafeInteger(entry.concurrent) || entry.concurrent < 0) throw new Error("invalid token window snapshot");
      this.tokenWindows.set(entry.environmentId, { startMs: entry.startMs, requests: entry.requests, concurrent: entry.concurrent });
    }
    for (const entry of snapshot.idempotency ?? []) {
      if (typeof entry.cacheKey !== "string" || entry.cacheKey.length === 0 || entry.cacheKey.length > 512 || /[\u0000-\u001f\u007f]/u.test(entry.cacheKey)) throw new Error("invalid idempotency snapshot");
      if (entry.fingerprint !== undefined && (entry.fingerprint.length > 2048 || /[\u0000-\u001f\u007f]/u.test(entry.fingerprint))) throw new Error("invalid idempotency fingerprint snapshot");
      if (entry.tombstone === true) this.idempotencyTombstones.add(entry.cacheKey);
      else {
        if (!Object.hasOwn(entry, "value") || entry.value === undefined) throw new Error("idempotency snapshot value is missing");
        this.idempotency.set(entry.cacheKey, entry.value);
      }
      if (entry.fingerprint !== undefined) this.idempotencyFingerprints.set(entry.cacheKey, entry.fingerprint);
    }
  }

  seed({ scope, endpoint }: PlatformStoreSeed): EnvironmentV1 {
    const existing = this.environments.get(scope.environmentId);
    if (existing !== undefined) return existing;
    const now = iso(this.clock);
    const tenant: TenantV1 = {
      tenantId: scope.tenantId,
      displayName: scope.tenantId,
      status: "active",
      dataResidencyPolicy: "cn-mainland",
      planId: "plan-preview",
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    const project: ProjectV1 = {
      projectId: scope.projectId,
      tenantId: scope.tenantId,
      name: scope.projectId,
      slug: scope.projectId,
      status: "active",
      defaultRegionPolicyId: "region-cn-mainland",
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    const environment: EnvironmentV1 = {
      environmentId: scope.environmentId,
      projectId: scope.projectId,
      tenantId: scope.tenantId,
      name: scope.environmentId,
      type: "dev",
      status: "active",
      endpoint,
      regionPolicyId: "region-cn-mainland",
      quotaPolicyId: `quota-${scope.environmentId}`,
      retentionPolicyId: "retention-default",
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    this.tenants.set(tenant.tenantId, tenant);
    this.members.set(`member-${tenant.tenantId}`, {
      tenantId: tenant.tenantId,
      memberId: `member-${tenant.tenantId}`,
      subject: "bootstrap",
      roles: ["tenant_owner"],
      status: "active",
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    this.projects.set(project.projectId, project);
    this.environments.set(environment.environmentId, environment);
    this.quotas.set(environment.quotaPolicyId, {
      quotaPolicyId: environment.quotaPolicyId,
      ...DEFAULT_QUOTA,
      updatedAt: now,
    });
    return environment;
  }

  createTenant(input: CreateTenantRequestV1, idempotencyKey?: string): TenantV1 {
    const fingerprint = JSON.stringify(input);
    const cached = this.cached<TenantV1>("tenant", idempotencyKey, fingerprint);
    if (cached !== undefined) return cached;
    const now = iso(this.clock);
    const tenant: TenantV1 = {
      tenantId: id("ten"),
      displayName: input.displayName,
      status: "trial",
      dataResidencyPolicy: input.dataResidencyPolicy ?? "cn-mainland",
      planId: input.planId ?? "plan-trial",
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    this.tenants.set(tenant.tenantId, tenant);
    this.saveIdempotency("tenant", idempotencyKey, tenant, fingerprint);
    return tenant;
  }

  onboardTenant(
    subject: string,
    input: OnboardTenantRequestV1,
    endpoint: string,
    idempotencyKey: string,
  ): OnboardTenantResultV1 {
    const scopedIdempotencyKey = scopedKey(idempotencyKey, subject);
    const fingerprint = JSON.stringify({ subject, input, endpoint });
    const cached = this.cached<OnboardTenantResultV1>("onboarding", scopedIdempotencyKey, fingerprint);
    if (cached !== undefined) return cached;
    if ([...this.members.values()].some((member) => member.subject === subject && member.status !== "removed")) {
      throw new PlatformStoreError("RESOURCE_CONFLICT", "identity is already registered");
    }
    const tenant = this.createTenant({ displayName: input.tenantDisplayName }, `${scopedIdempotencyKey}:tenant`);
    const member = this.createMember(tenant.tenantId, { subject, roles: ["tenant_owner"] }, `${scopedIdempotencyKey}:owner`);
    const project = this.createProject({ tenantId: tenant.tenantId, name: input.projectName, slug: input.projectSlug }, `${scopedIdempotencyKey}:project`);
    const environment = this.createEnvironment({
      tenantId: tenant.tenantId,
      projectId: project.projectId,
      name: input.environmentName,
      type: "dev",
      endpoint,
    }, `${scopedIdempotencyKey}:environment`);
    const result = { tenant, member, project, environment };
    this.saveIdempotency("onboarding", scopedIdempotencyKey, result, fingerprint);
    return result;
  }

  createProject(input: CreateProjectRequestV1, idempotencyKey?: string): ProjectV1 {
    const tenant = this.tenants.get(input.tenantId);
    if (tenant === undefined) throw new PlatformStoreError("RESOURCE_NOT_FOUND", "tenant not found");
    if (tenant.status !== "active" && tenant.status !== "trial") {
      throw new PlatformStoreError("AUTHORIZATION_FAILED", "tenant is not active");
    }
    const scopedIdempotencyKey = scopedKey(idempotencyKey, input.tenantId);
    const fingerprint = JSON.stringify(input);
    const cached = this.cached<ProjectV1>("project", scopedIdempotencyKey, fingerprint);
    if (cached !== undefined) return cached;
    if ([...this.projects.values()].some((project) => project.tenantId === input.tenantId && project.slug === input.slug)) {
      throw new PlatformStoreError("RESOURCE_CONFLICT", "project slug already exists");
    }
    const now = iso(this.clock);
    const project: ProjectV1 = {
      projectId: id("prj"),
      tenantId: input.tenantId,
      name: input.name,
      slug: input.slug,
      status: "active",
      defaultRegionPolicyId: input.defaultRegionPolicyId ?? "region-cn-mainland",
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    this.projects.set(project.projectId, project);
    this.saveIdempotency("project", scopedIdempotencyKey, project, fingerprint);
    return project;
  }

  createEnvironment(input: CreateEnvironmentRequestV1, idempotencyKey?: string): EnvironmentV1 {
    const project = this.projects.get(input.projectId);
    if (project === undefined || project.tenantId !== input.tenantId) {
      throw new PlatformStoreError("RESOURCE_NOT_FOUND", "project not found");
    }
    const scopedIdempotencyKey = scopedKey(idempotencyKey, input.tenantId, input.projectId);
    const fingerprint = JSON.stringify(input);
    const cached = this.cached<EnvironmentV1>("environment", scopedIdempotencyKey, fingerprint);
    if (cached !== undefined) return cached;
    const now = iso(this.clock);
    const environment: EnvironmentV1 = {
      environmentId: id("env"),
      projectId: input.projectId,
      tenantId: input.tenantId,
      name: input.name,
      type: input.type,
      status: "active",
      endpoint: input.endpoint,
      regionPolicyId: input.regionPolicyId ?? project.defaultRegionPolicyId,
      quotaPolicyId: input.quotaPolicyId ?? id("quota"),
      retentionPolicyId: input.retentionPolicyId ?? "retention-default",
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    this.environments.set(environment.environmentId, environment);
    this.quotas.set(environment.quotaPolicyId, {
      quotaPolicyId: environment.quotaPolicyId,
      ...DEFAULT_QUOTA,
      updatedAt: now,
    });
    this.saveIdempotency("environment", scopedIdempotencyKey, environment, fingerprint);
    return environment;
  }

  getTenant(tenantId: string): TenantV1 {
    const tenant = this.tenants.get(tenantId);
    if (tenant === undefined) throw new PlatformStoreError("RESOURCE_NOT_FOUND", "tenant not found");
    return tenant;
  }

  getProject(projectId: string): ProjectV1 {
    const project = this.projects.get(projectId);
    if (project === undefined) throw new PlatformStoreError("RESOURCE_NOT_FOUND", "project not found");
    return project;
  }

  listApiKeys(scope: PlatformScopeV1): ApiKeyMetadataV1[] {
    this.getEnvironment(scope);
    return [...this.apiKeys.values()].filter((key) => key.tenantId === scope.tenantId && key.projectId === scope.projectId && key.environmentId === scope.environmentId);
  }

  createApiKey(
    scope: PlatformScopeV1,
    scopes: readonly string[],
    expiresAt?: string,
    idempotencyKey?: string,
  ): IssuedApiKeyV1 {
    this.getEnvironment(scope);
    const scopedIdempotencyKey = scopedKey(idempotencyKey, scope.tenantId, scope.projectId, scope.environmentId);
    const fingerprint = JSON.stringify({ scopes: [...scopes], expiresAt: expiresAt ?? null });
    const cached = this.cached<IssuedApiKeyV1>("api-key", scopedIdempotencyKey, fingerprint);
    if (cached !== undefined) return cached;
    const now = iso(this.clock);
    const apiKeyId = id("key");
    const secret = `yjk_${randomBytes(32).toString("base64url")}`;
    const metadata: ApiKeyMetadataV1 = {
      apiKeyId,
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      environmentId: scope.environmentId,
      keyPrefix: secret.slice(0, 12),
      scopes: [...new Set(scopes)],
      status: "active",
      ...(expiresAt === undefined ? {} : { expiresAt }),
      createdAt: now,
      version: 1,
    };
    this.apiKeys.set(apiKeyId, metadata);
    this.apiKeySecretHashes.set(apiKeyId, createHash("sha256").update(secret).digest("hex"));
    const issued = { metadata, secret };
    this.saveIdempotency("api-key", scopedIdempotencyKey, issued, fingerprint);
    return issued;
  }

  rotateApiKey(apiKeyId: string, idempotencyKey?: string): IssuedApiKeyV1 {
    const scopedIdempotencyKey = scopedKey(idempotencyKey, apiKeyId);
    const cached = this.cached<IssuedApiKeyV1>("api-key-rotate", scopedIdempotencyKey);
    if (cached !== undefined) return cached;
    const current = this.apiKeys.get(apiKeyId);
    if (current === undefined) throw new PlatformStoreError("RESOURCE_NOT_FOUND", "API key not found");
    if (current.status !== "active") throw new PlatformStoreError("RESOURCE_CONFLICT", "API key is not active");
    const secret = `yjk_${randomBytes(32).toString("base64url")}`;
    const now = iso(this.clock);
    const metadata: ApiKeyMetadataV1 = {
      ...current,
      keyPrefix: secret.slice(0, 12),
      version: current.version + 1,
      createdAt: now,
    };
    const previousHash = this.apiKeySecretHashes.get(apiKeyId);
    if (previousHash !== undefined && this.apiKeyGraceMs > 0) this.apiKeyGraceHashes.set(apiKeyId, { hash: previousHash, expiresAt: this.clock.now().getTime() + this.apiKeyGraceMs });
    this.apiKeys.set(apiKeyId, metadata);
    this.apiKeySecretHashes.set(apiKeyId, createHash("sha256").update(secret).digest("hex"));
    const issued = { metadata, secret };
    this.saveIdempotency("api-key-rotate", scopedIdempotencyKey, issued);
    return issued;
  }

  revokeApiKey(apiKeyId: string, idempotencyKey?: string): ApiKeyMetadataV1 {
    const scopedIdempotencyKey = scopedKey(idempotencyKey, apiKeyId);
    const cached = this.cached<ApiKeyMetadataV1>("api-key-revoke", scopedIdempotencyKey);
    if (cached !== undefined) return cached;
    const current = this.apiKeys.get(apiKeyId);
    if (current === undefined) throw new PlatformStoreError("RESOURCE_NOT_FOUND", "API key not found");
    const metadata: ApiKeyMetadataV1 = {
      ...current,
      status: "revoked",
      revokedAt: iso(this.clock),
      version: current.version + 1,
    };
    this.apiKeys.set(apiKeyId, metadata);
    this.apiKeySecretHashes.delete(apiKeyId);
    this.apiKeyGraceHashes.delete(apiKeyId);
    this.saveIdempotency("api-key-revoke", scopedIdempotencyKey, metadata);
    return metadata;
  }

  getApiKey(apiKeyId: string): ApiKeyMetadataV1 {
    const metadata = this.apiKeys.get(apiKeyId);
    if (metadata === undefined) throw new PlatformStoreError("RESOURCE_NOT_FOUND", "API key not found");
    return metadata;
  }

  resolveApiKeyCredential(secret: string): { scope: PlatformScopeV1; scopes: readonly string[] } | undefined {
    const supplied = createHash("sha256").update(secret).digest();
    const now = this.clock.now().getTime();
    for (const [apiKeyId, hash] of this.apiKeySecretHashes.entries()) {
      const stored = Buffer.from(hash, "hex");
      const grace = this.apiKeyGraceHashes.get(apiKeyId);
      const graceStored = grace === undefined || grace.expiresAt <= now ? undefined : Buffer.from(grace.hash, "hex");
      if ((stored.length !== supplied.length || !timingSafeEqual(stored, supplied)) && (graceStored === undefined || graceStored.length !== supplied.length || !timingSafeEqual(graceStored, supplied))) continue;
      const metadata = this.apiKeys.get(apiKeyId);
      if (metadata === undefined || metadata.status !== "active") return undefined;
      if (metadata.expiresAt !== undefined && Date.parse(metadata.expiresAt) <= this.clock.now().getTime()) return undefined;
      this.apiKeys.set(apiKeyId, { ...metadata, lastUsedAt: iso(this.clock) });
      return {
        scope: {
          tenantId: metadata.tenantId,
          projectId: metadata.projectId,
          environmentId: metadata.environmentId,
        },
        scopes: metadata.scopes,
      };
    }
    return undefined;
  }

  resolveApiKeyScope(secret: string): PlatformScopeV1 | undefined {
    return this.resolveApiKeyCredential(secret)?.scope;
  }

  createMember(
    tenantId: string,
    input: CreateTenantMemberRequestV1,
    idempotencyKey?: string,
  ): TenantMemberV1 {
    return this.createMemberWithStatus(tenantId, input, "active", idempotencyKey);
  }

  inviteMember(
    tenantId: string,
    input: CreateTenantMemberRequestV1,
    idempotencyKey?: string,
  ): TenantMemberV1 {
    return this.createMemberWithStatus(tenantId, input, "invited", idempotencyKey);
  }

  private createMemberWithStatus(
    tenantId: string,
    input: CreateTenantMemberRequestV1,
    status: "active" | "invited",
    idempotencyKey?: string,
  ): TenantMemberV1 {
    if (!this.tenants.has(tenantId)) throw new PlatformStoreError("RESOURCE_NOT_FOUND", "tenant not found");
    const scopedIdempotencyKey = scopedKey(idempotencyKey, tenantId);
    const fingerprint = JSON.stringify({ input, status });
    const cached = this.cached<TenantMemberV1>("member", scopedIdempotencyKey, fingerprint);
    if (cached !== undefined) return cached;
    if ([...this.members.values()].some((member) => member.tenantId === tenantId && member.subject === input.subject && member.status !== "removed")) {
      throw new PlatformStoreError("RESOURCE_CONFLICT", "tenant member already exists");
    }
    const now = iso(this.clock);
    const member: TenantMemberV1 = {
      tenantId,
      memberId: id("mem"),
      subject: input.subject,
      roles: [...new Set(input.roles)],
      status,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    this.members.set(member.memberId, member);
    this.saveIdempotency("member", scopedIdempotencyKey, member, fingerprint);
    return member;
  }

  getMember(memberId: string): TenantMemberV1 {
    const member = this.members.get(memberId);
    if (member === undefined) throw new PlatformStoreError("RESOURCE_NOT_FOUND", "tenant member not found");
    return member;
  }

  updateMember(memberId: string, input: UpdateTenantMemberRequestV1): TenantMemberV1 {
    const current = this.members.get(memberId);
    if (current === undefined) throw new PlatformStoreError("RESOURCE_NOT_FOUND", "tenant member not found");
    const updated: TenantMemberV1 = {
      ...current,
      ...(input.roles === undefined ? {} : { roles: [...new Set(input.roles)] }),
      ...(input.status === undefined ? {} : { status: input.status }),
      updatedAt: iso(this.clock),
      version: current.version + 1,
    };
    this.members.set(memberId, updated);
    return updated;
  }

  listMembers(tenantId: string): TenantMemberV1[] {
    if (!this.tenants.has(tenantId)) throw new PlatformStoreError("RESOURCE_NOT_FOUND", "tenant not found");
    return [...this.members.values()].filter((member) => member.tenantId === tenantId);
  }

  getEnvironment(scope: PlatformScopeV1): EnvironmentV1 {
    const environment = this.environments.get(scope.environmentId);
    if (
      environment === undefined ||
      environment.projectId !== scope.projectId ||
      environment.tenantId !== scope.tenantId
    ) {
      throw new PlatformStoreError("RESOURCE_NOT_FOUND", "environment not found");
    }
    return environment;
  }

  getEnvironmentById(environmentId: string): EnvironmentV1 {
    const environment = this.environments.get(environmentId);
    if (environment === undefined) throw new PlatformStoreError("RESOURCE_NOT_FOUND", "environment not found");
    return environment;
  }

  updateEnvironment(environmentId: string, input: { version: number; name?: string; endpoint?: string; status?: EnvironmentV1["status"]; regionPolicyId?: string; quotaPolicyId?: string; retentionPolicyId?: string }): EnvironmentV1 {
    const current = this.getEnvironmentById(environmentId);
    if (current.version !== input.version) throw new PlatformStoreError("RESOURCE_CONFLICT", "environment version does not match");
    if (current.status === "retired") throw new PlatformStoreError("AUTHORIZATION_FAILED", "retired environment cannot be updated");
    const updated: EnvironmentV1 = {
      ...current,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.endpoint === undefined ? {} : { endpoint: input.endpoint }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.regionPolicyId === undefined ? {} : { regionPolicyId: input.regionPolicyId }),
      ...(input.quotaPolicyId === undefined ? {} : { quotaPolicyId: input.quotaPolicyId }),
      ...(input.retentionPolicyId === undefined ? {} : { retentionPolicyId: input.retentionPolicyId }),
      updatedAt: iso(this.clock),
      version: current.version + 1,
    };
    this.environments.set(environmentId, updated);
    return updated;
  }

  reserveToken(scope: PlatformScopeV1): () => void {
    const environment = this.getEnvironment(scope);
    if (environment.status !== "active") {
      throw new PlatformStoreError("AUTHORIZATION_FAILED", "environment is not active");
    }
    const policy = this.quotas.get(environment.quotaPolicyId);
    if (policy === undefined) throw new PlatformStoreError("RESOURCE_NOT_FOUND", "quota policy not found");
    const now = this.clock.now().getTime();
    const current = this.tokenWindows.get(environment.environmentId);
    const window = current === undefined || now - current.startMs >= 60_000
      ? { startMs: now, requests: 0, concurrent: 0 }
      : current;
    if (window.requests >= policy.maxTokenRequestsPerMinute || window.concurrent >= policy.maxConcurrentTokenRequests) {
      throw new PlatformStoreError("QUOTA_EXCEEDED", "token request quota exceeded");
    }
    window.requests += 1;
    window.concurrent += 1;
    this.tokenWindows.set(environment.environmentId, window);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      window.concurrent = Math.max(0, window.concurrent - 1);
    };
  }

  quotaSnapshot(scope: PlatformScopeV1): QuotaSnapshotV1 {
    const environment = this.getEnvironment(scope);
    const policy = this.quotas.get(environment.quotaPolicyId);
    if (policy === undefined) throw new PlatformStoreError("RESOURCE_NOT_FOUND", "quota policy not found");
    const window = this.tokenWindows.get(environment.environmentId);
    return {
      environmentId: environment.environmentId,
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
      tokenRequestsInWindow: window?.requests ?? 0,
      concurrentTokenRequests: window?.concurrent ?? 0,
      agentWorkers: 0,
      modelTokensInWindow: 0,
      observedAt: iso(this.clock),
    };
  }

  recordUsage(record: Omit<UsageRecordV1, "usageRecordId">): UsageRecordV1 {
    for (const existing of this.usage.values()) {
      if (existing.dedupeKey === record.dedupeKey) return existing;
    }
    const usage: UsageRecordV1 = { usageRecordId: id("use"), ...record };
    this.usage.set(usage.usageRecordId, usage);
    return usage;
  }

  listUsage(scope: PlatformScopeV1): UsageRecordV1[] {
    return [...this.usage.values()].filter(
      (record) =>
        record.tenantId === scope.tenantId &&
        record.projectId === scope.projectId &&
        record.environmentId === scope.environmentId,
    );
  }

  appendAudit(input: Omit<AuditEventV1, "auditEventId">): AuditEventV1 {
    const event: AuditEventV1 = { auditEventId: id("audit"), ...input };
    this.audits.set(event.auditEventId, event);
    const outbox: OutboxEventV1<AuditEventV1> = {
      eventId: id("evt"),
      aggregateType: "audit",
      aggregateId: event.auditEventId,
      eventType: "yujian.audit.recorded.v1",
      schemaVersion: "1.0",
      producer: "platform-api",
      ...(event.tenantId === undefined ? {} : { tenantId: event.tenantId }),
      ...(event.projectId === undefined ? {} : { projectId: event.projectId }),
      ...(event.environmentId === undefined ? {} : { environmentId: event.environmentId }),
      resource: { type: "audit", id: event.auditEventId },
      payload: event,
      occurredAt: event.occurredAt,
      dedupeKey: `audit:${event.auditEventId}`,
      attemptCount: 0,
    };
    this.outbox.set(outbox.eventId, outbox);
    return event;
  }

  listAudit(scope: PlatformScopeV1): AuditEventV1[] {
    return [...this.audits.values()].filter(
      (event) =>
        event.tenantId === scope.tenantId &&
        event.projectId === scope.projectId &&
        event.environmentId === scope.environmentId,
    );
  }

  private cached<T>(kind: string, key: string | undefined, fingerprint?: string): T | undefined {
    if (key === undefined) return undefined;
    const cacheKey = `${kind}:${key}`;
    if (this.idempotencyTombstones.has(cacheKey)) throw new PlatformStoreError("RESOURCE_CONFLICT", "idempotency key cannot be replayed after secret-bearing state recovery");
    const cached = this.idempotency.get(cacheKey) as T | undefined;
    if (cached !== undefined && fingerprint !== undefined && this.idempotencyFingerprints.get(cacheKey) !== fingerprint) {
      throw new PlatformStoreError("RESOURCE_CONFLICT", "idempotency key was reused with a different request");
    }
    return cached;
  }

  private saveIdempotency(kind: string, key: string | undefined, value: unknown, fingerprint?: string) {
    if (key !== undefined) {
      const cacheKey = `${kind}:${key}`;
      this.idempotencyTombstones.delete(cacheKey);
      this.idempotency.set(cacheKey, value);
      if (fingerprint !== undefined) this.idempotencyFingerprints.set(cacheKey, fingerprint);
    }
  }
}
