import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PlatformSupportService, SupportSqlPool } from "./postgres-support.js";

export type RemoteCommandClass = "read-only-inspection" | "configuration-change" | "service-restart";
export interface RemoteAssistanceSession {
  sessionId: string;
  grantId: string;
  ticketId: string;
  operatorSubject: string;
  permission: "remote.inspect" | "remote.execute";
  approvalReceiptRef: string;
  expiresAt: string;
  startedAt: string;
  endedAt?: string;
}
export interface IssuedRemoteAssistanceSession extends RemoteAssistanceSession { sessionToken: string; }
export class RemoteAssistanceError extends Error {
  constructor(readonly code: "DENIED" | "CONFLICT", message: string) { super(message); this.name = "RemoteAssistanceError"; }
}

type SessionRow = {
  session_id: string; grant_id: string; ticket_id: string; operator_subject: string;
  permission: RemoteAssistanceSession["permission"]; approval_receipt_ref: string;
  expires_at: string; started_at: string; ended_at: string | null;
};

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SESSION_TOKEN = /^yj_remote_[A-Za-z0-9_-]{43}$/u;

function digest(value: string): string { return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`; }
function fromRow(row: SessionRow | undefined): RemoteAssistanceSession {
  if (row === undefined) throw new RemoteAssistanceError("DENIED", "remote assistance session is unavailable");
  return {
    sessionId: row.session_id, grantId: row.grant_id, ticketId: row.ticket_id, operatorSubject: row.operator_subject,
    permission: row.permission, approvalReceiptRef: row.approval_receipt_ref,
    expiresAt: new Date(row.expires_at).toISOString(), startedAt: new Date(row.started_at).toISOString(),
    ...(row.ended_at === null ? {} : { endedAt: new Date(row.ended_at).toISOString() }),
  };
}

/** One-time support grant exchange plus append-only, command-digest-only remote audit. */
export class PostgresRemoteAssistanceService {
  constructor(private readonly pool: SupportSqlPool, private readonly support: PlatformSupportService, private readonly clock: () => number = Date.now) {}

  async begin(accessToken: string, ticketId: string, permission: "remote.inspect" | "remote.execute"): Promise<IssuedRemoteAssistanceSession> {
    const grant = await this.support.consumeAccess(accessToken, permission, ticketId);
    if (grant.approvalReceiptRef === undefined) throw new RemoteAssistanceError("DENIED", "remote assistance grant has no approval receipt");
    const sessionToken = `yj_remote_${randomBytes(32).toString("base64url")}`;
    const startedAt = new Date(this.clock()).toISOString();
    const result = await this.pool.query<SessionRow>(
      `INSERT INTO remote_assistance_sessions
       (session_id,grant_id,ticket_id,session_token_hash,operator_subject,permission,approval_receipt_ref,expires_at,started_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [`remote-${randomUUID()}`, grant.grantId, ticketId, digest(sessionToken), grant.operatorSubject, permission, grant.approvalReceiptRef, grant.expiresAt, startedAt],
    );
    const session = fromRow(result.rows[0]);
    await this.append(session.grantId, "started", undefined, undefined, "allowed", startedAt);
    return { ...session, sessionToken };
  }

  async record(sessionId: string, sessionToken: string, commandClass: RemoteCommandClass, commandDigest: string, outcome: "allowed" | "denied" | "succeeded" | "failed"): Promise<RemoteAssistanceSession> {
    if (!/^remote-[0-9a-f-]{36}$/u.test(sessionId) || !SESSION_TOKEN.test(sessionToken) || !DIGEST.test(commandDigest) || !(["read-only-inspection", "configuration-change", "service-restart"] as const).includes(commandClass) || !(["allowed", "denied", "succeeded", "failed"] as const).includes(outcome)) throw new RemoteAssistanceError("DENIED", "remote assistance audit input is invalid");
    const result = await this.pool.query<SessionRow>(
      "SELECT * FROM remote_assistance_sessions WHERE session_id=$1 AND session_token_hash=$2 AND ended_at IS NULL AND expires_at>$3",
      [sessionId, digest(sessionToken), new Date(this.clock()).toISOString()],
    );
    const session = fromRow(result.rows[0]);
    const permitted = session.permission === "remote.execute" || commandClass === "read-only-inspection";
    const effectiveOutcome = permitted ? outcome : "denied";
    await this.append(session.grantId, permitted ? "command-allowed" : "command-denied", commandClass, commandDigest, effectiveOutcome, new Date(this.clock()).toISOString());
    if (!permitted) throw new RemoteAssistanceError("DENIED", "remote assistance command class is not approved");
    return session;
  }

  async end(sessionId: string, sessionToken: string): Promise<RemoteAssistanceSession> {
    if (!/^remote-[0-9a-f-]{36}$/u.test(sessionId) || !SESSION_TOKEN.test(sessionToken)) throw new RemoteAssistanceError("DENIED", "remote assistance session token is invalid");
    const endedAt = new Date(this.clock()).toISOString();
    const result = await this.pool.query<SessionRow>(
      "UPDATE remote_assistance_sessions SET ended_at=$3 WHERE session_id=$1 AND session_token_hash=$2 AND ended_at IS NULL RETURNING *",
      [sessionId, digest(sessionToken), endedAt],
    );
    const session = fromRow(result.rows[0]);
    await this.append(session.grantId, "ended", undefined, undefined, "succeeded", endedAt);
    return session;
  }

  private async append(grantId: string, eventType: "started" | "command-allowed" | "command-denied" | "ended", commandClass: RemoteCommandClass | undefined, commandDigest: string | undefined, outcome: "allowed" | "denied" | "succeeded" | "failed", occurredAt: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO remote_assistance_events
       (event_id,grant_id,event_type,command_class,command_digest,outcome,occurred_at,details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'{}'::jsonb)`,
      [`remote-event-${randomUUID()}`, grantId, eventType, commandClass ?? null, commandDigest ?? null, outcome, occurredAt],
    );
  }
}
