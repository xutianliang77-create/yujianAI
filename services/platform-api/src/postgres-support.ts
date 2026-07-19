import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  CreateSupportTicketRequestV1,
  IssueSupportAccessGrantRequestV1,
  IssuedSupportAccessGrantV1,
  PlatformScopeV1,
  RegisterSupportBundleRequestV1,
  SupportAccessGrantV1,
  SupportBundleArtifactV1,
  SupportTicketV1,
  UpdateSupportTicketRequestV1,
} from "@yujian/platform-contracts";

export class SupportServiceError extends Error {
  constructor(readonly code: "NOT_FOUND" | "CONFLICT" | "DENIED", message: string) {
    super(message);
    this.name = "SupportServiceError";
  }
}

export interface SupportSqlResult<Row extends object> { rows: readonly Row[] }
export interface SupportSqlPool { query<Row extends object>(text: string, values?: readonly unknown[]): Promise<SupportSqlResult<Row>> }

export interface PlatformSupportService {
  create(scope: PlatformScopeV1, input: CreateSupportTicketRequestV1, idempotencyKey: string): Promise<SupportTicketV1>;
  list(scope: PlatformScopeV1): Promise<readonly SupportTicketV1[]>;
  get(scope: PlatformScopeV1, ticketId: string): Promise<SupportTicketV1>;
  getById(ticketId: string): Promise<SupportTicketV1>;
  update(ticketId: string, input: UpdateSupportTicketRequestV1): Promise<SupportTicketV1>;
  registerBundle(ticketId: string, input: RegisterSupportBundleRequestV1): Promise<SupportBundleArtifactV1>;
  getBundle(ticketId: string, bundleId: string): Promise<SupportBundleArtifactV1>;
  issueAccess(ticketId: string, input: IssueSupportAccessGrantRequestV1): Promise<IssuedSupportAccessGrantV1>;
  consumeAccess(accessToken: string, permission: SupportAccessGrantV1["permissions"][number], ticketId: string): Promise<SupportAccessGrantV1>;
  revokeAccess(grantId: string): Promise<SupportAccessGrantV1>;
}

type TicketRow = {
  ticket_id: string; tenant_id: string; project_id: string; environment_id: string;
  severity: SupportTicketV1["severity"]; category: SupportTicketV1["category"];
  summary: string; status: SupportTicketV1["status"]; created_at: string; updated_at: string;
  request_fingerprint: string;
  version: string | number;
};

type BundleRow = {
  bundle_id: string; ticket_id: string; artifact_uri: string; sha256: string;
  size_bytes: string | number; redaction_policy_version: string; contains_media: boolean;
  expires_at: string; created_at: string;
};

type GrantRow = {
  grant_id: string; ticket_id: string; operator_subject: string; permissions: unknown;
  approval_receipt_ref: string | null;
  expires_at: string; created_at: string; revoked_at: string | null;
};

const PERMISSIONS = new Set<SupportAccessGrantV1["permissions"][number]>(["ticket.read", "bundle.download", "remote.inspect", "remote.execute"]);
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const STABLE_EVIDENCE_REF = /^(?:evidence|https|s3|oss):\/\/[^\s?#]+$/u;

function stableArtifactUri(value: string): boolean {
  try {
    const parsed = new URL(value);
    return ["s3:", "gs:", "https:"].includes(parsed.protocol) && parsed.hostname !== "" && parsed.username === "" && parsed.password === "" && parsed.search === "" && parsed.hash === "";
  } catch {
    return false;
  }
}

function integer(value: string | number, field: string, minimum: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new Error(`invalid support ${field}`);
  return parsed;
}

function time(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`invalid support ${field}`);
  return new Date(parsed).toISOString();
}

function ticketFrom(row: TicketRow | undefined): SupportTicketV1 {
  if (row === undefined) throw new SupportServiceError("NOT_FOUND", "Support ticket not found");
  return {
    ticketId: row.ticket_id, tenantId: row.tenant_id, projectId: row.project_id,
    environmentId: row.environment_id, severity: row.severity, category: row.category,
    summary: row.summary, status: row.status, createdAt: time(row.created_at, "created_at"),
    updatedAt: time(row.updated_at, "updated_at"), version: integer(row.version, "version", 1),
  };
}

function bundleFrom(row: BundleRow | undefined): SupportBundleArtifactV1 {
  if (row === undefined) throw new SupportServiceError("NOT_FOUND", "Support ticket is not eligible for a bundle");
  if (row.contains_media !== false) throw new Error("support bundle must not contain media");
  if (!stableArtifactUri(row.artifact_uri) || !DIGEST.test(row.sha256)) throw new Error("support bundle metadata is invalid");
  return {
    bundleId: row.bundle_id, ticketId: row.ticket_id, artifactUri: row.artifact_uri,
    sha256: row.sha256, sizeBytes: integer(row.size_bytes, "size_bytes", 0),
    redactionPolicyVersion: row.redaction_policy_version, containsMedia: false,
    expiresAt: time(row.expires_at, "expires_at"), createdAt: time(row.created_at, "created_at"),
  };
}

function grantFrom(row: GrantRow | undefined): SupportAccessGrantV1 {
  if (row === undefined) throw new SupportServiceError("DENIED", "Support access grant is invalid or unavailable");
  if (!Array.isArray(row.permissions) || row.permissions.length !== 1 || row.permissions.some((item) => typeof item !== "string" || !PERMISSIONS.has(item as SupportAccessGrantV1["permissions"][number]))) throw new Error("invalid support permissions");
  const remote = row.permissions[0] === "remote.inspect" || row.permissions[0] === "remote.execute";
  if (remote !== (row.approval_receipt_ref !== null) || (row.approval_receipt_ref !== null && !STABLE_EVIDENCE_REF.test(row.approval_receipt_ref))) throw new Error("invalid support approval binding");
  return {
    grantId: row.grant_id, ticketId: row.ticket_id, operatorSubject: row.operator_subject,
    permissions: [...row.permissions] as SupportAccessGrantV1["permissions"],
    ...(row.approval_receipt_ref === null ? {} : { approvalReceiptRef: row.approval_receipt_ref }),
    expiresAt: time(row.expires_at, "expires_at"), createdAt: time(row.created_at, "created_at"),
    ...(row.revoked_at === null ? {} : { revokedAt: time(row.revoked_at, "revoked_at") }),
  };
}

function digest(token: string): string {
  return `sha256:${createHash("sha256").update(token, "utf8").digest("hex")}`;
}

function requestFingerprint(input: CreateSupportTicketRequestV1): string {
  return digest(JSON.stringify({ severity: input.severity, category: input.category, summary: input.summary }));
}

export class PostgresSupportService implements PlatformSupportService {
  constructor(private readonly pool: SupportSqlPool, private readonly clock: () => number = Date.now) {}

  async create(scope: PlatformScopeV1, input: CreateSupportTicketRequestV1, idempotencyKey: string): Promise<SupportTicketV1> {
    if (idempotencyKey.length === 0 || idempotencyKey.length > 128 || /[\u0000-\u001f\u007f]/u.test(idempotencyKey)) throw new Error("invalid support idempotency key");
    const now = new Date(this.clock()).toISOString();
    const fingerprint = requestFingerprint(input);
    const result = await this.pool.query<TicketRow>(
      `INSERT INTO support_tickets
       (ticket_id,tenant_id,project_id,environment_id,severity,category,summary,idempotency_key,request_fingerprint,status,created_at,updated_at,version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10,$10,1)
       ON CONFLICT (environment_id,idempotency_key) DO NOTHING RETURNING *`,
      [`support-${randomUUID()}`, scope.tenantId, scope.projectId, scope.environmentId, input.severity, input.category, input.summary, idempotencyKey, fingerprint, now],
    );
    if (result.rows[0] !== undefined) return ticketFrom(result.rows[0]);
    const replay = await this.pool.query<TicketRow>(
      "SELECT * FROM support_tickets WHERE environment_id=$1 AND idempotency_key=$2",
      [scope.environmentId, idempotencyKey],
    );
    const row = replay.rows[0];
    if (row === undefined || row.tenant_id !== scope.tenantId || row.project_id !== scope.projectId || row.request_fingerprint !== fingerprint) throw new SupportServiceError("CONFLICT", "Support ticket idempotency key was reused with a different request");
    return ticketFrom(row);
  }

  async list(scope: PlatformScopeV1): Promise<readonly SupportTicketV1[]> {
    const result = await this.pool.query<TicketRow>(
      "SELECT * FROM support_tickets WHERE tenant_id=$1 AND project_id=$2 AND environment_id=$3 ORDER BY updated_at DESC, ticket_id",
      [scope.tenantId, scope.projectId, scope.environmentId],
    );
    return result.rows.map(ticketFrom);
  }

  async get(scope: PlatformScopeV1, ticketId: string): Promise<SupportTicketV1> {
    const result = await this.pool.query<TicketRow>(
      "SELECT * FROM support_tickets WHERE ticket_id=$1 AND tenant_id=$2 AND project_id=$3 AND environment_id=$4",
      [ticketId, scope.tenantId, scope.projectId, scope.environmentId],
    );
    return ticketFrom(result.rows[0]);
  }

  async getById(ticketId: string): Promise<SupportTicketV1> {
    const result = await this.pool.query<TicketRow>("SELECT * FROM support_tickets WHERE ticket_id=$1", [ticketId]);
    return ticketFrom(result.rows[0]);
  }

  async update(ticketId: string, input: UpdateSupportTicketRequestV1): Promise<SupportTicketV1> {
    const result = await this.pool.query<TicketRow>(
      "UPDATE support_tickets SET status=$2,updated_at=$3,version=version+1 WHERE ticket_id=$1 AND version=$4 RETURNING *",
      [ticketId, input.status, new Date(this.clock()).toISOString(), input.expectedVersion],
    );
    if (result.rows[0] === undefined) throw new SupportServiceError("CONFLICT", "Support ticket version conflict or ticket not found");
    return ticketFrom(result.rows[0]);
  }

  async registerBundle(ticketId: string, input: RegisterSupportBundleRequestV1): Promise<SupportBundleArtifactV1> {
    if (Date.parse(input.expiresAt) <= this.clock()) throw new SupportServiceError("DENIED", "Support bundle is already expired");
    const result = await this.pool.query<BundleRow>(
      `INSERT INTO support_bundle_artifacts
       (bundle_id,ticket_id,artifact_uri,sha256,size_bytes,redaction_policy_version,contains_media,expires_at,created_at)
       SELECT $1,ticket_id,$3,$4,$5,$6,false,$7,$8 FROM support_tickets
       WHERE ticket_id=$2 AND status IN ('open','in-progress') RETURNING *`,
      [`bundle-${randomUUID()}`, ticketId, input.artifactUri, input.sha256, input.sizeBytes, input.redactionPolicyVersion, input.expiresAt, new Date(this.clock()).toISOString()],
    );
    return bundleFrom(result.rows[0]);
  }

  async getBundle(ticketId: string, bundleId: string): Promise<SupportBundleArtifactV1> {
    const result = await this.pool.query<BundleRow>(
      "SELECT * FROM support_bundle_artifacts WHERE ticket_id=$1 AND bundle_id=$2 AND expires_at>$3",
      [ticketId, bundleId, new Date(this.clock()).toISOString()],
    );
    return bundleFrom(result.rows[0]);
  }

  async issueAccess(ticketId: string, input: IssueSupportAccessGrantRequestV1): Promise<IssuedSupportAccessGrantV1> {
    const token = `yj_sup_${randomBytes(32).toString("base64url")}`;
    const createdAt = new Date(this.clock());
    const result = await this.pool.query<GrantRow>(
      `INSERT INTO support_access_grants
       (grant_id,ticket_id,operator_subject,permissions,approval_receipt_ref,token_prefix,token_hash,expires_at,created_at)
       SELECT $1,ticket_id,$3,$4::jsonb,$5,$6,$7,$8,$9 FROM support_tickets
       WHERE ticket_id=$2 AND status IN ('open','in-progress') RETURNING *`,
      [`grant-${randomUUID()}`, ticketId, input.operatorSubject, JSON.stringify(input.permissions), input.approvalReceiptRef ?? null, token.slice(0, 15), digest(token), new Date(createdAt.getTime() + input.ttlSeconds * 1000).toISOString(), createdAt.toISOString()],
    );
    return { ...grantFrom(result.rows[0]), accessToken: token };
  }

  async consumeAccess(accessToken: string, permission: SupportAccessGrantV1["permissions"][number], ticketId: string): Promise<SupportAccessGrantV1> {
    if (!/^yj_sup_[A-Za-z0-9_-]{43}$/u.test(accessToken) || !PERMISSIONS.has(permission)) throw new SupportServiceError("DENIED", "Support access grant is invalid or unavailable");
    const result = await this.pool.query<GrantRow>(
      `UPDATE support_access_grants SET consumed_at=$3
       WHERE token_hash=$1 AND permissions ? $2 AND revoked_at IS NULL AND consumed_at IS NULL AND expires_at>$3 AND ticket_id=$4
       RETURNING *`,
      [digest(accessToken), permission, new Date(this.clock()).toISOString(), ticketId],
    );
    return grantFrom(result.rows[0]);
  }

  async revokeAccess(grantId: string): Promise<SupportAccessGrantV1> {
    const result = await this.pool.query<GrantRow>(
      "UPDATE support_access_grants SET revoked_at=$2 WHERE grant_id=$1 AND revoked_at IS NULL RETURNING *",
      [grantId, new Date(this.clock()).toISOString()],
    );
    if (result.rows[0] === undefined) throw new SupportServiceError("NOT_FOUND", "Support access grant not found or already revoked");
    return grantFrom(result.rows[0]);
  }
}
