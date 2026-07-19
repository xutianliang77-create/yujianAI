import { createHash } from "node:crypto";
import type { ToolAuditSink, ToolResultRecord, ToolResultStore } from "./tool-policy.js";

export interface ToolPersistenceSqlPool {
  query<Row extends object>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly Row[] }>;
}

export interface ToolResultEnvelope {
  ciphertext: Uint8Array;
  encryptionKeyRef: string;
}

export interface ToolResultCodec {
  seal(key: string, result: unknown): Promise<ToolResultEnvelope>;
  open(key: string, envelope: ToolResultEnvelope): Promise<unknown>;
}

type ToolResultRow = { result_ciphertext: Uint8Array; encryption_key_ref: string; ciphertext_sha256: string };

function digest(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }

/** Encrypted, insert-once tool result store. Plain tool output never enters SQL. */
export class PostgresToolResultStore implements ToolResultStore {
  constructor(private readonly pool: ToolPersistenceSqlPool, private readonly codec: ToolResultCodec) {}

  async get(key: string): Promise<ToolResultRecord> {
    const result = await this.pool.query<ToolResultRow>(
      "SELECT result_ciphertext, encryption_key_ref, ciphertext_sha256 FROM agent_tool_results WHERE result_key = $1",
      [key],
    );
    const row = result.rows[0];
    if (row === undefined) return { found: false, result: undefined };
    if (digest(row.result_ciphertext) !== row.ciphertext_sha256) throw new Error("stored tool result digest mismatch");
    return { found: true, result: await this.codec.open(key, { ciphertext: row.result_ciphertext, encryptionKeyRef: row.encryption_key_ref }) };
  }

  async put(key: string, value: unknown): Promise<void> {
    const envelope = await this.codec.seal(key, value);
    const sha256 = digest(envelope.ciphertext);
    const result = await this.pool.query<{ ciphertext_sha256: string }>(
      `INSERT INTO agent_tool_results (result_key, result_ciphertext, encryption_key_ref, ciphertext_sha256, created_at)
       VALUES ($1,$2,$3,$4,now()) ON CONFLICT (result_key) DO NOTHING RETURNING ciphertext_sha256`,
      [key, envelope.ciphertext, envelope.encryptionKeyRef, sha256],
    );
    if (result.rows[0] !== undefined) return;
    const current = await this.pool.query<{ ciphertext_sha256: string }>("SELECT ciphertext_sha256 FROM agent_tool_results WHERE result_key = $1", [key]);
    if (current.rows[0]?.ciphertext_sha256 !== sha256) throw new Error("tool result idempotency conflict");
  }
}

/** Append-only tool decision audit; key is already a subject/tool/idempotency digest. */
export class PostgresToolAuditSink implements ToolAuditSink {
  constructor(private readonly pool: ToolPersistenceSqlPool) {}

  async append(event: Parameters<ToolAuditSink["append"]>[0]): Promise<void> {
    await this.pool.query(
      `INSERT INTO agent_tool_audit (tool_id, result_key, trace_id, subject_id, outcome, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6::timestamptz)`,
      [event.toolId, event.key, event.traceId, event.subject, event.outcome, event.occurredAt],
    );
  }
}
