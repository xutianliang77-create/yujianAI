import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  YujianRoomTokenIssuer,
  YujianRoomServiceAdapter,
  YujianRegionRouter,
  YujianRtcCapacityController,
  YujianRtcNodePool,
  type RtcCapacityRequestV1,
  type YujianRtcProbeResult,
  type YujianRtcReadiness,
} from "@yujian/livekit-compat";
import type {
  DataSubjectRequestV1,
  InvoiceV1,
  BillingAdjustmentV1,
  IssuedRoomTokenV1,
  IssuedTurnCredentialV1,
  NormalizedTurnCredentialRequestV1,
  NormalizedIssueRoomTokenRequestV1,
  QuotaSnapshotV1,
  QuotaPolicyV1,
} from "@yujian/platform-contracts";
import {
  ContractValidationError,
  PLATFORM_API_VERSION,
  parseCreateApiKeyRequest,
  parseCreateEnvironmentRequest,
  parseCreateTenantMemberRequest,
  parseOnboardTenantRequest,
  parseCreateProjectRequest,
  parseCreateSupportTicketRequest,
  parseCreateTenantRequest,
  parseIssueSupportAccessGrantRequest,
  parseIssueRoomTokenRequest,
  parseRegisterSupportBundleRequest,
  parseUpsertEnvironmentEntitlementRequest,
  parseTurnCredentialRequest,
  parseUpdateTenantMemberRequest,
  parseUpdateSupportTicketRequest,
  parseUpdateEnvironmentRequest,
  type PlatformScopeV1,
  type PlatformErrorV1,
} from "@yujian/platform-contracts";
import {
  bearerCredentialMatches,
  credentialHasPermission,
  credentialHasScope,
  resolveBearerCredential,
} from "./auth.js";
import type { PlatformCredential } from "./auth.js";
import type { PlatformApiConfig } from "./config.js";
import { readJsonBody, RequestBodyError, sendJson } from "./http.js";
import { PlatformStore, PlatformStoreError } from "./platform-store.js";
import type { PlatformPersistenceAdapter } from "./persistence.js";
import type { PlatformStorePersistence } from "./store-persistence.js";
import type { WebhookDestinationPersistence } from "./webhook-destinations.js";
import { RtcTelemetryBuffer } from "./rtc-telemetry.js";
import type { RtcTelemetryPersistence } from "./telemetry-persistence.js";
import { PlatformRateLimiter, type RateLimiter } from "./rate-limit.js";
import { PlatformMetrics } from "./metrics.js";
import { recordRtcQualityMetrics } from "./rtc-quality-metrics.js";
import { DisabledMediaOps, HttpMediaOpsClient, MediaOpsRequestError, MediaOpsUnavailableError, type PlatformMediaOps } from "./media-client.js";
import type { PlatformRtcCapacityProvider, RtcCapacityAdmissionLease } from "./redis-rtc-capacity.js";
import { EntitlementError, type PlatformEntitlementService } from "./postgres-entitlements.js";
import { SupportServiceError, type PlatformSupportService } from "./postgres-support.js";
import { RemoteAssistanceError, type IssuedRemoteAssistanceSession, type RemoteAssistanceSession, type RemoteCommandClass } from "./postgres-remote-assistance.js";

const TOKEN_PATH = "/platform/v1/rtc/token";
const CAPACITY_REPORT_PATH = "/internal/v1/rtc/capacity";
const TURN_CREDENTIAL_PATH = "/platform/v1/rtc/turn-credentials";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const ROOM_SEGMENT_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const OUTBOX_EVENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/u;

export interface PlatformLogEvent {
  level: "info" | "error";
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  errorName?: string;
  tenantId?: string;
  projectId?: string;
  environmentId?: string;
}

/** Platform-facing interfaces keep the API independent from a specific SDK or storage driver. */
export interface PlatformRoomService {
  listRooms(nodeId?: string): Promise<unknown>;
  listParticipants(room: string, nodeId?: string): Promise<unknown>;
  getParticipant(room: string, identity: string, nodeId?: string): Promise<unknown>;
  removeParticipant(room: string, identity: string, nodeId?: string): Promise<void>;
  updateParticipant(
    room: string,
    identity: string,
    options: { metadata?: string; name?: string; attributes?: Record<string, string> },
    nodeId?: string,
  ): Promise<unknown>;
}

export interface PlatformTokenIssuer {
  issue(request: NormalizedIssueRoomTokenRequestV1): Promise<IssuedRoomTokenV1>;
}

export interface PlatformTurnCredentialIssuer {
  issue(request: NormalizedTurnCredentialRequestV1): IssuedTurnCredentialV1 | Promise<IssuedTurnCredentialV1>;
}

export interface PlatformRegionRouter {
  select(): { node: { id: string }; reason: string };
}

export type PlatformResourceUsageSnapshot = Partial<Omit<QuotaSnapshotV1, "environmentId" | "policy" | "observedAt">>;

/** Runtime counters come from LiveKit/agent/media adapters, never from client claims. */
export interface PlatformResourceUsageProvider {
  snapshot(scope: PlatformScopeV1): PlatformResourceUsageSnapshot | Promise<PlatformResourceUsageSnapshot>;
}

export interface PlatformTokenQuotaProvider {
  reserve(scope: PlatformScopeV1, policy: QuotaPolicyV1): Promise<() => void | Promise<void>>;
}

/** Billing and data-rights services stay injectable so the API does not own financial or PII storage. */
export interface PlatformBillingService {
  listInvoices(tenantId: string): readonly InvoiceV1[] | Promise<readonly InvoiceV1[]>;
  getInvoice(invoiceId: string): InvoiceV1 | Promise<InvoiceV1>;
  listAdjustments(invoiceId: string): readonly BillingAdjustmentV1[] | Promise<readonly BillingAdjustmentV1[]>;
}

export interface PlatformDataRightsService {
  submit(input: Omit<DataSubjectRequestV1, "requestId" | "status" | "createdAt">, idempotencyKey?: string): DataSubjectRequestV1 | Promise<DataSubjectRequestV1>;
  get(requestId: string): DataSubjectRequestV1 | Promise<DataSubjectRequestV1>;
  list(tenantId: string): readonly DataSubjectRequestV1[] | Promise<readonly DataSubjectRequestV1[]>;
  start(requestId: string): DataSubjectRequestV1 | Promise<DataSubjectRequestV1>;
  complete(requestId: string, evidenceUri: string): DataSubjectRequestV1 | Promise<DataSubjectRequestV1>;
  reject(requestId: string, evidenceUri?: string): DataSubjectRequestV1 | Promise<DataSubjectRequestV1>;
}

/** Deployment-owned OIDC/SAML bridge; it maps a verified subject to a scoped platform credential. */
export type PlatformIdentityCredential = Omit<PlatformCredential, "credential">;

export interface PlatformIdentitySubject {
  subject: string;
  tenantId?: string;
  roles: readonly string[];
}

export interface PlatformIdentityProvider {
  authenticate(accessToken: string, request: IncomingMessage): Promise<PlatformIdentityCredential | undefined>;
  /** Verifies an identity before it has a platform scope, for registration and invitation acceptance. */
  authenticateSubject?(accessToken: string, request: IncomingMessage): Promise<PlatformIdentitySubject | undefined>;
}

export interface PlatformOutboxReplayService {
  requeueDeadLetter(eventId: string): Promise<void>;
}

export interface PlatformBackgroundWorker {
  start(): void;
  stop(): Promise<void>;
}

export interface PlatformTelemetryPersistence extends RtcTelemetryPersistence {}

export interface PlatformRemoteAssistanceService {
  begin(accessToken: string, ticketId: string, permission: "remote.inspect" | "remote.execute"): Promise<IssuedRemoteAssistanceSession>;
  record(sessionId: string, sessionToken: string, commandClass: RemoteCommandClass, commandDigest: string, outcome: "allowed" | "denied" | "succeeded" | "failed"): Promise<RemoteAssistanceSession>;
  end(sessionId: string, sessionToken: string): Promise<RemoteAssistanceSession>;
}

export interface PlatformServerDependencies {
  /** Closes deployment-owned clients such as PostgreSQL pools and Redis connections. */
  close?: () => Promise<void>;
  readinessCheck?: () => Promise<YujianRtcProbeResult | YujianRtcReadiness>;
  logger?: (event: PlatformLogEvent) => void;
  store?: PlatformStore;
  telemetry?: RtcTelemetryBuffer;
  rateLimiter?: RateLimiter;
  metrics?: PlatformMetrics;
  roomService?: PlatformRoomService;
  regionRouter?: PlatformRegionRouter;
  resourceUsage?: PlatformResourceUsageProvider;
  tokenQuota?: PlatformTokenQuotaProvider;
  tokenIssuers?: ReadonlyMap<string, PlatformTokenIssuer>;
  mediaOps?: PlatformMediaOps;
  persistence?: PlatformPersistenceAdapter;
  /** Durable tenant/project/environment/API-key projection; required by production runtime. */
  storePersistence?: PlatformStorePersistence;
  capacityController?: YujianRtcCapacityController;
  rtcCapacity?: PlatformRtcCapacityProvider;
  turnCredentials?: PlatformTurnCredentialIssuer;
  entitlements?: PlatformEntitlementService;
  support?: PlatformSupportService;
  remoteAssistance?: PlatformRemoteAssistanceService;
  billing?: PlatformBillingService;
  dataRights?: PlatformDataRightsService;
  identity?: PlatformIdentityProvider;
  outboxReplay?: PlatformOutboxReplayService;
  outboxWorker?: PlatformBackgroundWorker;
  webhookDestinations?: WebhookDestinationPersistence;
  telemetryPersistence?: PlatformTelemetryPersistence;
}

function requestIdFor(request: IncomingMessage): string {
  const supplied = request.headers["x-request-id"];
  return typeof supplied === "string" && REQUEST_ID_PATTERN.test(supplied)
    ? supplied
    : randomUUID();
}

function metricsRoute(pathname: string): string {
  if (pathname === "/healthz" || pathname === "/readyz" || pathname === "/metrics") return pathname;
  if (pathname.startsWith("/platform/v1/")) return "/platform/v1";
  return "/other";
}

function sendPlatformError(
  response: ServerResponse,
  requestId: string,
  statusCode: number,
  error: PlatformErrorV1,
  headers: Record<string, string> = {},
) {
  sendJson(
    response,
    statusCode,
    {
      apiVersion: PLATFORM_API_VERSION,
      requestId,
      error,
    },
    headers,
  );
}

function contentTypeIsJson(request: IncomingMessage): boolean {
  const contentType = request.headers["content-type"];
  return (
    typeof contentType === "string" &&
    contentType.toLowerCase().startsWith("application/json")
  );
}

function idempotencyKeyFrom(request: IncomingMessage): string | undefined {
  const value = request.headers["idempotency-key"];
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value.length <= 128 ? value : undefined;
}

function requiredIdempotencyKeyFrom(request: IncomingMessage): string {
  const value = idempotencyKeyFrom(request);
  if (value === undefined) {
    throw new ContractValidationError([{ field: "Idempotency-Key", reason: "required for resource creation" }]);
  }
  return value;
}

function scopeFromCredential(credential: { tenantId: string; projectId: string; environmentId: string }): PlatformScopeV1 {
  return {
    tenantId: credential.tenantId,
    projectId: credential.projectId,
    environmentId: credential.environmentId,
  };
}

function validRoomSegment(value: string | undefined): value is string {
  return value !== undefined && ROOM_SEGMENT_PATTERN.test(value);
}

async function resolveRequestCredential(
  request: IncomingMessage,
  config: PlatformApiConfig,
  store: PlatformStore,
  identity: PlatformIdentityProvider | undefined,
): Promise<PlatformCredential | undefined> {
  const configured = resolveBearerCredential(request.headers, config.platformCredentials);
  if (configured !== undefined) return configured;
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return undefined;
  const secret = authorization.slice("Bearer ".length);
  const issued = store.resolveApiKeyCredential(secret);
  if (issued !== undefined) return { ...issued.scope, credential: secret, scopes: issued.scopes };
  if (identity === undefined) return undefined;
  try {
    const authenticated = await identity.authenticate(secret, request);
    if (authenticated === undefined) return undefined;
    if (
      authenticated.tenantId.length === 0 ||
      authenticated.projectId.length === 0 ||
      authenticated.environmentId.length === 0
    ) return undefined;
    return { ...authenticated, credential: secret };
  } catch {
    return undefined;
  }
}

function credentialAllows(credential: PlatformCredential, permission: string): boolean {
  return credentialHasPermission(credential, permission);
}

function supportAccessToken(request: IncomingMessage): string | undefined {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return undefined;
  const token = authorization.slice("Bearer ".length);
  return /^yj_sup_[A-Za-z0-9_-]{43}$/u.test(token) ? token : undefined;
}

function remoteSessionToken(request: IncomingMessage): string | undefined {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return undefined;
  const token = authorization.slice("Bearer ".length);
  return /^yj_remote_[A-Za-z0-9_-]{43}$/u.test(token) ? token : undefined;
}

function publicNodeStatuses(
  statuses: YujianRtcReadiness["nodes"],
) {
  return statuses.map(({ id, healthy, latencyMs, activeRoomCount }) => ({
    id,
    healthy,
    ...(latencyMs === undefined ? {} : { latencyMs }),
    ...(activeRoomCount === undefined ? {} : { activeRoomCount }),
  }));
}

async function persistAudit(
  store: PlatformStore,
  persistence: PlatformPersistenceAdapter | undefined,
  input: Parameters<PlatformStore["appendAudit"]>[0],
): Promise<void> {
  const audit = store.appendAudit(input);
  if (persistence === undefined) return;
  const outbox = [...store.outbox.values()].find((event) => event.aggregateId === audit.auditEventId);
  if (outbox === undefined) throw new Error("audit outbox projection is missing");
  const transaction = await persistence.begin();
  try {
    await transaction.insertAuditAndOutbox(audit, outbox);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function persistUsageAndAudit(
  store: PlatformStore,
  persistence: PlatformPersistenceAdapter | undefined,
  usage: Parameters<PlatformStore["recordUsage"]>[0],
  audit: Parameters<PlatformStore["appendAudit"]>[0],
): Promise<void> {
  const usageRecord = store.recordUsage(usage);
  const auditEvent = store.appendAudit(audit);
  if (persistence === undefined) return;
  const outbox = [...store.outbox.values()].find((event) => event.aggregateId === auditEvent.auditEventId);
  if (outbox === undefined) throw new Error("audit outbox projection is missing");
  const transaction = await persistence.begin();
  try {
    await transaction.recordUsage(usageRecord);
    await transaction.insertAuditAndOutbox(auditEvent, outbox);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export function createPlatformServer(
  config: PlatformApiConfig,
  dependencies: PlatformServerDependencies = {},
) {
  const rtcNodes = config.rtcNodes ??
    (config.livekit === undefined
      ? []
      : [{ id: "primary", ...config.livekit }]);
  const nodePool = new YujianRtcNodePool(rtcNodes);
  const roomService: PlatformRoomService = dependencies.roomService ?? new YujianRoomServiceAdapter(nodePool.nodes);
  const regionRouter: PlatformRegionRouter = dependencies.regionRouter ?? new YujianRegionRouter(nodePool.nodes);
  const capacityController = dependencies.capacityController;
  const rtcCapacity = dependencies.rtcCapacity;
  const turnCredentials = dependencies.turnCredentials;
  const entitlements = dependencies.entitlements;
  const support = dependencies.support;
  const remoteAssistance = dependencies.remoteAssistance;
  const tokenIssuers: ReadonlyMap<string, PlatformTokenIssuer> = dependencies.tokenIssuers ?? new Map(
    nodePool.nodes.map(
      (node): [string, PlatformTokenIssuer] => [node.id, new YujianRoomTokenIssuer(node)],
    ),
  );
  const store = dependencies.store ?? new PlatformStore(undefined, config.apiKeyGraceMs === undefined ? {} : { apiKeyGraceMs: config.apiKeyGraceMs });
  const telemetry = dependencies.telemetry ?? new RtcTelemetryBuffer();
  const rateLimiter = dependencies.rateLimiter ?? new PlatformRateLimiter();
  const metrics = dependencies.metrics ?? new PlatformMetrics();
  const persistence = dependencies.persistence;
  const storePersistence = dependencies.storePersistence;
  const resourceUsage = dependencies.resourceUsage;
  const tokenQuota = dependencies.tokenQuota;
  const billing = dependencies.billing;
  const dataRights = dependencies.dataRights;
  const identityProvider = dependencies.identity;
  const outboxReplay = dependencies.outboxReplay;
  const webhookDestinations = dependencies.webhookDestinations;
  const telemetryPersistence = dependencies.telemetryPersistence;
  const mediaOps = dependencies.mediaOps ?? (config.mediaOps === undefined
    ? new DisabledMediaOps()
    : new HttpMediaOpsClient(config.mediaOps));
  for (const credential of config.platformCredentials) {
    store.seed({ scope: credential, endpoint: nodePool.nodes[0]?.wsUrl ?? "" });
  }
  const adminCredential = config.adminCredential;
  const readinessCheck =
    dependencies.readinessCheck ?? (() => nodePool.check());
  const logger = dependencies.logger ?? ((event) => console.log(JSON.stringify(event)));
  const restored = storePersistence === undefined
    ? Promise.resolve()
    : storePersistence.load().then((snapshot) => { if (snapshot !== undefined) store.restore(snapshot); });
  let persistTail: Promise<void> = Promise.resolve();
  const persistStore = async (): Promise<void> => {
    if (storePersistence === undefined) return;
    const snapshot = store.snapshot();
    const write = persistTail.catch(() => undefined).then(() => storePersistence.save(snapshot));
    persistTail = write;
    await write;
  };

  const quotaSnapshotFor = async (scope: PlatformScopeV1): Promise<QuotaSnapshotV1> => {
    const baseline = store.quotaSnapshot(scope);
    if (resourceUsage === undefined) return baseline;
    const usage = await resourceUsage.snapshot(scope);
    const fields = [
      "activeRooms", "activeParticipants", "activePublishers", "activeSubscriptions", "activeTracks",
      "activeIngressJobs", "activeEgressJobs", "activeSipCalls", "turnBytesInWindow", "tokenRequestsInWindow",
      "concurrentTokenRequests", "agentWorkers", "modelTokensInWindow",
    ] as const;
    for (const field of fields) {
      const value = usage[field];
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
        throw new Error(`resource usage ${field} must be a non-negative integer`);
      }
    }
    return { ...baseline, ...usage, observedAt: new Date().toISOString() };
  };

  const server = createServer(async (request, response) => {
    const requestId = requestIdFor(request);
    const requestStartedAt = performance.now();
    const method = request.method ?? "UNKNOWN";
    const url = new URL(request.url ?? "/", "http://platform.local");
    let statusCode = 500;
    const requestOrigin = request.headers.origin;
    if (config.corsOrigin !== undefined && requestOrigin === config.corsOrigin) {
      response.setHeader("access-control-allow-origin", config.corsOrigin);
      response.setHeader("access-control-allow-headers", "authorization, content-type, idempotency-key, x-request-id");
      response.setHeader("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      response.setHeader("access-control-max-age", "600");
      response.setHeader("vary", "Origin");
    }
    if (method === "OPTIONS") {
      if (config.corsOrigin === undefined || requestOrigin !== config.corsOrigin) {
        statusCode = 403;
        sendPlatformError(response, requestId, statusCode, { code: "AUTHORIZATION_FAILED", message: "Origin is not allowed", retryable: false });
        return;
      }
      statusCode = 204;
      response.writeHead(statusCode);
      response.end();
      return;
    }
    let errorName: string | undefined;
    let requestScope: PlatformScopeV1 | undefined;
    let releaseTokenQuota: (() => void | Promise<void>) | undefined;
    let failedCapacityLease: RtcCapacityAdmissionLease | undefined;

    try {
      await restored;
      if (method === "GET" && url.pathname === "/metrics") {
        const payload = Buffer.from(metrics.render(), "utf8");
        statusCode = 200;
        response.writeHead(statusCode, {
          "cache-control": "no-store",
          "content-length": String(payload.length),
          "content-type": "text/plain; version=0.0.4; charset=utf-8",
        });
        response.end(payload);
        return;
      }
      if (url.pathname.startsWith("/platform/") && method !== "OPTIONS") {
        const decision = await rateLimiter.check(`${request.socket.remoteAddress ?? "unknown"}:${url.pathname}`);
        if (!decision.allowed) {
          statusCode = 429;
          sendPlatformError(response, requestId, statusCode, {
            code: "RATE_LIMITED",
            message: "Request rate limit exceeded",
            retryable: true,
            details: [{ field: "retryAfter", reason: decision.resetAt }],
          }, {
            "retry-after": String(Math.max(1, Math.ceil((Date.parse(decision.resetAt) - Date.now()) / 1000))),
            "x-ratelimit-limit": String(decision.limit),
            "x-ratelimit-remaining": String(decision.remaining),
          });
          return;
        }
      }
      if (method === "GET" && url.pathname === "/healthz") {
        statusCode = 200;
        sendJson(response, statusCode, {
          status: "ok",
          service: "@yujian/platform-api",
          version: "0.1.0",
        });
        return;
      }

      if (url.pathname === CAPACITY_REPORT_PATH) {
        if (method !== "POST") {
          statusCode = 405;
          sendPlatformError(response, requestId, statusCode, { code: "METHOD_NOT_ALLOWED", message: "This resource only accepts POST", retryable: false }, { allow: "POST" });
          return;
        }
        if (!bearerCredentialMatches(request.headers, config.rtcCapacityCredential)) {
          statusCode = config.rtcCapacityCredential === undefined ? 503 : 401;
          sendPlatformError(response, requestId, statusCode, { code: statusCode === 503 ? "UPSTREAM_UNAVAILABLE" : "AUTHENTICATION_FAILED", message: "RTC capacity reporting is unavailable", retryable: statusCode === 503 });
          return;
        }
        if (rtcCapacity === undefined) {
          statusCode = 503;
          sendPlatformError(response, requestId, statusCode, { code: "UPSTREAM_UNAVAILABLE", message: "Distributed RTC capacity storage is unavailable", retryable: true });
          return;
        }
        if (!contentTypeIsJson(request)) throw new ContractValidationError([{ field: "Content-Type", reason: "must be application/json" }]);
        const report = await rtcCapacity.publish(await readJsonBody(request));
        statusCode = 202;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: { nodeId: report.nodeId, sequence: report.sequence, expiresAt: report.expiresAt } });
        return;
      }

      if (method === "GET" && url.pathname === "/readyz") {
        try {
          const result = await readinessCheck();
          const nodeReadiness = "ready" in result
            ? result
            : {
                ready: true,
                nodes: [{
                  id: "primary",
                  url: config.livekit?.wsUrl ?? nodePool.nodes[0]?.wsUrl ?? "unknown",
                  healthy: true,
                  latencyMs: result.latencyMs,
                  activeRoomCount: result.activeRoomCount,
                }],
              };
          if (!nodeReadiness.ready) {
            statusCode = 503;
            sendJson(response, statusCode, {
              status: "not_ready",
              upstream: "livekit",
              service: "yujian-rtc",
              nodes: publicNodeStatuses(nodeReadiness.nodes),
            });
            return;
          }
          capacityController?.observe(nodeReadiness.nodes);
          statusCode = 200;
          sendJson(response, statusCode, {
            status: "ready",
            upstream: "livekit",
            service: "yujian-rtc",
            nodes: publicNodeStatuses(nodeReadiness.nodes),
          });
        } catch (error) {
          errorName = error instanceof Error ? error.name : "UnknownError";
          statusCode = 503;
          sendJson(response, statusCode, {
            status: "not_ready",
            upstream: "livekit",
          });
        }
        return;
      }

      const path = url.pathname.split("/").filter(Boolean);
      const isOnboarding = method === "POST" && url.pathname === "/platform/v1/onboarding";
      const invitationAccept = method === "POST"
        ? url.pathname.match(/^\/platform\/v1\/invitations\/([^/:]+):accept$/u)
        : null;
      if (isOnboarding || invitationAccept !== null) {
        if (identityProvider?.authenticateSubject === undefined) {
          statusCode = 503;
          sendPlatformError(response, requestId, statusCode, { code: "UPSTREAM_UNAVAILABLE", message: "OIDC identity onboarding is not configured", retryable: true });
          return;
        }
        const authorization = request.headers.authorization;
        if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
          statusCode = 401;
          sendPlatformError(response, requestId, statusCode, { code: "AUTHENTICATION_FAILED", message: "A verified OIDC identity is required", retryable: false });
          return;
        }
        let identity: PlatformIdentitySubject | undefined;
        try { identity = await identityProvider.authenticateSubject(authorization.slice("Bearer ".length), request); }
        catch { identity = undefined; }
        if (identity === undefined) {
          statusCode = 401;
          sendPlatformError(response, requestId, statusCode, { code: "AUTHENTICATION_FAILED", message: "OIDC identity verification failed", retryable: false });
          return;
        }
        if (invitationAccept !== null) {
          const member = store.getMember(invitationAccept[1] ?? "");
          if (member.subject !== identity.subject || member.status !== "invited") {
            statusCode = 403;
            sendPlatformError(response, requestId, statusCode, { code: "AUTHORIZATION_FAILED", message: "The invitation cannot be accepted by this identity", retryable: false });
            return;
          }
          const accepted = store.updateMember(member.memberId, { status: "active" });
          await persistAudit(store, persistence, { tenantId: accepted.tenantId, actorType: "human", actorId: identity.subject, action: "tenant.invitation.accept", resourceType: "tenant-member", resourceId: accepted.memberId, requestId, result: "success", riskLevel: "medium", occurredAt: new Date().toISOString() });
          await persistStore();
          statusCode = 200;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: accepted });
          return;
        }
        if (!contentTypeIsJson(request)) {
          statusCode = 400;
          sendPlatformError(response, requestId, statusCode, { code: "VALIDATION_FAILED", message: "Content-Type must be application/json", retryable: false });
          return;
        }
        const endpoint = nodePool.nodes[0]?.wsUrl;
        if (endpoint === undefined) throw new Error("RTC endpoint is unavailable for onboarding");
        const onboarded = store.onboardTenant(identity.subject, parseOnboardTenantRequest(await readJsonBody(request)), endpoint, requiredIdempotencyKeyFrom(request));
        await persistAudit(store, persistence, { tenantId: onboarded.tenant.tenantId, projectId: onboarded.project.projectId, environmentId: onboarded.environment.environmentId, actorType: "human", actorId: identity.subject, action: "tenant.onboard", resourceType: "tenant", resourceId: onboarded.tenant.tenantId, requestId, result: "success", riskLevel: "medium", occurredAt: new Date().toISOString() });
        await persistStore();
        statusCode = 201;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: onboarded });
        return;
      }
      const isTenantGet = method === "GET" && path.length === 4 && path[0] === "platform" && path[1] === "v1" && path[2] === "tenants";
      const isProjectGet = method === "GET" && path.length === 4 && path[0] === "platform" && path[1] === "v1" && path[2] === "projects";
      const isEnvironmentGet = method === "GET" && path.length === 4 && path[0] === "platform" && path[1] === "v1" && path[2] === "environments";
      if (isTenantGet || isProjectGet || isEnvironmentGet) {
        const requestedId = path[3] ?? "";
        const credential = await resolveRequestCredential(request, config, store, identityProvider);
        const isAdmin = bearerCredentialMatches(request.headers, adminCredential);
        if (credential === undefined && !isAdmin) {
          statusCode = adminCredential === undefined ? 401 : 403;
          sendPlatformError(response, requestId, statusCode, { code: adminCredential === undefined ? "AUTHENTICATION_FAILED" : "AUTHORIZATION_FAILED", message: "A valid platform credential is required", retryable: false });
          return;
        }
        const resource = isTenantGet ? store.getTenant(requestedId) : isProjectGet ? store.getProject(requestedId) : isAdmin ? store.getEnvironmentById(requestedId) : store.getEnvironment({ tenantId: credential?.tenantId ?? "", projectId: credential?.projectId ?? "", environmentId: requestedId });
        if (!isAdmin && credential !== undefined && ((isTenantGet && resource.tenantId !== credential.tenantId) || (isProjectGet && resource.tenantId !== credential.tenantId) || (isEnvironmentGet && resource.tenantId !== credential.tenantId))) {
          statusCode = 403;
          sendPlatformError(response, requestId, statusCode, { code: "AUTHORIZATION_FAILED", message: "The credential cannot access this resource", retryable: false });
          return;
        }
        statusCode = 200;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: resource });
        return;
      }
      const isEnvironmentUpdate = method === "PATCH" && path.length === 4 && path[0] === "platform" && path[1] === "v1" && path[2] === "environments";
      if (isEnvironmentUpdate) {
        const current = store.getEnvironmentById(path[3] ?? "");
        const credential = await resolveRequestCredential(request, config, store, identityProvider);
        const admin = bearerCredentialMatches(request.headers, adminCredential);
        if (!admin && (credential === undefined || !credentialHasScope(credential, current))) {
          statusCode = credential === undefined ? 401 : 403;
          sendPlatformError(response, requestId, statusCode, { code: statusCode === 401 ? "AUTHENTICATION_FAILED" : "AUTHORIZATION_FAILED", message: "The credential cannot update this environment", retryable: false });
          return;
        }
        if (!contentTypeIsJson(request)) {
          statusCode = 400;
          sendPlatformError(response, requestId, statusCode, { code: "VALIDATION_FAILED", message: "Content-Type must be application/json", retryable: false });
          return;
        }
        const updated = store.updateEnvironment(current.environmentId, parseUpdateEnvironmentRequest(await readJsonBody(request)));
        await persistAudit(store, persistence, { tenantId: updated.tenantId, projectId: updated.projectId, environmentId: updated.environmentId, actorType: admin ? "service" : "service", actorId: admin ? "platform-admin" : "platform-credential", action: "environment.update", resourceType: "environment", resourceId: updated.environmentId, requestId, result: "success", riskLevel: "medium", occurredAt: new Date().toISOString() });
        await persistStore();
        statusCode = 200;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: updated });
        return;
      }
      const isEntitlementGet = method === "GET" && path.length === 5 && path[0] === "platform" && path[1] === "v1" && path[2] === "environments" && path[4] === "entitlement";
      const isEntitlementPut = method === "PUT" && path.length === 6 && path[0] === "platform" && path[1] === "v1" && path[2] === "admin" && path[3] === "environments" && path[5] === "entitlement";
      if (isEntitlementGet || isEntitlementPut) {
        if (entitlements === undefined) {
          statusCode = 503;
          sendPlatformError(response, requestId, statusCode, { code: "UPSTREAM_UNAVAILABLE", message: "Entitlement service is unavailable", retryable: true });
          return;
        }
        const environmentId = isEntitlementGet ? path[3] ?? "" : path[4] ?? "";
        if (isEntitlementPut) {
          if (!bearerCredentialMatches(request.headers, adminCredential)) {
            statusCode = adminCredential === undefined ? 401 : 403;
            sendPlatformError(response, requestId, statusCode, { code: statusCode === 401 ? "AUTHENTICATION_FAILED" : "AUTHORIZATION_FAILED", message: "A control-plane admin credential is required", retryable: false });
            return;
          }
          const environment = store.getEnvironmentById(environmentId);
          const scope = { tenantId: environment.tenantId, projectId: environment.projectId, environmentId };
          if (!contentTypeIsJson(request)) throw new ContractValidationError([{ field: "Content-Type", reason: "must be application/json" }]);
          const entitlement = await entitlements.upsert(scope, parseUpsertEnvironmentEntitlementRequest(await readJsonBody(request)));
          await persistAudit(store, persistence, { ...scope, actorType: "service", actorId: "platform-admin", action: "entitlement.upsert", resourceType: "environment-entitlement", resourceId: entitlement.entitlementId, requestId, result: "success", riskLevel: "high", occurredAt: new Date().toISOString(), details: { planId: entitlement.planId, version: entitlement.version } });
          await persistStore();
          statusCode = 200;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: entitlement });
          return;
        }
        const credential = await resolveRequestCredential(request, config, store, identityProvider);
        if (credential === undefined || credential.environmentId !== environmentId || !credentialAllows(credential, "usage.read")) {
          statusCode = credential === undefined ? 401 : 403;
          sendPlatformError(response, requestId, statusCode, { code: statusCode === 401 ? "AUTHENTICATION_FAILED" : "AUTHORIZATION_FAILED", message: "The credential cannot read this entitlement", retryable: false });
          return;
        }
        const scope = { tenantId: credential.tenantId, projectId: credential.projectId, environmentId: credential.environmentId };
        store.getEnvironment(scope);
        const entitlement = await entitlements.get(scope);
        statusCode = 200;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: entitlement });
        return;
      }
      const isSupportCollection = path.length === 6 && path[0] === "platform" && path[1] === "v1" && path[2] === "environments" && path[4] === "support" && path[5] === "tickets";
      const isSupportItem = path.length === 7 && path[0] === "platform" && path[1] === "v1" && path[2] === "environments" && path[4] === "support" && path[5] === "tickets";
      if (isSupportCollection || isSupportItem) {
        if (support === undefined) {
          statusCode = 503;
          sendPlatformError(response, requestId, statusCode, { code: "UPSTREAM_UNAVAILABLE", message: "Support service is unavailable", retryable: true });
          return;
        }
        const credential = await resolveRequestCredential(request, config, store, identityProvider);
        const environmentId = path[3] ?? "";
        const permission = method === "GET" ? "support.ticket.read" : "support.ticket.write";
        if (credential === undefined || credential.environmentId !== environmentId || !credentialAllows(credential, permission)) {
          statusCode = credential === undefined ? 401 : 403;
          sendPlatformError(response, requestId, statusCode, { code: statusCode === 401 ? "AUTHENTICATION_FAILED" : "AUTHORIZATION_FAILED", message: "The credential cannot access support tickets", retryable: false });
          return;
        }
        requestScope = scopeFromCredential(credential);
        store.getEnvironment(requestScope);
        if (isSupportItem) {
          if (method !== "GET" || !validRoomSegment(path[6])) {
            statusCode = 405;
            sendPlatformError(response, requestId, statusCode, { code: "METHOD_NOT_ALLOWED", message: "This support ticket resource only accepts GET", retryable: false }, { allow: "GET" });
            return;
          }
          const ticket = await support.get(requestScope, path[6]);
          statusCode = 200;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: ticket });
          return;
        }
        if (method === "GET") {
          const tickets = await support.list(requestScope);
          statusCode = 200;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: { tickets } });
          return;
        }
        if (method !== "POST") {
          statusCode = 405;
          sendPlatformError(response, requestId, statusCode, { code: "METHOD_NOT_ALLOWED", message: "Support ticket collection accepts GET and POST", retryable: false }, { allow: "GET, POST" });
          return;
        }
        if (!contentTypeIsJson(request)) throw new ContractValidationError([{ field: "Content-Type", reason: "must be application/json" }]);
        const ticket = await support.create(requestScope, parseCreateSupportTicketRequest(await readJsonBody(request)), requiredIdempotencyKeyFrom(request));
        await persistAudit(store, persistence, { ...requestScope, actorType: "service", actorId: "platform-credential", action: "support.ticket.create", resourceType: "support-ticket", resourceId: ticket.ticketId, requestId, result: "success", riskLevel: "low", occurredAt: new Date().toISOString(), details: { severity: ticket.severity, category: ticket.category } });
        await persistStore();
        statusCode = 201;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: ticket });
        return;
      }
      const isSupportAccessTicket = method === "GET" && path.length === 5 && path[0] === "platform" && path[1] === "v1" && path[2] === "support" && path[3] === "tickets";
      const isSupportAccessBundle = method === "GET" && path.length === 7 && path[0] === "platform" && path[1] === "v1" && path[2] === "support" && path[3] === "tickets" && path[5] === "bundles";
      if (isSupportAccessTicket || isSupportAccessBundle) {
        if (support === undefined) {
          statusCode = 503;
          sendPlatformError(response, requestId, statusCode, { code: "UPSTREAM_UNAVAILABLE", message: "Support service is unavailable", retryable: true });
          return;
        }
        const token = supportAccessToken(request);
        const ticketId = path[4];
        const bundleId = path[6] ?? "";
        if (token === undefined || !validRoomSegment(ticketId) || (isSupportAccessBundle && !validRoomSegment(bundleId))) {
          statusCode = 401;
          sendPlatformError(response, requestId, statusCode, { code: "AUTHENTICATION_FAILED", message: "A valid one-time support access token is required", retryable: false });
          return;
        }
        const permission = isSupportAccessBundle ? "bundle.download" : "ticket.read";
        const grant = await support.consumeAccess(token, permission, ticketId);
        const ticket = await support.getById(ticketId);
        requestScope = { tenantId: ticket.tenantId, projectId: ticket.projectId, environmentId: ticket.environmentId };
        const resource = isSupportAccessBundle ? await support.getBundle(ticketId, bundleId) : ticket;
        await persistAudit(store, persistence, { ...requestScope, actorType: "human", actorId: grant.operatorSubject, action: isSupportAccessBundle ? "support.bundle.access" : "support.ticket.access", resourceType: isSupportAccessBundle ? "support-bundle" : "support-ticket", resourceId: isSupportAccessBundle ? bundleId : ticketId, requestId, result: "success", riskLevel: "high", occurredAt: new Date().toISOString(), details: { grantId: grant.grantId } });
        await persistStore();
        statusCode = 200;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: resource });
        return;
      }
      const isRemoteBegin = method === "POST" && path.length === 6 && path[0] === "platform" && path[1] === "v1" && path[2] === "support" && path[3] === "tickets" && path[5] === "remote-sessions";
      const isRemoteAction = method === "POST" && path.length === 6 && path[0] === "platform" && path[1] === "v1" && path[2] === "support" && path[3] === "remote-sessions" && (path[5] === "events" || path[5] === "end");
      if (isRemoteBegin || isRemoteAction) {
        if (support === undefined || remoteAssistance === undefined) {
          statusCode = 503;
          sendPlatformError(response, requestId, statusCode, { code: "UPSTREAM_UNAVAILABLE", message: "Remote assistance service is unavailable", retryable: true });
          return;
        }
        if (!contentTypeIsJson(request)) throw new ContractValidationError([{ field: "Content-Type", reason: "must be application/json" }]);
        if (isRemoteBegin) {
          const accessToken = supportAccessToken(request);
          const ticketId = path[4] ?? "";
          const input = await readJsonBody(request) as Record<string, unknown>;
          if (accessToken === undefined || !validRoomSegment(ticketId) || Object.keys(input).some((key) => key !== "permission") || (input.permission !== "remote.inspect" && input.permission !== "remote.execute")) throw new RemoteAssistanceError("DENIED", "a valid remote support grant and permission are required");
          const session = await remoteAssistance.begin(accessToken, ticketId, input.permission);
          const ticket = await support.getById(ticketId);
          requestScope = { tenantId: ticket.tenantId, projectId: ticket.projectId, environmentId: ticket.environmentId };
          await persistAudit(store, persistence, { ...requestScope, actorType: "human", actorId: session.operatorSubject, action: "support.remote.begin", resourceType: "remote-assistance-session", resourceId: session.sessionId, requestId, result: "success", riskLevel: "high", occurredAt: new Date().toISOString(), details: { grantId: session.grantId, permission: session.permission } });
          await persistStore();
          statusCode = 201;
          response.setHeader("cache-control", "no-store");
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: session });
          return;
        }
        const sessionId = path[4] ?? "";
        const sessionToken = remoteSessionToken(request);
        if (!validRoomSegment(sessionId) || sessionToken === undefined) throw new RemoteAssistanceError("DENIED", "a valid remote session token is required");
        let session: RemoteAssistanceSession;
        let action: string;
        if (path[5] === "end") {
          const input = await readJsonBody(request) as Record<string, unknown>;
          if (Object.keys(input).length !== 0) throw new ContractValidationError([{ field: "$", reason: "remote session end body must be empty" }]);
          session = await remoteAssistance.end(sessionId, sessionToken);
          action = "support.remote.end";
          statusCode = 200;
        } else {
          const input = await readJsonBody(request) as Record<string, unknown>;
          const allowed = new Set(["commandClass", "commandDigest", "outcome"]);
          if (Object.keys(input).some((key) => !allowed.has(key)) || typeof input.commandClass !== "string" || typeof input.commandDigest !== "string" || typeof input.outcome !== "string") throw new ContractValidationError([{ field: "$", reason: "remote event requires commandClass, commandDigest and outcome" }]);
          session = await remoteAssistance.record(sessionId, sessionToken, input.commandClass as RemoteCommandClass, input.commandDigest, input.outcome as "allowed" | "denied" | "succeeded" | "failed");
          action = "support.remote.command.audit";
          statusCode = 202;
        }
        const ticket = await support.getById(session.ticketId);
        requestScope = { tenantId: ticket.tenantId, projectId: ticket.projectId, environmentId: ticket.environmentId };
        await persistAudit(store, persistence, { ...requestScope, actorType: "human", actorId: session.operatorSubject, action, resourceType: "remote-assistance-session", resourceId: session.sessionId, requestId, result: "success", riskLevel: "high", occurredAt: new Date().toISOString(), details: { grantId: session.grantId } });
        await persistStore();
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: session });
        return;
      }
      const supportRevokeSegment = path[5];
      const isSupportAccessRevoke = method === "POST" && path.length === 6 && path[0] === "platform" && path[1] === "v1" && path[2] === "admin" && path[3] === "support" && path[4] === "access-grants" && supportRevokeSegment?.endsWith(":revoke") === true;
      if (isSupportAccessRevoke) {
        if (support === undefined) {
          statusCode = 503;
          sendPlatformError(response, requestId, statusCode, { code: "UPSTREAM_UNAVAILABLE", message: "Support service is unavailable", retryable: true });
          return;
        }
        if (!bearerCredentialMatches(request.headers, adminCredential)) {
          statusCode = adminCredential === undefined ? 401 : 403;
          sendPlatformError(response, requestId, statusCode, { code: statusCode === 401 ? "AUTHENTICATION_FAILED" : "AUTHORIZATION_FAILED", message: "A control-plane admin credential is required", retryable: false });
          return;
        }
        const grantId = supportRevokeSegment?.slice(0, -":revoke".length) ?? "";
        if (!validRoomSegment(grantId)) throw new ContractValidationError([{ field: "grantId", reason: "must be a valid resource id" }]);
        const grant = await support.revokeAccess(grantId);
        const ticket = await support.getById(grant.ticketId);
        requestScope = { tenantId: ticket.tenantId, projectId: ticket.projectId, environmentId: ticket.environmentId };
        await persistAudit(store, persistence, { ...requestScope, actorType: "service", actorId: "platform-admin", action: "support.access.revoke", resourceType: "support-access-grant", resourceId: grant.grantId, requestId, result: "success", riskLevel: "high", occurredAt: new Date().toISOString() });
        await persistStore();
        statusCode = 200;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: grant });
        return;
      }
      const isSupportAdminTicket = path.length === 6 && path[0] === "platform" && path[1] === "v1" && path[2] === "admin" && path[3] === "support" && path[4] === "tickets";
      const isSupportAdminAction = path.length === 7 && path[0] === "platform" && path[1] === "v1" && path[2] === "admin" && path[3] === "support" && path[4] === "tickets";
      if (isSupportAdminTicket || isSupportAdminAction) {
        if (support === undefined) {
          statusCode = 503;
          sendPlatformError(response, requestId, statusCode, { code: "UPSTREAM_UNAVAILABLE", message: "Support service is unavailable", retryable: true });
          return;
        }
        if (!bearerCredentialMatches(request.headers, adminCredential)) {
          statusCode = adminCredential === undefined ? 401 : 403;
          sendPlatformError(response, requestId, statusCode, { code: statusCode === 401 ? "AUTHENTICATION_FAILED" : "AUTHORIZATION_FAILED", message: "A control-plane admin credential is required", retryable: false });
          return;
        }
        if (method !== "PATCH" && method !== "POST") {
          statusCode = 405;
          sendPlatformError(response, requestId, statusCode, { code: "METHOD_NOT_ALLOWED", message: "Unsupported support administration method", retryable: false }, { allow: "POST, PATCH" });
          return;
        }
        const ticketId = path[5];
        if (!validRoomSegment(ticketId) || !contentTypeIsJson(request)) throw new ContractValidationError([{ field: "ticketId/Content-Type", reason: "valid ticket id and application/json are required" }]);
        const ticket = await support.getById(ticketId);
        requestScope = { tenantId: ticket.tenantId, projectId: ticket.projectId, environmentId: ticket.environmentId };
        if (isSupportAdminTicket) {
          if (method !== "PATCH") throw new ContractValidationError([{ field: "method", reason: "ticket update requires PATCH" }]);
          const updated = await support.update(ticket.ticketId, parseUpdateSupportTicketRequest(await readJsonBody(request)));
          await persistAudit(store, persistence, { ...requestScope, actorType: "service", actorId: "platform-admin", action: "support.ticket.update", resourceType: "support-ticket", resourceId: updated.ticketId, requestId, result: "success", riskLevel: "medium", occurredAt: new Date().toISOString(), details: { status: updated.status, version: String(updated.version) } });
          await persistStore();
          statusCode = 200;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: updated });
          return;
        }
        if (method !== "POST") throw new ContractValidationError([{ field: "method", reason: "support action requires POST" }]);
        if (path[6] === "access-grants") {
          const grant = await support.issueAccess(ticket.ticketId, parseIssueSupportAccessGrantRequest(await readJsonBody(request)));
          await persistAudit(store, persistence, { ...requestScope, actorType: "service", actorId: "platform-admin", action: "support.access.issue", resourceType: "support-access-grant", resourceId: grant.grantId, requestId, result: "success", riskLevel: "high", occurredAt: new Date().toISOString(), details: { operatorSubject: grant.operatorSubject, expiresAt: grant.expiresAt } });
          await persistStore();
          statusCode = 201;
          response.setHeader("cache-control", "no-store");
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: grant });
          return;
        }
        if (path[6] === "bundles") {
          const bundle = await support.registerBundle(ticket.ticketId, parseRegisterSupportBundleRequest(await readJsonBody(request)));
          await persistAudit(store, persistence, { ...requestScope, actorType: "service", actorId: "platform-admin", action: "support.bundle.register", resourceType: "support-bundle", resourceId: bundle.bundleId, requestId, result: "success", riskLevel: "medium", occurredAt: new Date().toISOString(), details: { sha256: bundle.sha256, expiresAt: bundle.expiresAt } });
          await persistStore();
          statusCode = 201;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: bundle });
          return;
        }
        statusCode = 404;
        sendPlatformError(response, requestId, statusCode, { code: "RESOURCE_NOT_FOUND", message: "Unknown support action", retryable: false });
        return;
      }
      const isTenantCreate = method === "POST" && url.pathname === "/platform/v1/tenants";
      const isProjectCreate =
        method === "POST" &&
        path.length === 5 &&
        path[0] === "platform" &&
        path[1] === "v1" &&
        path[2] === "tenants" &&
        path[4] === "projects";
      const isEnvironmentCreate =
        method === "POST" &&
        path.length === 5 &&
        path[0] === "platform" &&
        path[1] === "v1" &&
        path[2] === "projects" &&
        path[4] === "environments";
      if (isTenantCreate || isProjectCreate || isEnvironmentCreate) {
        if (!bearerCredentialMatches(request.headers, adminCredential)) {
          statusCode = adminCredential === undefined ? 401 : 403;
          sendPlatformError(response, requestId, statusCode, {
            code: adminCredential === undefined
              ? "AUTHENTICATION_FAILED"
              : "AUTHORIZATION_FAILED",
            message: adminCredential === undefined
              ? "A control-plane admin credential is required"
              : "The credential cannot perform this control-plane operation",
            retryable: false,
          });
          return;
        }
        if (!contentTypeIsJson(request)) {
          statusCode = 400;
          sendPlatformError(response, requestId, statusCode, {
            code: "VALIDATION_FAILED",
            message: "Content-Type must be application/json",
            retryable: false,
          });
          return;
        }
        const idempotencyKey = requiredIdempotencyKeyFrom(request);
        if (isTenantCreate) {
          const tenant = store.createTenant(
            parseCreateTenantRequest(await readJsonBody(request)),
            idempotencyKey,
          );
          statusCode = 201;
          await persistAudit(store, persistence, {
            tenantId: tenant.tenantId,
            actorType: "service",
            actorId: "platform-admin",
            action: "tenant.create",
            resourceType: "tenant",
            resourceId: tenant.tenantId,
            requestId,
            result: "success",
            riskLevel: "medium",
            occurredAt: new Date().toISOString(),
          });
          await persistStore();
          sendJson(response, statusCode, {
            apiVersion: PLATFORM_API_VERSION,
            requestId,
            data: tenant,
          });
          return;
        }
        if (isProjectCreate) {
          const input = parseCreateProjectRequest(await readJsonBody(request));
          if (path[3] !== input.tenantId) {
            throw new PlatformStoreError("AUTHORIZATION_FAILED", "tenant path does not match request");
          }
          const project = store.createProject(input, idempotencyKey);
          statusCode = 201;
          await persistAudit(store, persistence, {
            tenantId: project.tenantId,
            projectId: project.projectId,
            actorType: "service",
            actorId: "platform-admin",
            action: "project.create",
            resourceType: "project",
            resourceId: project.projectId,
            requestId,
            result: "success",
            riskLevel: "medium",
            occurredAt: new Date().toISOString(),
          });
          await persistStore();
          sendJson(response, statusCode, {
            apiVersion: PLATFORM_API_VERSION,
            requestId,
            data: project,
          });
          return;
        }
        const input = parseCreateEnvironmentRequest(await readJsonBody(request));
        if (path[3] !== input.projectId) {
          throw new PlatformStoreError("AUTHORIZATION_FAILED", "project path does not match request");
        }
        const environment = store.createEnvironment(input, idempotencyKey);
        statusCode = 201;
        await persistAudit(store, persistence, {
          tenantId: environment.tenantId,
          projectId: environment.projectId,
          environmentId: environment.environmentId,
          actorType: "service",
          actorId: "platform-admin",
          action: "environment.create",
          resourceType: "environment",
          resourceId: environment.environmentId,
          requestId,
          result: "success",
          riskLevel: "medium",
          occurredAt: new Date().toISOString(),
        });
        await persistStore();
        sendJson(response, statusCode, {
          apiVersion: PLATFORM_API_VERSION,
          requestId,
          data: environment,
        });
        return;
      }

      const isBillingStatementList = method === "GET" && path.length === 5 &&
        path[0] === "platform" && path[1] === "v1" && path[2] === "tenants" &&
        path[4] === "billing-statements";
      const isInvoiceGet = method === "GET" && path.length === 4 &&
        path[0] === "platform" && path[1] === "v1" && path[2] === "invoices";
      const isInvoiceAdjustments = method === "GET" && path.length === 5 &&
        path[0] === "platform" && path[1] === "v1" && path[2] === "invoices" &&
        path[4] === "adjustments";
      if (isBillingStatementList || isInvoiceGet || isInvoiceAdjustments) {
        const credential = await resolveRequestCredential(request, config, store, identityProvider);
        const admin = bearerCredentialMatches(request.headers, adminCredential);
        if (credential === undefined && !admin) {
          statusCode = adminCredential === undefined ? 401 : 403;
          sendPlatformError(response, requestId, statusCode, {
            code: adminCredential === undefined ? "AUTHENTICATION_FAILED" : "AUTHORIZATION_FAILED",
            message: "A valid billing credential is required",
            retryable: false,
          });
          return;
        }
        if (billing === undefined) {
          statusCode = 503;
          sendPlatformError(response, requestId, statusCode, {
            code: "UPSTREAM_UNAVAILABLE",
            message: "Billing service is not configured",
            retryable: true,
          });
          return;
        }
        const invoiceId = path[3] ?? "";
        let tenantId = path[3] ?? "";
        if (!isBillingStatementList) {
          try {
            tenantId = (await billing.getInvoice(invoiceId)).tenantId;
          } catch {
            statusCode = 404;
            sendPlatformError(response, requestId, statusCode, {
              code: "RESOURCE_NOT_FOUND",
              message: "Invoice not found",
              retryable: false,
            });
            return;
          }
        }
        if (!admin && (credential === undefined || credential.tenantId !== tenantId || !credentialAllows(credential, "billing.read"))) {
          statusCode = credential === undefined ? 401 : 403;
          sendPlatformError(response, requestId, statusCode, {
            code: statusCode === 401 ? "AUTHENTICATION_FAILED" : "PERMISSION_DENIED",
            message: "The credential cannot access this billing resource",
            retryable: false,
          });
          return;
        }
        const data = isBillingStatementList
          ? { invoices: await billing.listInvoices(tenantId) }
          : isInvoiceAdjustments
            ? { adjustments: await billing.listAdjustments(invoiceId) }
            : await billing.getInvoice(invoiceId);
        statusCode = 200;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data });
        return;
      }

      const isDataRightsCreate = method === "POST" && path.length === 5 &&
        path[0] === "platform" && path[1] === "v1" && path[2] === "tenants" &&
        path[4] === "data-rights";
      const isDataRightsList = method === "GET" && path.length === 5 &&
        path[0] === "platform" && path[1] === "v1" && path[2] === "tenants" &&
        path[4] === "data-rights";
      const isDataRightsGet = method === "GET" && path.length === 4 &&
        path[0] === "platform" && path[1] === "v1" && path[2] === "data-rights";
      const dataRightsMutation = method === "POST"
        ? path[0] === "platform" && path[1] === "v1" && path[2] === "data-rights" && path.length === 4
          ? path[3]?.match(/^([^:]+):(start|complete|reject)$/u) ?? null
          : null
        : null;
      if (isDataRightsCreate || isDataRightsList || isDataRightsGet || dataRightsMutation !== null) {
        const credential = await resolveRequestCredential(request, config, store, identityProvider);
        const admin = bearerCredentialMatches(request.headers, adminCredential);
        if (credential === undefined && !admin) {
          statusCode = adminCredential === undefined ? 401 : 403;
          sendPlatformError(response, requestId, statusCode, {
            code: adminCredential === undefined ? "AUTHENTICATION_FAILED" : "AUTHORIZATION_FAILED",
            message: "A valid data-rights credential is required",
            retryable: false,
          });
          return;
        }
        if (dataRights === undefined) {
          statusCode = 503;
          sendPlatformError(response, requestId, statusCode, {
            code: "UPSTREAM_UNAVAILABLE",
            message: "Data-rights service is not configured",
            retryable: true,
          });
          return;
        }
        let requestRecord: DataSubjectRequestV1 | undefined;
        if (isDataRightsGet || dataRightsMutation !== null) {
          const requestIdParam = isDataRightsGet ? path[3] ?? "" : dataRightsMutation?.[1] ?? "";
          try {
            requestRecord = await dataRights.get(requestIdParam);
          } catch {
            statusCode = 404;
            sendPlatformError(response, requestId, statusCode, {
              code: "RESOURCE_NOT_FOUND",
              message: "Data-rights request not found",
              retryable: false,
            });
            return;
          }
        }
        const tenantId = isDataRightsCreate || isDataRightsList ? path[3] ?? "" : requestRecord?.tenantId ?? "";
        const permission = isDataRightsCreate || dataRightsMutation !== null ? "data-rights.write" : "data-rights.read";
        if (!admin && (credential === undefined || credential.tenantId !== tenantId || !credentialAllows(credential, permission))) {
          statusCode = credential === undefined ? 401 : 403;
          sendPlatformError(response, requestId, statusCode, {
            code: statusCode === 401 ? "AUTHENTICATION_FAILED" : "PERMISSION_DENIED",
            message: "The credential cannot access this data-rights resource",
            retryable: false,
          });
          return;
        }
        if (isDataRightsList) {
          statusCode = 200;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: { requests: await dataRights.list(tenantId) } });
          return;
        }
        if (isDataRightsGet) {
          statusCode = 200;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: requestRecord });
          return;
        }
        if (isDataRightsCreate) {
          if (!contentTypeIsJson(request)) throw new ContractValidationError([{ field: "Content-Type", reason: "must be application/json" }]);
          const body = await readJsonBody(request);
          if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
          const input = body as Record<string, unknown>;
          const subjectId = input.subjectId;
          const kind = input.kind;
          if (typeof subjectId !== "string" || typeof kind !== "string" || !["export", "delete", "rectify"].includes(kind)) {
            throw new ContractValidationError([{ field: "subjectId/kind", reason: "subjectId and supported kind are required" }]);
          }
          const created = await dataRights.submit({ tenantId, subjectId, kind: kind as DataSubjectRequestV1["kind"] }, requiredIdempotencyKeyFrom(request));
          await persistAudit(store, persistence, { tenantId, actorType: "service", actorId: admin ? "platform-admin" : "platform-credential", action: "data-rights.submit", resourceType: "data-subject-request", resourceId: created.requestId, requestId, result: "success", riskLevel: "high", occurredAt: new Date().toISOString() });
          statusCode = 202;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: created });
          return;
        }
        const requestIdParam = dataRightsMutation?.[1] ?? "";
        const operation = dataRightsMutation?.[2];
        let updated: DataSubjectRequestV1;
        try {
          if (operation === "start") {
            updated = await dataRights.start(requestIdParam);
          } else {
            if (!contentTypeIsJson(request)) throw new ContractValidationError([{ field: "Content-Type", reason: "must be application/json" }]);
            const body = await readJsonBody(request);
            if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
            const input = body as Record<string, unknown>;
            const evidenceUri = typeof input.evidenceUri === "string" ? input.evidenceUri : undefined;
            if (operation === "complete" && evidenceUri === undefined) throw new ContractValidationError([{ field: "evidenceUri", reason: "is required for completion" }]);
            updated = operation === "complete" ? await dataRights.complete(requestIdParam, evidenceUri ?? "") : await dataRights.reject(requestIdParam, evidenceUri);
          }
        } catch (error) {
          if (error instanceof ContractValidationError) throw error;
          statusCode = 409;
          sendPlatformError(response, requestId, statusCode, { code: "RESOURCE_CONFLICT", message: error instanceof Error ? error.message : "data-rights transition failed", retryable: false });
          return;
        }
        await persistAudit(store, persistence, { tenantId, actorType: "service", actorId: admin ? "platform-admin" : "platform-credential", action: `data-rights.${operation}`, resourceType: "data-subject-request", resourceId: updated.requestId, requestId, result: "success", riskLevel: "high", occurredAt: new Date().toISOString() });
        statusCode = 200;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: updated });
        return;
      }

      const isApiKeyCreate =
        method === "POST" &&
        path.length === 5 &&
        path[0] === "platform" &&
        path[1] === "v1" &&
        path[2] === "environments" &&
        path[4] === "api-keys";
      const isApiKeyMutation =
        method === "POST" &&
        path.length === 4 &&
        path[0] === "platform" &&
        path[1] === "v1" &&
        path[2] === "api-keys" &&
        (path[3]?.endsWith(":rotate") || path[3]?.endsWith(":revoke"));
      const isApiKeyList =
        method === "GET" && path.length === 5 && path[0] === "platform" && path[1] === "v1" &&
        path[2] === "environments" && path[4] === "api-keys";
      const isApiKeyGet =
        method === "GET" && path.length === 4 && path[0] === "platform" && path[1] === "v1" &&
        path[2] === "api-keys";
      const isMemberCreate =
        method === "POST" &&
        path.length === 5 &&
        path[0] === "platform" &&
        path[1] === "v1" &&
        path[2] === "tenants" &&
        path[4] === "members";
      const isMemberInvite =
        method === "POST" && path.length === 5 && path[0] === "platform" && path[1] === "v1" &&
        path[2] === "tenants" && path[4] === "invitations";
      const isMemberList =
        method === "GET" &&
        path.length === 5 &&
        path[0] === "platform" &&
        path[1] === "v1" &&
        path[2] === "tenants" &&
        path[4] === "members";
      const isMemberUpdate =
        method === "PATCH" &&
        path.length === 4 &&
        path[0] === "platform" &&
        path[1] === "v1" &&
        path[2] === "tenant-members";
      if (isApiKeyCreate || isApiKeyMutation || isApiKeyList || isApiKeyGet || isMemberCreate || isMemberInvite || isMemberList || isMemberUpdate) {
        if (isApiKeyList || isApiKeyGet) {
          const credential = await resolveRequestCredential(request, config, store, identityProvider);
          const admin = bearerCredentialMatches(request.headers, adminCredential);
          if (credential === undefined && !admin) {
            statusCode = adminCredential === undefined ? 401 : 403;
            sendPlatformError(response, requestId, statusCode, { code: adminCredential === undefined ? "AUTHENTICATION_FAILED" : "AUTHORIZATION_FAILED", message: "A valid platform credential is required", retryable: false });
            return;
          }
          if (isApiKeyList) {
            if (credential === undefined) {
              statusCode = 403;
              sendPlatformError(response, requestId, statusCode, { code: "AUTHORIZATION_FAILED", message: "A scoped credential is required for environment API keys", retryable: false });
              return;
            }
            if (credential.environmentId !== path[3] || !credentialAllows(credential, "api-key.read")) {
              statusCode = 403;
              sendPlatformError(response, requestId, statusCode, { code: "AUTHORIZATION_FAILED", message: "The credential cannot read this environment's API keys", retryable: false });
              return;
            }
            statusCode = 200;
            sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: { apiKeys: store.listApiKeys(scopeFromCredential(credential)) } });
            return;
          }
          const metadata = store.getApiKey(path[3] ?? "");
          if (!admin && (credential === undefined || !credentialAllows(credential, "api-key.read") || !credentialHasScope(credential, { tenantId: metadata.tenantId, projectId: metadata.projectId, environmentId: metadata.environmentId }))) {
            statusCode = 403;
            sendPlatformError(response, requestId, statusCode, { code: "AUTHORIZATION_FAILED", message: "The credential cannot read this API key", retryable: false });
            return;
          }
          statusCode = 200;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: metadata });
          return;
        }
        if (isMemberCreate || isMemberInvite || isMemberList || isMemberUpdate) {
          const admin = bearerCredentialMatches(request.headers, adminCredential);
          const credential = admin ? undefined : await resolveRequestCredential(request, config, store, identityProvider);
          const permission = isMemberList ? "member.read" : "member.write";
          if (!admin && credential === undefined) {
            statusCode = 401;
            sendPlatformError(response, requestId, statusCode, {
              code: "AUTHENTICATION_FAILED",
              message: "A valid member-management credential is required",
              retryable: false,
            });
            return;
          }
          const currentMember = isMemberUpdate ? store.getMember(path[3] ?? "") : undefined;
          const tenantId = currentMember?.tenantId ?? path[3] ?? "";
          if (!admin && (credential?.tenantId !== tenantId || !credentialAllows(credential, permission))) {
            statusCode = 403;
            sendPlatformError(response, requestId, statusCode, { code: "AUTHORIZATION_FAILED", message: "The credential cannot manage this tenant's members", retryable: false });
            return;
          }
          if (isMemberList) {
            const members = store.listMembers(path[3] ?? "");
            statusCode = 200;
            sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: { members } });
            return;
          }
          if (!contentTypeIsJson(request)) {
            statusCode = 400;
            sendPlatformError(response, requestId, statusCode, {
              code: "VALIDATION_FAILED",
              message: "Content-Type must be application/json",
              retryable: false,
            });
            return;
          }
          if (isMemberCreate || isMemberInvite) {
            const member = (isMemberInvite ? store.inviteMember.bind(store) : store.createMember.bind(store))(
              path[3] ?? "",
              parseCreateTenantMemberRequest(await readJsonBody(request)),
              requiredIdempotencyKeyFrom(request),
            );
            await persistAudit(store, persistence, {
              tenantId: member.tenantId,
              actorType: "service",
              actorId: admin ? "platform-admin" : "platform-credential",
              action: isMemberInvite ? "tenant.invitation.create" : "tenant.member.create",
              resourceType: "tenant-member",
              resourceId: member.memberId,
              requestId,
              result: "success",
              riskLevel: "medium",
              occurredAt: new Date().toISOString(),
            });
            await persistStore();
            statusCode = 201;
            sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: member });
            return;
          }
          const member = store.updateMember(
            path[3] ?? "",
            parseUpdateTenantMemberRequest(await readJsonBody(request)),
          );
          await persistAudit(store, persistence, {
            tenantId: member.tenantId,
            actorType: "service",
            actorId: admin ? "platform-admin" : "platform-credential",
            action: "tenant.member.update",
            resourceType: "tenant-member",
            resourceId: member.memberId,
            requestId,
            result: "success",
            riskLevel: "medium",
            occurredAt: new Date().toISOString(),
          });
          await persistStore();
          statusCode = 200;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: member });
          return;
        }

        let keyScope: PlatformScopeV1;
        if (isApiKeyCreate) {
          const credential = await resolveRequestCredential(request, config, store, identityProvider);
          if (credential === undefined) {
            statusCode = 401;
            sendPlatformError(response, requestId, statusCode, {
              code: "AUTHENTICATION_FAILED",
              message: "A valid platform credential is required",
              retryable: false,
            });
            return;
          }
          if (!credentialAllows(credential, "api-key.create")) {
            statusCode = 403;
            sendPlatformError(response, requestId, statusCode, {
              code: "PERMISSION_DENIED",
              message: "The API key is not allowed to create another API key",
              retryable: false,
            });
            return;
          }
          keyScope = scopeFromCredential(credential);
          if (credential.environmentId !== path[3]) {
            statusCode = 403;
            sendPlatformError(response, requestId, statusCode, {
              code: "AUTHORIZATION_FAILED",
              message: "The platform credential cannot access this environment",
              retryable: false,
            });
            return;
          }
          if (!contentTypeIsJson(request)) {
            statusCode = 400;
            sendPlatformError(response, requestId, statusCode, {
              code: "VALIDATION_FAILED",
              message: "Content-Type must be application/json",
              retryable: false,
            });
            return;
          }
          const input = parseCreateApiKeyRequest(await readJsonBody(request));
          const issued = store.createApiKey(keyScope, input.scopes, input.expiresAt, requiredIdempotencyKeyFrom(request));
          await persistAudit(store, persistence, {
            tenantId: keyScope.tenantId,
            projectId: keyScope.projectId,
            environmentId: keyScope.environmentId,
            actorType: "service",
            actorId: "platform-credential",
            action: "api-key.create",
            resourceType: "api-key",
            resourceId: issued.metadata.apiKeyId,
            requestId,
            result: "success",
            riskLevel: "high",
            occurredAt: new Date().toISOString(),
          });
          await persistStore();
          statusCode = 201;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: issued });
          return;
        }

        const operation = path[3]?.endsWith(":rotate") ? "rotate" : "revoke";
        const apiKeyId = (path[3] ?? "").replace(/:(?:rotate|revoke)$/u, "");
        const metadata = store.getApiKey(apiKeyId);
          const scoped = await resolveRequestCredential(request, config, store, identityProvider);
        const admin = bearerCredentialMatches(request.headers, adminCredential);
        if (!admin && (scoped === undefined || !credentialAllows(scoped, `api-key.${operation}`) || !credentialHasScope(scoped, {
          tenantId: metadata.tenantId,
          projectId: metadata.projectId,
          environmentId: metadata.environmentId,
        }))) {
          statusCode = adminCredential === undefined && scoped === undefined ? 401 : 403;
          sendPlatformError(response, requestId, statusCode, {
            code: statusCode === 401 ? "AUTHENTICATION_FAILED" : "AUTHORIZATION_FAILED",
            message: "The credential cannot modify this API key",
            retryable: false,
          });
          return;
        }
        const data = operation === "rotate"
          ? store.rotateApiKey(apiKeyId, requiredIdempotencyKeyFrom(request))
          : store.revokeApiKey(apiKeyId, requiredIdempotencyKeyFrom(request));
        await persistAudit(store, persistence, {
          tenantId: metadata.tenantId,
          projectId: metadata.projectId,
          environmentId: metadata.environmentId,
          actorType: "service",
          actorId: admin ? "platform-admin" : "platform-credential",
          action: `api-key.${operation}`,
          resourceType: "api-key",
          resourceId: apiKeyId,
          requestId,
          result: "success",
          riskLevel: "high",
          occurredAt: new Date().toISOString(),
        });
        await persistStore();
        statusCode = 200;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data });
        return;
      }

      const isRtcTelemetry =
        (method === "POST" || method === "GET") && path.length === 6 &&
        path[0] === "platform" && path[1] === "v1" && path[2] === "environments" &&
        path[4] === "telemetry" && path[5] === "rtc";
      if (isRtcTelemetry) {
        const credential = await resolveRequestCredential(request, config, store, identityProvider);
        if (credential === undefined) {
          statusCode = 401;
          sendPlatformError(response, requestId, statusCode, {
            code: "AUTHENTICATION_FAILED",
            message: "A valid platform credential is required",
            retryable: false,
          });
          return;
        }
        if (!credentialAllows(credential, method === "GET" ? "telemetry.read" : "telemetry.write")) {
          statusCode = 403;
          sendPlatformError(response, requestId, statusCode, {
            code: "PERMISSION_DENIED",
            message: "The credential is not allowed to access RTC telemetry",
            retryable: false,
          });
          return;
        }
        const environmentId = path[3] ?? "";
        if (credential.environmentId !== environmentId) {
          statusCode = 403;
          sendPlatformError(response, requestId, statusCode, {
            code: "AUTHORIZATION_FAILED",
            message: "The platform credential cannot access this environment",
            retryable: false,
          });
          return;
        }
        const scope = scopeFromCredential(credential);
        if (method === "GET") {
          const summary = telemetryPersistence === undefined
            ? telemetry.summarize(scope)
            : await telemetryPersistence.summarize(scope);
          statusCode = 200;
          sendJson(response, statusCode, {
            apiVersion: PLATFORM_API_VERSION,
            requestId,
            data: summary,
          });
          return;
        }
        if (!contentTypeIsJson(request)) {
          statusCode = 400;
          sendPlatformError(response, requestId, statusCode, {
            code: "VALIDATION_FAILED",
            message: "Content-Type must be application/json",
            retryable: false,
          });
          return;
        }
        const body = await readJsonBody(request);
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
        }
        const input = body as Record<string, unknown>;
        const required = ["nodeId", "roomName", "participantIdentity", "capturedAt"];
        const issues = required.flatMap((field) => typeof input[field] === "string" && input[field] !== ""
          ? []
          : [{ field, reason: "must be a non-empty string" }]);
        for (const field of ["rttMs", "jitterMs", "packetsLost", "packetsSent", "bitrateKbps", "audioLevel"]) {
          if (input[field] !== undefined && (typeof input[field] !== "number" || !Number.isFinite(input[field]))) {
            issues.push({ field, reason: "must be a finite number" });
          }
        }
        if (issues.length > 0) throw new ContractValidationError(issues);
        const sample = telemetry.record(scope, {
          nodeId: input.nodeId as string,
          roomName: input.roomName as string,
          participantIdentity: input.participantIdentity as string,
          capturedAt: input.capturedAt as string,
          ...(typeof input.rttMs === "number" ? { rttMs: input.rttMs } : {}),
          ...(typeof input.jitterMs === "number" ? { jitterMs: input.jitterMs } : {}),
          ...(typeof input.packetsLost === "number" ? { packetsLost: input.packetsLost } : {}),
          ...(typeof input.packetsSent === "number" ? { packetsSent: input.packetsSent } : {}),
          ...(typeof input.bitrateKbps === "number" ? { bitrateKbps: input.bitrateKbps } : {}),
          ...(typeof input.audioLevel === "number" ? { audioLevel: input.audioLevel } : {}),
        });
        await telemetryPersistence?.append(sample);
        recordRtcQualityMetrics(metrics, sample);
        statusCode = 202;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: sample });
        return;
      }

      const mediaPath = path.length >= 6 && path[0] === "platform" && path[1] === "v1" &&
        path[2] === "environments" && path[4] === "media";
      const isIngressList = method === "GET" && mediaPath && path.length === 6 && path[5] === "ingress";
      const isIngressGet = method === "GET" && mediaPath && path.length === 7 && path[5] === "ingress";
      const isEgressList = method === "GET" && mediaPath && path.length === 6 && path[5] === "egress";
      const isEgressGet = method === "GET" && mediaPath && path.length === 7 && path[5] === "egress";
      const isSipList = method === "GET" && mediaPath && path.length === 7 && path[5] === "sip" && path[6] === "calls";
      const isSipGet = method === "GET" && mediaPath && path.length === 8 && path[5] === "sip" && path[6] === "calls";
      if (isIngressList || isIngressGet || isEgressList || isEgressGet || isSipList || isSipGet) {
        const credential = await resolveRequestCredential(request, config, store, identityProvider);
        if (credential === undefined) {
          statusCode = 401;
          sendPlatformError(response, requestId, statusCode, { code: "AUTHENTICATION_FAILED", message: "A valid platform credential is required", retryable: false });
          return;
        }
        const permission = isIngressList || isIngressGet ? "media.ingress.read" : isEgressList || isEgressGet ? "media.egress.read" : "sip.call.read";
        if (!credentialAllows(credential, permission)) {
          statusCode = 403;
          sendPlatformError(response, requestId, statusCode, { code: "PERMISSION_DENIED", message: "The credential is not allowed to read this media capability", retryable: false });
          return;
        }
        const environmentId = path[3] ?? "";
        if (credential.environmentId !== environmentId) {
          statusCode = 403;
          sendPlatformError(response, requestId, statusCode, { code: "AUTHORIZATION_FAILED", message: "The platform credential cannot access this environment", retryable: false });
          return;
        }
        const resourceId = path[path.length - 1] ?? "";
        const data = isIngressList
          ? await mediaOps.listIngress(environmentId)
          : isIngressGet
            ? await mediaOps.getIngress(environmentId, resourceId)
            : isEgressList
              ? await mediaOps.listEgress(environmentId)
              : isEgressGet
                ? await mediaOps.getEgress(environmentId, resourceId)
                : isSipList
                  ? await mediaOps.listSipCalls(environmentId)
                  : await mediaOps.getSipCall(environmentId, resourceId);
        statusCode = 200;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data });
        return;
      }
      const isSipTransfer = method === "POST" && mediaPath && path.length === 8 && path[5] === "sip" && path[6] === "calls" && path[7]?.endsWith(":transfer");
      const isSipHangup = method === "POST" && mediaPath && path.length === 8 && path[5] === "sip" && path[6] === "calls" && path[7]?.endsWith(":hangup");
      if (isSipTransfer || isSipHangup) {
        const credential = await resolveRequestCredential(request, config, store, identityProvider);
        if (credential === undefined) {
          statusCode = 401;
          sendPlatformError(response, requestId, statusCode, { code: "AUTHENTICATION_FAILED", message: "A valid platform credential is required", retryable: false });
          return;
        }
        if (!credentialAllows(credential, "sip.call.write")) {
          statusCode = 403;
          sendPlatformError(response, requestId, statusCode, { code: "PERMISSION_DENIED", message: "The credential is not allowed to modify SIP calls", retryable: false });
          return;
        }
        const environmentId = path[3] ?? "";
        if (credential.environmentId !== environmentId) {
          statusCode = 403;
          sendPlatformError(response, requestId, statusCode, { code: "AUTHORIZATION_FAILED", message: "The platform credential cannot access this environment", retryable: false });
          return;
        }
        if (!contentTypeIsJson(request)) {
          statusCode = 400;
          sendPlatformError(response, requestId, statusCode, { code: "VALIDATION_FAILED", message: "Content-Type must be application/json", retryable: false });
          return;
        }
        const mediaScope = { tenantId: credential.tenantId, projectId: credential.projectId, environmentId };
        if (isSipTransfer) await entitlements?.authorize(mediaScope, "sip");
        const callId = (path[7] ?? "").replace(/:(?:transfer|hangup)$/u, "");
        const body = await readJsonBody(request);
        if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
        const idempotencyKey = requiredIdempotencyKeyFrom(request);
        const data = isSipTransfer
          ? await mediaOps.transferSipCall(environmentId, callId, body as Record<string, unknown>, idempotencyKey)
          : await mediaOps.hangupSipCall(environmentId, callId, idempotencyKey);
        await persistAudit(store, persistence, { ...mediaScope, actorType: "service", actorId: "platform-credential", action: isSipTransfer ? "sip.call.transfer" : "sip.call.hangup", resourceType: "sip-call", resourceId: callId, requestId, result: "success", riskLevel: isSipTransfer ? "high" : "medium", occurredAt: new Date().toISOString() });
        statusCode = 200;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data });
        return;
      }
      const isIngressCreate = method === "POST" && mediaPath && path.length === 6 && path[5] === "ingress";
      const isEgressCreate = method === "POST" && mediaPath && path.length === 6 && path[5] === "egress";
      const isSipCreate = method === "POST" && mediaPath && path.length === 7 && path[5] === "sip" && path[6] === "calls";
      if (isIngressCreate || isEgressCreate || isSipCreate) {
        const credential = await resolveRequestCredential(request, config, store, identityProvider);
        if (credential === undefined) {
          statusCode = 401;
          sendPlatformError(response, requestId, statusCode, { code: "AUTHENTICATION_FAILED", message: "A valid platform credential is required", retryable: false });
          return;
        }
        const permission = isIngressCreate ? "media.ingress.write" : isEgressCreate ? "media.egress.write" : "sip.call.write";
        if (!credentialAllows(credential, permission)) {
          statusCode = 403;
          sendPlatformError(response, requestId, statusCode, { code: "PERMISSION_DENIED", message: "The credential is not allowed to use this media capability", retryable: false });
          return;
        }
        const environmentId = path[3] ?? "";
        if (credential.environmentId !== environmentId) {
          statusCode = 403;
          sendPlatformError(response, requestId, statusCode, { code: "AUTHORIZATION_FAILED", message: "The platform credential cannot access this environment", retryable: false });
          return;
        }
        if (!contentTypeIsJson(request)) {
          statusCode = 400;
          sendPlatformError(response, requestId, statusCode, { code: "VALIDATION_FAILED", message: "Content-Type must be application/json", retryable: false });
          return;
        }
        const mediaScope = { tenantId: credential.tenantId, projectId: credential.projectId, environmentId };
        const feature = isIngressCreate ? "ingress" : isEgressCreate ? "egress" : "sip";
        await entitlements?.authorize(mediaScope, feature);
        const quota = await quotaSnapshotFor(mediaScope);
        const quotaExceeded = isIngressCreate
          ? quota.activeIngressJobs >= quota.policy.maxIngressJobs
          : isEgressCreate
            ? quota.activeEgressJobs >= quota.policy.maxEgressJobs
            : quota.activeSipCalls >= quota.policy.maxSipConcurrentCalls;
        if (quotaExceeded) {
          statusCode = 429;
          sendPlatformError(response, requestId, statusCode, { code: "QUOTA_EXCEEDED", message: `${feature} concurrent quota is exhausted`, retryable: true });
          return;
        }
        const body = await readJsonBody(request);
        if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
        const idempotencyKey = requiredIdempotencyKeyFrom(request);
        const data = isIngressCreate
          ? await mediaOps.createIngress(environmentId, body as Record<string, unknown>, idempotencyKey)
          : isEgressCreate
            ? await mediaOps.createEgress(environmentId, body as Record<string, unknown>, idempotencyKey)
            : await mediaOps.requestSipCall(environmentId, body as Record<string, unknown>, idempotencyKey);
        const resourceId = "ingressId" in data ? data.ingressId : "egressId" in data ? data.egressId : data.callId;
        await persistAudit(store, persistence, { ...mediaScope, actorType: "service", actorId: "platform-credential", action: isIngressCreate ? "media.ingress.create" : isEgressCreate ? "media.egress.create" : "sip.call.create", resourceType: isIngressCreate ? "ingress" : isEgressCreate ? "egress" : "sip-call", resourceId, requestId, result: "success", riskLevel: isIngressCreate ? "medium" : "high", occurredAt: new Date().toISOString() });
        statusCode = 201;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data });
        return;
      }

      const isRoomList =
        method === "GET" && path.length === 5 &&
        path[0] === "platform" && path[1] === "v1" && path[2] === "environments" && path[4] === "rooms";
      const isParticipantRoute =
        path.length >= 7 && path[0] === "platform" && path[1] === "v1" &&
        path[2] === "environments" && path[4] === "rooms" && path[6] === "participants";
      const isParticipantList = method === "GET" && isParticipantRoute && path.length === 7;
      const isParticipantGet = method === "GET" && isParticipantRoute && path.length === 8;
      const isParticipantRemove = method === "DELETE" && isParticipantRoute && path.length === 8;
      const isParticipantUpdate = method === "PATCH" && isParticipantRoute && path.length === 8;
      if (isRoomList || isParticipantList || isParticipantGet || isParticipantRemove || isParticipantUpdate) {
        const credential = await resolveRequestCredential(request, config, store, identityProvider);
        if (credential === undefined) {
          statusCode = 401;
          sendPlatformError(response, requestId, statusCode, {
            code: "AUTHENTICATION_FAILED",
            message: "A valid platform credential is required",
            retryable: false,
          });
          return;
        }
        const roomPermission = isParticipantRemove || isParticipantUpdate
          ? "rtc.participant.write"
          : "rtc.room.read";
        if (!credentialAllows(credential, roomPermission)) {
          statusCode = 403;
          sendPlatformError(response, requestId, statusCode, {
            code: "PERMISSION_DENIED",
            message: "The credential is not allowed to access this RTC resource",
            retryable: false,
          });
          return;
        }
        const environmentId = path[3] ?? "";
        if (credential.environmentId !== environmentId) {
          statusCode = 403;
          sendPlatformError(response, requestId, statusCode, {
            code: "AUTHORIZATION_FAILED",
            message: "The platform credential cannot access this environment",
            retryable: false,
          });
          return;
        }
        const roomName = path[5];
        const identity = path[7];
        if (!isRoomList && !validRoomSegment(roomName)) {
          statusCode = 400;
          sendPlatformError(response, requestId, statusCode, {
            code: "VALIDATION_FAILED",
            message: "room name is invalid",
            retryable: false,
          });
          return;
        }
        const safeRoomName = roomName ?? "";
        const nodeId = url.searchParams.get("nodeId") ?? undefined;
        if (isRoomList) {
          const rooms = await roomService.listRooms(nodeId);
          statusCode = 200;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: { rooms } });
          return;
        }
        if (isParticipantList) {
          const participants = await roomService.listParticipants(safeRoomName, nodeId);
          statusCode = 200;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: { participants } });
          return;
        }
        if (!validRoomSegment(identity)) {
          statusCode = 400;
          sendPlatformError(response, requestId, statusCode, {
            code: "VALIDATION_FAILED",
            message: "participant identity is invalid",
            retryable: false,
          });
          return;
        }
        const safeIdentity = identity ?? "";
        if (isParticipantGet) {
          const participant = await roomService.getParticipant(safeRoomName, safeIdentity, nodeId);
          statusCode = 200;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: participant });
          return;
        }
        if (isParticipantRemove) {
          await roomService.removeParticipant(safeRoomName, safeIdentity, nodeId);
          statusCode = 204;
          response.writeHead(statusCode);
          response.end();
          return;
        }
        if (!contentTypeIsJson(request)) {
          statusCode = 400;
          sendPlatformError(response, requestId, statusCode, {
            code: "VALIDATION_FAILED",
            message: "Content-Type must be application/json",
            retryable: false,
          });
          return;
        }
        const body = await readJsonBody(request);
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
        }
        const participant = await roomService.updateParticipant(safeRoomName, safeIdentity, body as { metadata?: string; name?: string; attributes?: Record<string, string> }, nodeId);
        statusCode = 200;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: participant });
        return;
      }

      const isWebhookCollection = path.length === 5 && path[0] === "platform" && path[1] === "v1" && path[2] === "environments" && path[4] === "webhooks";
      const isWebhookItem = path.length === 6 && path[0] === "platform" && path[1] === "v1" && path[2] === "environments" && path[4] === "webhooks";
      if (isWebhookCollection || isWebhookItem) {
        const credential = await resolveRequestCredential(request, config, store, identityProvider);
        const environmentId = path[3] ?? "";
        const destinationId = path[5] ?? "";
        const permission = method === "GET" ? "webhook.read" : "webhook.write";
        if (credential === undefined) {
          statusCode = 401;
          sendPlatformError(response, requestId, statusCode, { code: "AUTHENTICATION_FAILED", message: "A valid platform credential is required", retryable: false });
          return;
        }
        if (credential.environmentId !== environmentId || !credentialAllows(credential, permission)) {
          statusCode = 403;
          sendPlatformError(response, requestId, statusCode, { code: "AUTHORIZATION_FAILED", message: "The credential cannot access webhook destinations for this environment", retryable: false });
          return;
        }
        if (webhookDestinations === undefined) {
          statusCode = 503;
          sendPlatformError(response, requestId, statusCode, { code: "UPSTREAM_UNAVAILABLE", message: "webhook destination persistence is not configured", retryable: true });
          return;
        }
        const scope = scopeFromCredential(credential);
        if (method === "GET" && isWebhookCollection) {
          const destinations = await webhookDestinations.list(scope);
          statusCode = 200;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: { destinations } });
          return;
        }
        if (method === "GET" && isWebhookItem) {
          if (!ROOM_SEGMENT_PATTERN.test(destinationId)) {
            statusCode = 400;
            sendPlatformError(response, requestId, statusCode, { code: "VALIDATION_FAILED", message: "webhook destination id is invalid", retryable: false });
            return;
          }
          const destination = await webhookDestinations.get(destinationId, scope);
          if (destination === undefined) {
            statusCode = 404;
            sendPlatformError(response, requestId, statusCode, { code: "RESOURCE_NOT_FOUND", message: "webhook destination was not found", retryable: false });
            return;
          }
          statusCode = 200;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: destination });
          return;
        }
        if (method === "PUT" && isWebhookItem) {
          if (!ROOM_SEGMENT_PATTERN.test(destinationId) || !contentTypeIsJson(request)) {
            statusCode = 400;
            sendPlatformError(response, requestId, statusCode, { code: "VALIDATION_FAILED", message: "destination id and JSON content type are required", retryable: false });
            return;
          }
          const body = await readJsonBody(request);
          if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ContractValidationError([{ field: "$", reason: "must be a JSON object" }]);
          const input = body as Record<string, unknown>;
          const eventTypes = input.eventTypes;
          if (typeof input.url !== "string" || typeof input.secretRef !== "string" || !Array.isArray(eventTypes) || eventTypes.some((value) => typeof value !== "string")) {
            throw new ContractValidationError([{ field: "webhookDestination", reason: "url, secretRef and string eventTypes are required" }]);
          }
          if (input.status !== undefined && input.status !== "active" && input.status !== "disabled") {
            throw new ContractValidationError([{ field: "status", reason: "must be active or disabled" }]);
          }
          const destination = await webhookDestinations.upsert({
            destinationId,
            tenantId: scope.tenantId,
            projectId: scope.projectId,
            environmentId: scope.environmentId,
            url: input.url,
            secretRef: input.secretRef,
            eventTypes: eventTypes as string[],
            status: input.status === "disabled" ? "disabled" : "active",
          });
          await persistAudit(store, persistence, { ...scope, actorType: "service", actorId: "platform-credential", action: "webhook.destination.upsert", resourceType: "webhook-destination", resourceId: destination.destinationId, requestId, result: "success", riskLevel: "high", occurredAt: new Date().toISOString() });
          await persistStore();
          statusCode = 200;
          sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: destination });
          return;
        }
        if (method === "DELETE" && isWebhookItem) {
          if (!ROOM_SEGMENT_PATTERN.test(destinationId)) {
            statusCode = 400;
            sendPlatformError(response, requestId, statusCode, { code: "VALIDATION_FAILED", message: "webhook destination id is invalid", retryable: false });
            return;
          }
          await webhookDestinations.disable(destinationId, scope);
          await persistAudit(store, persistence, { ...scope, actorType: "service", actorId: "platform-credential", action: "webhook.destination.disable", resourceType: "webhook-destination", resourceId: destinationId, requestId, result: "success", riskLevel: "high", occurredAt: new Date().toISOString() });
          await persistStore();
          statusCode = 204;
          response.writeHead(statusCode);
          response.end();
          return;
        }
        statusCode = 405;
        sendPlatformError(response, requestId, statusCode, { code: "METHOD_NOT_ALLOWED", message: "unsupported webhook destination method", retryable: false });
        return;
      }

      const isEnvironmentRead =
        method === "GET" &&
        path.length === 5 &&
        path[0] === "platform" &&
        path[1] === "v1" &&
        path[2] === "environments" &&
        ["quotas", "usage", "audit", "endpoints"].includes(path[4] ?? "");
      if (isEnvironmentRead) {
        const credential = await resolveRequestCredential(request, config, store, identityProvider);
        if (credential === undefined) {
          statusCode = 401;
          sendPlatformError(response, requestId, statusCode, {
            code: "AUTHENTICATION_FAILED",
            message: "A valid platform credential is required",
            retryable: false,
          });
          return;
        }
        const environmentId = path[3] ?? "";
        if (credential.environmentId !== environmentId) {
          statusCode = 403;
          sendPlatformError(response, requestId, statusCode, {
            code: "AUTHORIZATION_FAILED",
            message: "The platform credential cannot access this environment",
            retryable: false,
          });
          return;
        }
        const scope = { ...credential, environmentId };
        const resource = path[4];
        statusCode = 200;
        const data = resource === "quotas"
          ? await quotaSnapshotFor(scope)
          : resource === "usage"
            ? { records: persistence?.listUsage === undefined ? store.listUsage(scope) : await persistence.listUsage(scope) }
            : resource === "audit"
              ? persistence?.listAudit === undefined ? store.listAudit(scope) : await persistence.listAudit(scope)
              : nodePool.nodes.map((node) => ({
                  id: node.id,
                  url: node.wsUrl,
                  protocol: "livekit-v1",
                  ...(node.regionId === undefined ? {} : { regionId: node.regionId }),
                  ...(node.residencyTags === undefined ? {} : { residencyTags: node.residencyTags }),
                  ...(node.capacityScore === undefined ? {} : { capacityScore: node.capacityScore }),
                }));
        sendJson(response, statusCode, {
          apiVersion: PLATFORM_API_VERSION,
          requestId,
          data,
        });
        return;
      }

      const outboxReplayMatch = method === "POST"
        ? url.pathname.match(/^\/platform\/v1\/admin\/outbox\/([^/:]+):requeue$/u)
        : null;
      if (outboxReplayMatch !== null) {
        const eventId = outboxReplayMatch[1] ?? "";
        if (!OUTBOX_EVENT_ID_PATTERN.test(eventId)) {
          statusCode = 400;
          sendPlatformError(response, requestId, statusCode, { code: "VALIDATION_FAILED", message: "outbox event id is invalid", retryable: false });
          return;
        }
        if (!bearerCredentialMatches(request.headers, adminCredential)) {
          statusCode = adminCredential === undefined ? 401 : 403;
          sendPlatformError(response, requestId, statusCode, {
            code: adminCredential === undefined ? "AUTHENTICATION_FAILED" : "AUTHORIZATION_FAILED",
            message: "A control-plane admin credential is required",
            retryable: false,
          });
          return;
        }
        if (outboxReplay === undefined) {
          statusCode = 503;
          sendPlatformError(response, requestId, statusCode, { code: "UPSTREAM_UNAVAILABLE", message: "outbox replay is not configured", retryable: true });
          return;
        }
        await outboxReplay.requeueDeadLetter(eventId);
        await persistAudit(store, persistence, { actorType: "service", actorId: "platform-admin", action: "outbox.requeue", resourceType: "outbox-event", resourceId: eventId, requestId, result: "success", riskLevel: "high", occurredAt: new Date().toISOString() });
        await persistStore();
        statusCode = 200;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: { eventId, status: "requeued" } });
        return;
      }

      if (url.pathname === TURN_CREDENTIAL_PATH) {
        if (method !== "POST") {
          statusCode = 405;
          sendPlatformError(response, requestId, statusCode, { code: "METHOD_NOT_ALLOWED", message: "This resource only accepts POST", retryable: false }, { allow: "POST" });
          return;
        }
        const credential = await resolveRequestCredential(request, config, store, identityProvider);
        if (credential === undefined) {
          statusCode = 401;
          sendPlatformError(response, requestId, statusCode, { code: "AUTHENTICATION_FAILED", message: "A valid platform credential is required", retryable: false });
          return;
        }
        if (!credentialAllows(credential, "rtc.turn.issue")) {
          statusCode = 403;
          sendPlatformError(response, requestId, statusCode, { code: "PERMISSION_DENIED", message: "The credential cannot issue TURN credentials", retryable: false });
          return;
        }
        if (turnCredentials === undefined) {
          statusCode = 503;
          sendPlatformError(response, requestId, statusCode, { code: "UPSTREAM_UNAVAILABLE", message: "TURN credential issuer is unavailable", retryable: true });
          return;
        }
        if (!contentTypeIsJson(request)) throw new ContractValidationError([{ field: "Content-Type", reason: "must be application/json" }]);
        const input = parseTurnCredentialRequest(await readJsonBody(request));
        requestScope = { tenantId: input.tenantId, projectId: input.projectId, environmentId: input.environmentId };
        if (!credentialHasScope(credential, requestScope)) {
          statusCode = 403;
          sendPlatformError(response, requestId, statusCode, { code: "AUTHORIZATION_FAILED", message: "The platform credential cannot access this environment", retryable: false });
          return;
        }
        await entitlements?.authorize(requestScope, "turn");
        const issued = await turnCredentials.issue(input);
        await persistAudit(store, persistence, { ...requestScope, actorType: "service", actorId: "platform-credential", action: "rtc.turn-credential.issue", resourceType: "participant", resourceId: input.participantIdentity, requestId, result: "success", riskLevel: "low", occurredAt: new Date().toISOString() });
        await persistStore();
        statusCode = 201;
        sendJson(response, statusCode, { apiVersion: PLATFORM_API_VERSION, requestId, data: issued });
        return;
      }

      if (url.pathname === TOKEN_PATH && method !== "POST") {
        statusCode = 405;
        sendPlatformError(
          response,
          requestId,
          statusCode,
          {
            code: "METHOD_NOT_ALLOWED",
            message: "This resource only accepts POST",
            retryable: false,
          },
          { allow: "POST" },
        );
        return;
      }

      if (method !== "POST" || url.pathname !== TOKEN_PATH) {
        statusCode = 404;
        sendPlatformError(response, requestId, statusCode, {
          code: "RESOURCE_NOT_FOUND",
          message: "The requested resource does not exist",
          retryable: false,
        });
        return;
      }

      const platformCredential = await resolveRequestCredential(request, config, store, identityProvider);
      if (platformCredential === undefined) {
        statusCode = 401;
        sendPlatformError(response, requestId, statusCode, {
          code: "AUTHENTICATION_FAILED",
          message: "A valid platform credential is required",
          retryable: false,
        });
        return;
      }
      if (!credentialAllows(platformCredential, "rtc.token.issue")) {
        statusCode = 403;
        sendPlatformError(response, requestId, statusCode, {
          code: "PERMISSION_DENIED",
          message: "The credential is not allowed to issue room tokens",
          retryable: false,
        });
        return;
      }

      if (!contentTypeIsJson(request)) {
        statusCode = 400;
        sendPlatformError(response, requestId, statusCode, {
          code: "VALIDATION_FAILED",
          message: "Content-Type must be application/json",
          retryable: false,
        });
        return;
      }

      const input = parseIssueRoomTokenRequest(await readJsonBody(request));
      requestScope = {
        tenantId: input.tenantId,
        projectId: input.projectId,
        environmentId: input.environmentId,
      };
      if (!credentialHasScope(platformCredential, requestScope)) {
        statusCode = 403;
        sendPlatformError(response, requestId, statusCode, {
          code: "AUTHORIZATION_FAILED",
          message: "The platform credential cannot access this environment",
          retryable: false,
        });
        return;
      }
      await entitlements?.authorize(requestScope, "rtc");
      const quota = await quotaSnapshotFor(requestScope);
      releaseTokenQuota = tokenQuota === undefined
        ? store.reserveToken(requestScope)
        : await tokenQuota.reserve(requestScope, quota.policy);
      const routing = regionRouter.select();
      let node = routing.node;
      let routingReason = routing.reason;
      const capacityRequest: RtcCapacityRequestV1 = {
        participants: 1,
        publishers: input.permissions.canPublish ? 1 : 0,
      };
      if (rtcCapacity !== undefined) {
        const candidates = [node.id, ...nodePool.nodes.map((candidate) => candidate.id).filter((id) => id !== node.id)];
        const lease = await rtcCapacity.reserve(candidates, quota.policy, capacityRequest);
        if (lease === undefined) throw new PlatformStoreError("QUOTA_EXCEEDED", "RTC capacity admission failed: no healthy non-draining node has capacity");
        failedCapacityLease = lease;
        node = nodePool.get(lease.nodeId);
        routingReason = node.id === routing.node.id ? `${routing.reason}+capacity` : "capacity-fallback";
      } else if (capacityController !== undefined) {
        const preferred = capacityController.decide(node.id, quota.policy, capacityRequest);
        if (!preferred.admitted) {
          const fallback = capacityController.choose(quota.policy, capacityRequest);
          if (fallback === undefined) throw new PlatformStoreError("QUOTA_EXCEEDED", `RTC capacity admission failed: ${preferred.reason}`);
          node = nodePool.get(fallback.nodeId);
          routingReason = "capacity-fallback";
        }
      }
      const tokenIssuer = tokenIssuers.get(node.id);
      if (tokenIssuer === undefined) {
        throw new Error(`token issuer unavailable for RTC node ${node.id}`);
      }
      const token = await tokenIssuer.issue(input);
      const usageNow = Date.now();
      const usageWindowStart = new Date(usageNow - (usageNow % 60_000)).toISOString();
      await persistUsageAndAudit(store, persistence, {
        tenantId: input.tenantId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        resourceType: "rtc-token",
        resourceId: input.roomName,
        metric: "token_issued",
        quantity: 1,
        unit: "request",
        windowStart: usageWindowStart,
        windowEnd: new Date(new Date(usageWindowStart).getTime() + 60_000).toISOString(),
        source: "platform-api",
        dedupeKey: `${requestId}:rtc-token`,
      }, {
        tenantId: input.tenantId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        actorType: "service",
        actorId: "platform-credential",
        action: "rtc.token.issue",
        resourceType: "room",
        resourceId: input.roomName,
        requestId,
        result: "success",
        riskLevel: "low",
        occurredAt: new Date().toISOString(),
        details: { nodeId: node.id, routingReason },
      });
      await releaseTokenQuota();
      releaseTokenQuota = undefined;
      await persistStore();
      failedCapacityLease = undefined;
      statusCode = 201;
      sendJson(response, statusCode, {
        apiVersion: PLATFORM_API_VERSION,
        requestId,
        data: { ...token, nodeId: node.id, routingReason },
      });
    } catch (error) {
      errorName = error instanceof Error ? error.name : "UnknownError";
      if (error instanceof ContractValidationError) {
        statusCode = 400;
        sendPlatformError(response, requestId, statusCode, {
          code: "VALIDATION_FAILED",
          message: "Request does not satisfy the platform contract",
          retryable: false,
          details: error.issues.map((issue) => ({
            field: issue.field,
            reason: issue.reason,
          })),
        });
      } else if (error instanceof RequestBodyError) {
        statusCode = error.statusCode;
        sendPlatformError(response, requestId, statusCode, {
          code: error.code,
          message: error.message,
          retryable: false,
        });
      } else if (error instanceof PlatformStoreError) {
        statusCode = error.statusCode;
        sendPlatformError(response, requestId, statusCode, {
          code: error.code,
          message: error.message,
          retryable: error.code === "QUOTA_EXCEEDED",
        });
      } else if (error instanceof EntitlementError) {
        statusCode = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 403;
        sendPlatformError(response, requestId, statusCode, {
          code: error.code === "NOT_FOUND" ? "RESOURCE_NOT_FOUND" : error.code === "CONFLICT" ? "RESOURCE_CONFLICT" : "PERMISSION_DENIED",
          message: error.message,
          retryable: false,
        });
      } else if (error instanceof SupportServiceError) {
        statusCode = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 403;
        sendPlatformError(response, requestId, statusCode, {
          code: error.code === "NOT_FOUND" ? "RESOURCE_NOT_FOUND" : error.code === "CONFLICT" ? "RESOURCE_CONFLICT" : "PERMISSION_DENIED",
          message: error.message,
          retryable: false,
        });
      } else if (error instanceof RemoteAssistanceError) {
        statusCode = error.code === "CONFLICT" ? 409 : 403;
        sendPlatformError(response, requestId, statusCode, {
          code: error.code === "CONFLICT" ? "RESOURCE_CONFLICT" : "PERMISSION_DENIED",
          message: error.message,
          retryable: false,
        });
      } else if (error instanceof MediaOpsUnavailableError) {
        statusCode = 503;
        sendPlatformError(response, requestId, statusCode, {
          code: "UPSTREAM_UNAVAILABLE",
          message: "Media service is unavailable",
          retryable: true,
        });
      } else if (error instanceof MediaOpsRequestError) {
        statusCode = [400, 401, 403, 404, 409, 429, 502, 503].includes(error.statusCode) ? error.statusCode : 502;
        const code = statusCode === 401 ? "AUTHENTICATION_FAILED" : statusCode === 403 ? "PERMISSION_DENIED" : statusCode === 404 ? "RESOURCE_NOT_FOUND" : statusCode === 409 ? "RESOURCE_CONFLICT" : statusCode === 429 ? "QUOTA_EXCEEDED" : statusCode >= 500 ? "UPSTREAM_UNAVAILABLE" : "VALIDATION_FAILED";
        sendPlatformError(response, requestId, statusCode, {
          code,
          message: statusCode >= 500 ? "Media service is unavailable" : error.message,
          retryable: statusCode === 429 || statusCode >= 500,
        });
      } else {
        statusCode = 500;
        sendPlatformError(response, requestId, statusCode, {
          code: "INTERNAL_ERROR",
          message: "The request could not be completed",
          retryable: false,
        });
      }
    } finally {
      await failedCapacityLease?.release();
      await releaseTokenQuota?.();
      metrics.increment("yujian_http_requests_total", {
        method,
        path: metricsRoute(url.pathname),
        status_code: String(statusCode),
      });
      metrics.observe("yujian_http_request_duration_ms", Math.max(0, performance.now() - requestStartedAt), {
        method,
        path: metricsRoute(url.pathname),
        status_code: String(statusCode),
      });
      logger({
        level: statusCode >= 500 ? "error" : "info",
        requestId,
        method,
        path: url.pathname,
        statusCode,
        ...(errorName === undefined ? {} : { errorName }),
        ...(requestScope === undefined ? {} : requestScope),
      });
    }
  });

  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  return server;
}
