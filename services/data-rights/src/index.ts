import { randomUUID } from "node:crypto";
import type { DataSubjectRequestV1 } from "@yujian/platform-contracts";

export class DataRightsError extends Error {
  constructor(message: string) { super(message); this.name = "DataRightsError"; }
}

export interface DataRightsExecutionContext {
  requestId: string;
  tenantId: string;
  subjectId: string;
}

/** Storage-specific work stays behind this adapter; no raw subject data enters the service. */
export interface DataRightsExecutor {
  exportSubject(context: DataRightsExecutionContext): Promise<string>;
  deleteSubject(context: DataRightsExecutionContext): Promise<string>;
  rectifySubject(context: DataRightsExecutionContext): Promise<string>;
}

function requiredText(value: string, field: string): string {
  if (value.length === 0 || value.length > 256 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new DataRightsError(`${field} must be a trimmed control-free string`);
  }
  return value;
}

export class DataRightsService {
  readonly requests = new Map<string, DataSubjectRequestV1>();
  private readonly processing = new Set<string>();
  private readonly idempotency = new Map<string, { request: DataSubjectRequestV1; fingerprint: string }>();

  submit(input: Omit<DataSubjectRequestV1, "requestId" | "status" | "createdAt">, idempotencyKey?: string): DataSubjectRequestV1 {
    requiredText(input.tenantId, "tenantId");
    requiredText(input.subjectId, "subjectId");
    if (!(input.kind === "export" || input.kind === "delete" || input.kind === "rectify")) throw new DataRightsError("unsupported data rights request kind");
    const scopedKey = idempotencyKey === undefined ? undefined : `${input.tenantId}:${idempotencyKey}`;
    if (scopedKey !== undefined) {
      requiredText(idempotencyKey ?? "", "idempotencyKey");
      const fingerprint = JSON.stringify({ subjectId: input.subjectId, kind: input.kind });
      const cached = this.idempotency.get(scopedKey);
      if (cached !== undefined) {
        if (cached.fingerprint !== fingerprint) throw new DataRightsError("idempotency key was reused with different data-rights fields");
        return cached.request;
      }
      const request: DataSubjectRequestV1 = {
        ...input,
        requestId: `dsr-${randomUUID()}`,
        status: "received",
        createdAt: new Date().toISOString(),
      };
      this.requests.set(request.requestId, request);
      this.idempotency.set(scopedKey, { request, fingerprint });
      return request;
    }
    const request: DataSubjectRequestV1 = {
      ...input,
      requestId: `dsr-${randomUUID()}`,
      status: "received",
      createdAt: new Date().toISOString(),
    };
    this.requests.set(request.requestId, request);
    return request;
  }

  get(requestId: string): DataSubjectRequestV1 {
    return this.require(requestId);
  }

  list(tenantId: string): readonly DataSubjectRequestV1[] {
    requiredText(tenantId, "tenantId");
    return [...this.requests.values()].filter((request) => request.tenantId === tenantId);
  }

  start(requestId: string): DataSubjectRequestV1 {
    return this.transition(requestId, "processing");
  }

  complete(requestId: string, evidenceUri: string): DataSubjectRequestV1 {
    requiredText(evidenceUri, "evidenceUri");
    const current = this.require(requestId);
    if (current.status !== "processing") throw new DataRightsError(`request cannot complete from ${current.status}`);
    const updated: DataSubjectRequestV1 = { ...current, status: "completed", evidenceUri, completedAt: new Date().toISOString() };
    this.requests.set(requestId, updated);
    return updated;
  }

  reject(requestId: string, evidenceUri?: string): DataSubjectRequestV1 {
    const current = this.require(requestId);
    if (current.status !== "received" && current.status !== "processing") throw new DataRightsError(`request cannot reject from ${current.status}`);
    const updated: DataSubjectRequestV1 = {
      ...current,
      status: "rejected",
      ...(evidenceUri === undefined ? {} : { evidenceUri: requiredText(evidenceUri, "evidenceUri") }),
      completedAt: new Date().toISOString(),
    };
    this.requests.set(requestId, updated);
    return updated;
  }

  async process(requestId: string, executor: DataRightsExecutor): Promise<DataSubjectRequestV1> {
    const current = this.require(requestId);
    if (this.processing.has(requestId)) throw new DataRightsError("data subject request is already processing");
    if (current.status !== "received") throw new DataRightsError(`request cannot process from ${current.status}`);
    this.processing.add(requestId);
    try {
      const started = this.start(requestId);
      const context = { requestId: started.requestId, tenantId: started.tenantId, subjectId: started.subjectId };
      const evidenceUri = started.kind === "export"
        ? await executor.exportSubject(context)
        : started.kind === "delete"
          ? await executor.deleteSubject(context)
          : await executor.rectifySubject(context);
      return this.complete(requestId, evidenceUri);
    } catch (error) {
      this.reject(requestId);
      throw error;
    } finally {
      this.processing.delete(requestId);
    }
  }

  private transition(requestId: string, status: "processing"): DataSubjectRequestV1 {
    const current = this.require(requestId);
    if (current.status !== "received") throw new DataRightsError(`request cannot start from ${current.status}`);
    const updated = { ...current, status } satisfies DataSubjectRequestV1;
    this.requests.set(requestId, updated);
    return updated;
  }

  private require(requestId: string): DataSubjectRequestV1 {
    const request = this.requests.get(requiredText(requestId, "requestId"));
    if (request === undefined) throw new DataRightsError("data subject request not found");
    return request;
  }
}

export { PostgresDataRightsService } from "./postgres-service.js";
export type { DataRightsSqlConnection, DataRightsSqlPool, DataRightsSqlResult } from "./postgres-service.js";
