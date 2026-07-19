import type { DirectorySyncAdapter } from "./index.js";

export interface ScimMember {
  externalId: string;
  userName: string;
  active: boolean;
  displayName?: string;
  emails: readonly string[];
}

export interface ScimMemberSink {
  applyBatch(tenantId: string, members: readonly ScimMember[], sourceRevision: string): Promise<{ added: number; updated: number; removed: number }>;
}

export interface ScimDirectoryOptions {
  endpoint: string;
  credentialProvider: () => Promise<{ authorization: string; expiresAt: string }>;
  sink: ScimMemberSink;
  pageSize?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function endpoint(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new TypeError("SCIM endpoint must use HTTPS outside loopback");
  if (url.username !== "" || url.password !== "") throw new TypeError("SCIM endpoint must not contain credentials");
  return url;
}

function text(value: unknown, field: string, max = 256): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`SCIM ${field} is invalid`);
  return value;
}

function member(value: unknown): ScimMember {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("SCIM resource is invalid");
  const row = value as Record<string, unknown>;
  const rawEmails = Array.isArray(row.emails) ? row.emails : [];
  const emails = rawEmails.flatMap((item) => typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).value === "string" ? [(item as Record<string, unknown>).value as string] : []).slice(0, 16);
  return {
    externalId: text(row.externalId ?? row.id, "externalId"),
    userName: text(row.userName, "userName"),
    active: row.active !== false,
    ...(typeof row.displayName === "string" ? { displayName: text(row.displayName, "displayName") } : {}),
    emails: [...new Set(emails.map((email) => text(email, "email", 320)))],
  };
}

/** Incremental SCIM 2.0 reader. Cursor is an opaque startIndex/revision pair. */
export class ScimDirectorySyncAdapter implements DirectorySyncAdapter {
  private readonly endpoint: URL;
  private readonly pageSize: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ScimDirectoryOptions) {
    this.endpoint = endpoint(options.endpoint);
    this.pageSize = options.pageSize ?? 100;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isInteger(this.pageSize) || this.pageSize < 1 || this.pageSize > 1_000) throw new RangeError("SCIM page size is invalid");
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 120_000) throw new RangeError("SCIM timeout is invalid");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async syncMembers(tenantId: string, cursor?: string): Promise<{ added: number; updated: number; removed: number; nextCursor?: string }> {
    if (!/^[a-z][a-z0-9-]{2,127}$/u.test(tenantId)) throw new Error("SCIM tenant is invalid");
    const parsed = this.parseCursor(cursor);
    const credential = await this.options.credentialProvider();
    if (!Number.isFinite(Date.parse(credential.expiresAt)) || Date.parse(credential.expiresAt) <= Date.now() || !/^Bearer [^\s]+$/u.test(credential.authorization)) throw new Error("SCIM credential lease is invalid");
    const url = new URL("Users", this.endpoint.toString().replace(/\/?$/u, "/"));
    url.searchParams.set("startIndex", String(parsed.startIndex));
    url.searchParams.set("count", String(this.pageSize));
    const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.timeoutMs), headers: { accept: "application/scim+json", authorization: credential.authorization } });
    if (!response.ok) throw new Error(`SCIM endpoint returned HTTP ${response.status}`);
    const page = await response.json() as Record<string, unknown>;
    const resources = Array.isArray(page.Resources) ? page.Resources.map(member) : undefined;
    if (resources === undefined || !Number.isInteger(page.totalResults) || !Number.isInteger(page.startIndex) || !Number.isInteger(page.itemsPerPage)) throw new Error("SCIM page is invalid");
    if (page.startIndex !== parsed.startIndex || resources.length > this.pageSize) throw new Error("SCIM page boundaries are invalid");
    const revision = response.headers.get("etag") ?? response.headers.get("last-modified") ?? parsed.revision ?? "unversioned";
    const result = await this.options.sink.applyBatch(tenantId, resources, revision);
    const nextIndex = parsed.startIndex + resources.length;
    const done = nextIndex > (page.totalResults as number) || resources.length === 0;
    return { ...result, ...(done ? {} : { nextCursor: Buffer.from(JSON.stringify({ startIndex: nextIndex, revision }), "utf8").toString("base64url") }) };
  }

  private parseCursor(cursor?: string): { startIndex: number; revision?: string } {
    if (cursor === undefined) return { startIndex: 1 };
    let value: unknown;
    try { value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); } catch { throw new Error("SCIM cursor is invalid"); }
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("SCIM cursor is invalid");
    const row = value as Record<string, unknown>;
    if (!Number.isSafeInteger(row.startIndex) || (row.startIndex as number) < 1) throw new Error("SCIM cursor is invalid");
    return { startIndex: row.startIndex as number, ...(typeof row.revision === "string" ? { revision: text(row.revision, "revision", 512) } : {}) };
  }
}
