import { createHash } from "node:crypto";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { DataRightsExecutionContext, DataRightsExecutor } from "./index.js";
import type { DataRightsSqlConnection, DataRightsSqlPool } from "./postgres-service.js";

type SubjectRecord = { record_id: string; system_name: string; record_locator: string };

function safeId(value: string, field: string): string {
  if (!/^[A-Za-z0-9._:-]{1,256}$/u.test(value)) throw new Error(`${field} is invalid`);
  return value;
}

function requiredText(value: string, field: string): string {
  if (value.length === 0 || value.length > 256 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${field} is invalid`);
  return value;
}

function digest(values: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify([...values].sort())).digest("hex");
}

/** Executes registry-backed export/deletion and writes protected, content-addressed evidence artifacts. */
export class PostgresDataRightsExecutor implements DataRightsExecutor {
  private readonly evidenceRoot: string;

  constructor(private readonly pool: DataRightsSqlPool, evidenceRoot: string) {
    if (evidenceRoot.length === 0) throw new TypeError("data-rights evidence root is required");
    this.evidenceRoot = resolve(evidenceRoot);
  }

  async exportSubject(context: DataRightsExecutionContext): Promise<string> {
    const records = await this.subjectRecords(this.pool, context);
    return this.writeEvidence(context, {
      action: "export",
      recordCount: records.length,
      records: records.map((record) => ({ recordId: record.record_id, system: record.system_name, locator: record.record_locator })),
      inventoryDigest: digest(records.map((record) => `${record.system_name}\u0000${record.record_locator}`)),
    });
  }

  async deleteSubject(context: DataRightsExecutionContext): Promise<string> {
    if (this.pool.connect === undefined) throw new Error("data-rights deletion requires a transactional SQL pool");
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      const records = await this.subjectRecords(connection, context, true);
      const deletion = {
        action: "delete",
        deletedRecordCount: records.length,
        systems: [...new Set(records.map((record) => record.system_name))].sort(),
        deletedInventoryDigest: digest(records.map((record) => `${record.system_name}\u0000${record.record_locator}`)),
      };
      const preparedAt = new Date().toISOString();
      await this.writeEvidence(context, { ...deletion, transactionStatus: "prepared", preparedAt, completedAt: null });
      await connection.query(
        "DELETE FROM data_subject_records WHERE tenant_id = $1 AND subject_id = $2",
        [context.tenantId, context.subjectId],
      );
      await connection.query("COMMIT");
      return await this.writeEvidence(context, { ...deletion, transactionStatus: "committed", preparedAt });
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      await connection.release();
    }
  }

  async rectifySubject(context: DataRightsExecutionContext): Promise<string> {
    const records = await this.subjectRecords(this.pool, context);
    return this.writeEvidence(context, {
      action: "rectify",
      affectedRecordCount: records.length,
      inventoryDigest: digest(records.map((record) => `${record.system_name}\u0000${record.record_locator}`)),
    });
  }

  private async subjectRecords(pool: DataRightsSqlPool, context: DataRightsExecutionContext, lock = false): Promise<SubjectRecord[]> {
    const result = await pool.query<SubjectRecord>(
      `SELECT record_id, system_name, record_locator FROM data_subject_records
       WHERE tenant_id = $1 AND subject_id = $2 ORDER BY record_id${lock ? " FOR UPDATE" : ""}`,
      [safeId(context.tenantId, "tenantId"), requiredText(context.subjectId, "subjectId")],
    );
    return [...result.rows];
  }

  private async writeEvidence(context: DataRightsExecutionContext, result: Record<string, unknown>): Promise<string> {
    const requestId = safeId(context.requestId, "requestId");
    await mkdir(this.evidenceRoot, { recursive: true, mode: 0o700 });
    await chmod(this.evidenceRoot, 0o700);
    const target = join(this.evidenceRoot, `${requestId}.json`);
    const temporary = `${target}.tmp`;
    const evidence = {
      schemaVersion: "yujian.data-rights-evidence/v1",
      requestId,
      tenantId: context.tenantId,
      subjectDigest: createHash("sha256").update(context.subjectId).digest("hex"),
      completedAt: new Date().toISOString(),
      ...result,
    };
    await writeFile(temporary, `${JSON.stringify(evidence)}\n`, { mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, target);
    return pathToFileURL(target).href;
  }
}

export interface DataRightsWorkerOptions {
  pollIntervalMs?: number;
  batchSize?: number;
  onError?: (error: unknown) => void;
}

export class PostgresDataRightsWorker {
  private running = false;
  private loopPromise: Promise<void> | undefined;
  private wake: (() => void) | undefined;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly onError: (error: unknown) => void;

  constructor(
    private readonly pool: DataRightsSqlPool,
    private readonly service: { process(requestId: string, executor: DataRightsExecutor): Promise<unknown> },
    private readonly executor: DataRightsExecutor,
    options: DataRightsWorkerOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.batchSize = options.batchSize ?? 10;
    this.onError = options.onError ?? (() => undefined);
    if (!Number.isInteger(this.pollIntervalMs) || this.pollIntervalMs < 100 || this.pollIntervalMs > 60_000) throw new RangeError("data-rights poll interval is invalid");
    if (!Number.isInteger(this.batchSize) || this.batchSize < 1 || this.batchSize > 100) throw new RangeError("data-rights batch size is invalid");
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.wake?.();
    await this.loopPromise;
    this.loopPromise = undefined;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      const result = await this.pool.query<{ request_id: string }>(
        "SELECT request_id FROM data_subject_requests WHERE status = 'received' ORDER BY created_at, request_id LIMIT $1",
        [this.batchSize],
      ).catch((error) => { this.onError(error); return { rows: [] }; });
      for (const row of result.rows) {
        if (!this.running) break;
        await this.service.process(row.request_id, this.executor).catch(this.onError);
      }
      if (this.running) await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, result.rows.length === 0 ? this.pollIntervalMs : 100);
        this.wake = () => { clearTimeout(timer); resolve(); };
      });
    }
  }
}
