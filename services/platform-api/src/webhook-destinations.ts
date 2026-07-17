import type { PlatformScopeV1 } from "@yujian/platform-contracts";

export interface WebhookDestinationRecord {
  destinationId: string;
  tenantId: string;
  projectId: string;
  environmentId: string;
  url: string;
  secretRef: string;
  eventTypes: readonly string[];
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDestinationPersistence {
  list(scope: PlatformScopeV1): Promise<readonly WebhookDestinationRecord[]>;
  get(destinationId: string, scope: PlatformScopeV1): Promise<WebhookDestinationRecord | undefined>;
  upsert(input: Omit<WebhookDestinationRecord, "createdAt" | "updatedAt">): Promise<WebhookDestinationRecord>;
  disable(destinationId: string, scope: PlatformScopeV1): Promise<void>;
}

export interface WebhookDestinationSqlResult<Row extends object> { rows: readonly Row[]; }
export interface WebhookDestinationSqlPool {
  query<Row extends object>(text: string, values?: readonly unknown[]): Promise<WebhookDestinationSqlResult<Row>>;
}

type DestinationRow = Record<string, unknown>;

function text(row: DestinationRow, field: string, max = 512): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0 || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`invalid webhook destination ${field}`);
  return value;
}

function destinationFrom(row: DestinationRow): WebhookDestinationRecord {
  const rawTypes = row.event_types;
  const eventTypes = Array.isArray(rawTypes) ? rawTypes.filter((value): value is string => typeof value === "string" && value.length > 0 && value.length <= 128) : typeof rawTypes === "string" ? JSON.parse(rawTypes) as unknown : [];
  if (!Array.isArray(eventTypes) || eventTypes.length === 0 || eventTypes.some((value) => typeof value !== "string" || value.length === 0 || value.length > 128)) throw new Error("invalid webhook destination event types");
  const url = text(row, "url", 2048);
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") throw new Error("webhook destination must use HTTPS outside loopback");
  if (parsed.username !== "" || parsed.password !== "") throw new Error("webhook destination must not contain credentials");
  const status = row.status === "disabled" ? "disabled" : row.status === "active" ? "active" : undefined;
  if (status === undefined) throw new Error("invalid webhook destination status");
  return {
    destinationId: text(row, "destination_id", 128),
    tenantId: text(row, "tenant_id", 128),
    projectId: text(row, "project_id", 128),
    environmentId: text(row, "environment_id", 128),
    url,
    secretRef: text(row, "secret_ref", 512),
    eventTypes,
    status,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function validateInput(input: Omit<WebhookDestinationRecord, "createdAt" | "updatedAt">): void {
  if (input.destinationId.length === 0 || input.destinationId.length > 128 || /[\u0000-\u001f\u007f]/u.test(input.destinationId)) throw new TypeError("webhook destination id is invalid");
  if (input.secretRef.length === 0 || input.secretRef.length > 512 || /[\u0000-\u001f\u007f]/u.test(input.secretRef)) throw new TypeError("webhook secret reference is invalid");
  const url = new URL(input.url);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new TypeError("webhook destination must use HTTPS outside loopback");
  if (url.username !== "" || url.password !== "") throw new TypeError("webhook destination must not contain credentials");
  if (input.eventTypes.length === 0 || input.eventTypes.length > 64 || input.eventTypes.some((value) => value.length === 0 || value.length > 128 || /[\u0000-\u001f\u007f]/u.test(value))) throw new TypeError("webhook event types are invalid");
  if (input.status !== "active" && input.status !== "disabled") throw new TypeError("webhook destination status is invalid");
}

/** SQL boundary for webhook endpoints; secret material is resolved by KMS, never read here. */
export class PostgresWebhookDestinationPersistence implements WebhookDestinationPersistence {
  constructor(private readonly pool: WebhookDestinationSqlPool) {}

  async list(scope: PlatformScopeV1): Promise<readonly WebhookDestinationRecord[]> {
    const result = await this.pool.query<DestinationRow>(
      `SELECT * FROM webhook_destinations
       WHERE tenant_id = $1 AND project_id = $2 AND environment_id = $3
       ORDER BY destination_id`,
      [scope.tenantId, scope.projectId, scope.environmentId],
    );
    return result.rows.map(destinationFrom);
  }

  async get(destinationId: string, scope: PlatformScopeV1): Promise<WebhookDestinationRecord | undefined> {
    const result = await this.pool.query<DestinationRow>(
      `SELECT * FROM webhook_destinations
       WHERE destination_id = $1 AND tenant_id = $2 AND project_id = $3 AND environment_id = $4`,
      [destinationId, scope.tenantId, scope.projectId, scope.environmentId],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : destinationFrom(row);
  }

  async upsert(input: Omit<WebhookDestinationRecord, "createdAt" | "updatedAt">): Promise<WebhookDestinationRecord> {
    validateInput(input);
    const result = await this.pool.query<DestinationRow>(
      `INSERT INTO webhook_destinations (destination_id, tenant_id, project_id, environment_id, url, secret_ref, event_types, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,now(),now())
       ON CONFLICT (destination_id) DO UPDATE SET url = EXCLUDED.url, secret_ref = EXCLUDED.secret_ref,
         event_types = EXCLUDED.event_types, status = EXCLUDED.status, updated_at = now()
       RETURNING *`,
      [input.destinationId, input.tenantId, input.projectId, input.environmentId, input.url, input.secretRef, JSON.stringify(input.eventTypes), input.status],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("webhook destination upsert returned no row");
    return destinationFrom(row);
  }

  async disable(destinationId: string, scope: PlatformScopeV1): Promise<void> {
    await this.pool.query(
      `UPDATE webhook_destinations SET status = 'disabled', updated_at = now()
       WHERE destination_id = $1 AND tenant_id = $2 AND project_id = $3 AND environment_id = $4`,
      [destinationId, scope.tenantId, scope.projectId, scope.environmentId],
    );
  }
}
