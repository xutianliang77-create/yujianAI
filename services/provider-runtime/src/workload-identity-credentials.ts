import { readFile, stat } from "node:fs/promises";
import type { ProviderCredentialLease, ProviderCredentialProvider, ProviderCredentialRequest } from "./provider-credentials.js";
import { resolveProviderHeaders, validateProviderEndpoint } from "./provider-credentials.js";

export interface WorkloadIdentityTokenProvider { read(): Promise<string>; }

export class FileWorkloadIdentityTokenProvider implements WorkloadIdentityTokenProvider {
  constructor(private readonly path: string) {
    if (!path.startsWith("/") || path.length > 1_024 || /[\u0000-\u001f\u007f]/u.test(path)) throw new TypeError("workload identity token path is invalid");
  }

  async read(): Promise<string> {
    const metadata = await stat(this.path);
    if (!metadata.isFile() || metadata.size < 16 || metadata.size > 65_536 || (metadata.mode & 0o077) !== 0) throw new Error("workload identity token file is unsafe");
    const value = (await readFile(this.path, "utf8")).trim();
    if (value.length < 16 || value.length > 65_536 || /[\r\n\u0000]/u.test(value)) throw new Error("workload identity token is invalid");
    return value;
  }
}

export interface HttpsProviderCredentialProviderOptions {
  endpoint: string;
  bindingId: string;
  tokenProvider: WorkloadIdentityTokenProvider;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function binding(value: string): string {
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(value)) throw new TypeError("provider credential binding id is invalid");
  return value;
}

/** Exchanges a projected workload token for short-lived provider headers. */
export class HttpsProviderCredentialProvider implements ProviderCredentialProvider {
  private readonly endpoint: string;
  private readonly bindingId: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpsProviderCredentialProviderOptions) {
    this.endpoint = validateProviderEndpoint(options.endpoint);
    this.bindingId = binding(options.bindingId);
    this.timeoutMs = options.timeoutMs ?? 5_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 30_000) throw new RangeError("provider credential timeout is invalid");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async resolve(request: ProviderCredentialRequest): Promise<ProviderCredentialLease> {
    const token = await this.options.tokenProvider.read();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("provider-credential-timeout"), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { accept: "application/json", authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          contractVersion: "yujian.provider-credential.v1",
          bindingId: this.bindingId,
          providerId: request.providerId,
          capability: request.capability,
          traceId: request.traceId,
          deadlineAt: request.deadlineAt,
        }),
      });
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > 32_768) throw new Error("provider credential response is too large");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!response.ok || bytes.byteLength > 32_768) throw new Error("provider credential exchange failed");
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { throw new Error("provider credential response is invalid"); }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("provider credential response is invalid");
      const data = parsed as Record<string, unknown>;
      if (data.bindingId !== this.bindingId || data.providerId !== request.providerId || data.capability !== request.capability ||
        typeof data.expiresAt !== "string" || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now() ||
        typeof data.headers !== "object" || data.headers === null || Array.isArray(data.headers)) throw new Error("provider credential response binding is invalid");
      return { headers: resolveProviderHeaders(data.headers as Record<string, string>, true), expiresAt: data.expiresAt };
    } finally {
      clearTimeout(timer);
    }
  }
}
