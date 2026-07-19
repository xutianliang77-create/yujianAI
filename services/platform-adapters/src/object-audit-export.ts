import type { LogExportAdapter, ObjectStorageAdapter } from "./index.js";

export interface AuditExportRecord {
  id: string;
  occurredAt: string;
  action: string;
  outcome: "allowed" | "denied" | "failed" | "succeeded";
  subjectHash?: string;
  resourceType?: string;
  resourceIdHash?: string;
}

export interface AuditExportSource {
  stream(scope: { tenantId: string; projectId?: string; environmentId?: string }): AsyncIterable<AuditExportRecord>;
}

function scopePart(value: string, field: string): string {
  if (!/^[a-z][a-z0-9-]{2,127}$/u.test(value)) throw new Error(`audit export ${field} is invalid`);
  return value;
}

function recordLine(record: AuditExportRecord): Uint8Array {
  if (!/^[a-z][a-z0-9-]{2,127}$/u.test(record.id) || !Number.isFinite(Date.parse(record.occurredAt))) throw new Error("audit export record identity is invalid");
  if (record.action.length === 0 || record.action.length > 128 || /[\u0000-\u001f\u007f]/u.test(record.action)) throw new Error("audit export action is invalid");
  for (const digest of [record.subjectHash, record.resourceIdHash]) if (digest !== undefined && !/^sha256:[0-9a-f]{64}$/u.test(digest)) throw new Error("audit export digest is invalid");
  return Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
}

/** Streams a low-cardinality, secret-free JSONL audit export into customer storage. */
export class ObjectStorageAuditExportAdapter implements LogExportAdapter {
  constructor(private readonly source: AuditExportSource, private readonly storage: ObjectStorageAdapter, private readonly now: () => Date = () => new Date()) {}

  async exportBundle(scope: { tenantId: string; projectId?: string; environmentId?: string }, expiresInSeconds: number): Promise<{ uri: string; expiresAt: string }> {
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 86_400) throw new RangeError("audit export expiry is invalid");
    const tenantId = scopePart(scope.tenantId, "tenantId");
    if (scope.projectId !== undefined) scopePart(scope.projectId, "projectId");
    if (scope.environmentId !== undefined) scopePart(scope.environmentId, "environmentId");
    const generatedAt = this.now();
    const key = `audit/${tenantId}/${generatedAt.toISOString().replace(/[:.]/gu, "-")}.jsonl`;
    const body = this.lines(scope);
    await this.storage.put(key, body, "application/x-ndjson");
    return {
      uri: await this.storage.signedReadUrl(key, expiresInSeconds),
      expiresAt: new Date(generatedAt.getTime() + expiresInSeconds * 1_000).toISOString(),
    };
  }

  private async *lines(scope: { tenantId: string; projectId?: string; environmentId?: string }): AsyncIterable<Uint8Array> {
    let count = 0;
    for await (const record of this.source.stream(scope)) {
      count += 1;
      if (count > 1_000_000) throw new Error("audit export exceeds record limit");
      yield recordLine(record);
    }
  }
}
