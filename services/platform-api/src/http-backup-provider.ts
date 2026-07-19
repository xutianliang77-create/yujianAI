import type {
  BackupArtifactResult,
  ControlPlaneBackupProvider,
  RestoreDrillResult,
} from "./postgres-backup-coordinator.js";

export interface HttpBackupProviderOptions {
  endpoint: string;
  authorization: () => string | Promise<string>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function endpoint(value: string): URL {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "") throw new Error("backup provider endpoint must be credential-free HTTPS");
  return parsed;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("backup provider returned an invalid response");
  return value as Record<string, unknown>;
}

export class HttpControlPlaneBackupProvider implements ControlPlaneBackupProvider {
  readonly name = "http-backup-provider";
  private readonly base: URL;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpBackupProviderOptions) {
    this.base = endpoint(options.endpoint);
    this.timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1_000 || this.timeoutMs > 300_000) throw new Error("backup provider timeout must be 1000-300000 ms");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createBackup(input: { backupRunId: string; encryptionKeyRef: string }): Promise<BackupArtifactResult> {
    const payload = await this.request("v1/backups", input.backupRunId, {
      backupRunId: input.backupRunId,
      encryptionKeyRef: input.encryptionKeyRef,
    });
    if (typeof payload.snapshotAt !== "string" || typeof payload.artifactUri !== "string" || typeof payload.artifactSha256 !== "string") throw new Error("backup provider response is missing artifact metadata");
    return { snapshotAt: payload.snapshotAt, artifactUri: payload.artifactUri, artifactSha256: payload.artifactSha256 };
  }

  async restoreIsolated(input: { restoreDrillId: string; backup: { backupRunId: string } }): Promise<RestoreDrillResult> {
    const payload = await this.request("v1/restore-drills", input.restoreDrillId, {
      restoreDrillId: input.restoreDrillId,
      backupRunId: input.backup.backupRunId,
      isolated: true,
      productionOverwrite: false,
    });
    return { verification: record(payload.verification) as Readonly<Record<string, boolean | number | string>> };
  }

  private async request(path: string, idempotencyKey: string, body: object): Promise<Record<string, unknown>> {
    const authorization = await this.options.authorization();
    if (!/^Bearer [\x21-\x7e]{16,4096}$/u.test(authorization)) throw new Error("backup provider authorization is invalid");
    const response = await this.fetchImpl(new URL(path, this.base), {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`backup provider request failed with HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) throw new Error("backup provider returned a non-JSON response");
    const serialized = await response.text();
    if (Buffer.byteLength(serialized, "utf8") > 65_536) throw new Error("backup provider response exceeds 64 KiB");
    return record(JSON.parse(serialized));
  }
}
