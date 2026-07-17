import { randomUUID } from "node:crypto";
import type { DataSubjectRequestV1 } from "@yujian/platform-contracts";
import type { DataRightsExecutor } from "./index.js";

export interface DataRightsSqlResult<Row extends object> { rows: readonly Row[] }
export interface DataRightsSqlConnection extends DataRightsSqlPool { release(): Promise<void> | void }
export interface DataRightsSqlPool {
  query<Row extends object>(text: string, values?: readonly unknown[]): Promise<DataRightsSqlResult<Row>>;
  connect?(): Promise<DataRightsSqlConnection>;
}

type RequestRow = {
  request_id: string;
  tenant_id: string;
  subject_id: string;
  kind: DataSubjectRequestV1["kind"];
  status: DataSubjectRequestV1["status"];
  evidence_uri: string | null;
  created_at: string;
  completed_at: string | null;
};

function requiredText(value: string, field: string): string {
  if (value.length === 0 || value.length > 256 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${field} is invalid`);
  return value;
}

function fromRow(row: RequestRow): DataSubjectRequestV1 {
  return {
    requestId: row.request_id,
    tenantId: row.tenant_id,
    subjectId: row.subject_id,
    kind: row.kind,
    status: row.status,
    ...(row.evidence_uri === null ? {} : { evidenceUri: row.evidence_uri }),
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.completed_at === null ? {} : { completedAt: new Date(row.completed_at).toISOString() }),
  };
}

/** PostgreSQL lifecycle store; exported subject content remains outside the request table. */
export class PostgresDataRightsService {
  constructor(private readonly pool: DataRightsSqlPool) {}

  async submit(input: Omit<DataSubjectRequestV1, "requestId" | "status" | "createdAt">, idempotencyKey?: string): Promise<DataSubjectRequestV1> {
    requiredText(input.tenantId, "tenantId");
    requiredText(input.subjectId, "subjectId");
    if (!["export", "delete", "rectify"].includes(input.kind)) throw new Error("unsupported data-rights kind");
    if (idempotencyKey !== undefined) requiredText(idempotencyKey, "idempotencyKey");
    const result = await this.pool.query<RequestRow>(
      `INSERT INTO data_subject_requests (request_id, tenant_id, subject_id, kind, status, idempotency_key, created_at)
       VALUES ($1,$2,$3,$4,'received',$5,NOW())
       ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
       DO UPDATE SET request_id = data_subject_requests.request_id
       WHERE data_subject_requests.subject_id = EXCLUDED.subject_id
         AND data_subject_requests.kind = EXCLUDED.kind
       RETURNING *`,
      [`dsr-${randomUUID()}`, input.tenantId, input.subjectId, input.kind, idempotencyKey ?? null],
    );
    const row = result.rows[0];
    if (row === undefined) {
      if (idempotencyKey !== undefined) throw new Error("idempotency key was reused with different data-rights fields");
      throw new Error("data-rights insert returned no row");
    }
    return fromRow(row);
  }

  async get(requestId: string): Promise<DataSubjectRequestV1> {
    const result = await this.pool.query<RequestRow>("SELECT * FROM data_subject_requests WHERE request_id = $1", [requiredText(requestId, "requestId")]);
    const row = result.rows[0];
    if (row === undefined) throw new Error("data-rights request not found");
    return fromRow(row);
  }

  async list(tenantId: string): Promise<readonly DataSubjectRequestV1[]> {
    const result = await this.pool.query<RequestRow>("SELECT * FROM data_subject_requests WHERE tenant_id = $1 ORDER BY created_at, request_id", [requiredText(tenantId, "tenantId")]);
    return result.rows.map(fromRow);
  }

  async start(requestId: string): Promise<DataSubjectRequestV1> {
    return this.transition(requestId, "processing", ["received"]);
  }

  async recoverStale(processingLeaseMs: number): Promise<number> {
    if (!Number.isInteger(processingLeaseMs) || processingLeaseMs < 30_000 || processingLeaseMs > 3_600_000) {
      throw new RangeError("data-rights processing lease is invalid");
    }
    const result = await this.pool.query<{ request_id: string }>(
      `UPDATE data_subject_requests SET status = 'received', processing_started_at = NULL
       WHERE status = 'processing'
         AND processing_started_at <= NOW() - ($1::bigint * interval '1 millisecond')
       RETURNING request_id`,
      [processingLeaseMs],
    );
    return result.rows.length;
  }

  async heartbeat(requestId: string): Promise<boolean> {
    const result = await this.pool.query<{ request_id: string }>(
      `UPDATE data_subject_requests SET processing_started_at = NOW()
       WHERE request_id = $1 AND status = 'processing' RETURNING request_id`,
      [requiredText(requestId, "requestId")],
    );
    return result.rows.length === 1;
  }

  async complete(requestId: string, evidenceUri: string): Promise<DataSubjectRequestV1> {
    requiredText(evidenceUri, "evidenceUri");
    const result = await this.pool.query<RequestRow>(
      "UPDATE data_subject_requests SET status = 'completed', evidence_uri = $2, completed_at = NOW(), processing_started_at = NULL WHERE request_id = $1 AND status = 'processing' RETURNING *",
      [requiredText(requestId, "requestId"), evidenceUri],
    );
    return this.updatedOrExplain(result.rows, requestId, "completed");
  }

  async reject(requestId: string, evidenceUri?: string): Promise<DataSubjectRequestV1> {
    if (evidenceUri !== undefined) requiredText(evidenceUri, "evidenceUri");
    const result = await this.pool.query<RequestRow>(
      "UPDATE data_subject_requests SET status = 'rejected', evidence_uri = $2, completed_at = NOW(), processing_started_at = NULL WHERE request_id = $1 AND status IN ('received','processing') RETURNING *",
      [requiredText(requestId, "requestId"), evidenceUri ?? null],
    );
    return this.updatedOrExplain(result.rows, requestId, "rejected");
  }

  async process(requestId: string, executor: DataRightsExecutor): Promise<DataSubjectRequestV1> {
    const started = await this.start(requestId);
    const context = { requestId: started.requestId, tenantId: started.tenantId, subjectId: started.subjectId };
    try {
      const evidenceUri = started.kind === "export"
        ? await executor.exportSubject(context)
        : started.kind === "delete"
          ? await executor.deleteSubject(context)
          : await executor.rectifySubject(context);
      return await this.complete(requestId, evidenceUri);
    } catch (error) {
      await this.reject(requestId).catch(() => undefined);
      throw error;
    }
  }

  private async transition(requestId: string, status: "processing", allowed: readonly string[]): Promise<DataSubjectRequestV1> {
    const result = await this.pool.query<RequestRow>(
      "UPDATE data_subject_requests SET status = $2, processing_started_at = NOW() WHERE request_id = $1 AND status = ANY($3::text[]) RETURNING *",
      [requiredText(requestId, "requestId"), status, allowed],
    );
    return this.updatedOrExplain(result.rows, requestId, status);
  }

  private async updatedOrExplain(rows: readonly RequestRow[], requestId: string, status: string): Promise<DataSubjectRequestV1> {
    const row = rows[0];
    if (row !== undefined) return fromRow(row);
    const current = await this.get(requestId);
    throw new Error(`data-rights request cannot transition from ${current.status} to ${status}`);
  }
}
