import type { ProviderCapabilityV1 } from "@yujian/platform-contracts";
import type { ProviderAdapter, ProviderRequest } from "./index.js";
import type { ProviderCredentialProvider } from "./provider-credentials.js";
import { resolveProviderHeaders, validateProviderEndpoint } from "./provider-credentials.js";

export type ProviderHttpErrorCode =
  | "CREDENTIAL_UNAVAILABLE"
  | "DEADLINE_EXCEEDED"
  | "HTTP_CLIENT_ERROR"
  | "HTTP_SERVER_ERROR"
  | "INVALID_REQUEST"
  | "INVALID_RESPONSE"
  | "NETWORK_ERROR"
  | "REQUEST_CANCELLED"
  | "RESPONSE_TOO_LARGE";

const ERROR_MESSAGES: Readonly<Record<ProviderHttpErrorCode, string>> = {
  CREDENTIAL_UNAVAILABLE: "provider credential is unavailable",
  DEADLINE_EXCEEDED: "provider deadline elapsed",
  HTTP_CLIENT_ERROR: "provider rejected the request",
  HTTP_SERVER_ERROR: "provider service failed",
  INVALID_REQUEST: "provider request is invalid",
  INVALID_RESPONSE: "provider response is invalid",
  NETWORK_ERROR: "provider network request failed",
  REQUEST_CANCELLED: "provider request was cancelled",
  RESPONSE_TOO_LARGE: "provider response is too large",
};

export interface HttpJsonProviderOptions {
  endpoint: string;
  /** Non-secret routing headers only. Authorization, API key and cookie headers are rejected. */
  headers?: Readonly<Record<string, string>>;
  credentialProvider?: ProviderCredentialProvider;
  timeoutMs?: number;
  maxResponseBytes?: number;
  fetchImpl?: typeof fetch;
}

export class ProviderHttpError extends Error {
  constructor(readonly code: ProviderHttpErrorCode, readonly statusCode?: number, readonly retryable = false) {
    super(ERROR_MESSAGES[code]);
    this.name = "ProviderHttpError";
  }
}

function deadlineSignal(deadlineAt: string, timeoutMs: number, parent: AbortSignal): AbortSignal {
  const deadline = Date.parse(deadlineAt);
  if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new ProviderHttpError("DEADLINE_EXCEEDED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("provider-timeout"), Math.min(timeoutMs, Math.max(1, deadline - Date.now())));
  const abort = () => controller.abort(parent.reason ?? "cancelled");
  if (parent.aborted) abort();
  else parent.addEventListener("abort", abort, { once: true });
  controller.signal.addEventListener("abort", () => {
    clearTimeout(timer);
    parent.removeEventListener("abort", abort);
  }, { once: true });
  return controller.signal;
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new ProviderHttpError("RESPONSE_TOO_LARGE");
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel("provider-response-too-large");
        throw new ProviderHttpError("RESPONSE_TOO_LARGE");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

/** Provider-neutral JSON adapter with per-invocation credential leases. */
export class HttpJsonProvider<TRequest extends Record<string, unknown>, TResult extends Record<string, unknown>>
  implements ProviderAdapter<TRequest, TResult> {
  readonly capability: ProviderCapabilityV1;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(capability: ProviderCapabilityV1, private readonly options: HttpJsonProviderOptions) {
    this.endpoint = validateProviderEndpoint(options.endpoint);
    this.capability = capability;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxResponseBytes = options.maxResponseBytes ?? 1_048_576;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 120_000) throw new RangeError("provider timeout must be 100-120000ms");
    if (!Number.isInteger(this.maxResponseBytes) || this.maxResponseBytes < 1_024 || this.maxResponseBytes > 8_388_608) throw new RangeError("provider response limit must be 1KiB-8MiB");
    resolveProviderHeaders(options.headers ?? {}, false);
  }

  async invoke(request: TRequest, context: ProviderRequest, signal: AbortSignal): Promise<TResult> {
    if (context.idempotencyKey.length === 0 || context.idempotencyKey.length > 128 || context.traceId.length === 0 || context.traceId.length > 256) {
      throw new ProviderHttpError("INVALID_REQUEST");
    }
    let credentialLease;
    try {
      credentialLease = await this.options.credentialProvider?.resolve({
        providerId: this.capability.providerId,
        capability: this.capability.capability,
        traceId: context.traceId,
        deadlineAt: context.deadlineAt,
      });
    } catch {
      throw new ProviderHttpError("CREDENTIAL_UNAVAILABLE", undefined, true);
    }
    if (credentialLease !== undefined && (!Number.isFinite(Date.parse(credentialLease.expiresAt)) || Date.parse(credentialLease.expiresAt) <= Date.now())) {
      throw new ProviderHttpError("CREDENTIAL_UNAVAILABLE", undefined, true);
    }
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        body: JSON.stringify(request),
        signal: deadlineSignal(context.deadlineAt, this.timeoutMs, signal),
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-yujian-trace-id": context.traceId,
          "idempotency-key": context.idempotencyKey,
          ...resolveProviderHeaders(this.options.headers ?? {}, false),
          ...resolveProviderHeaders(credentialLease?.headers ?? {}, true),
        },
      }).catch(() => {
        throw new ProviderHttpError(signal.aborted ? "REQUEST_CANCELLED" : "NETWORK_ERROR", undefined, !signal.aborted);
      });
      const body = await readBoundedBody(response, this.maxResponseBytes).catch((error) => {
        if (error instanceof ProviderHttpError) throw error;
        throw new ProviderHttpError("INVALID_RESPONSE");
      });
      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw new ProviderHttpError(response.status >= 500 ? "HTTP_SERVER_ERROR" : "HTTP_CLIENT_ERROR", response.status, retryable);
      }
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch { throw new ProviderHttpError("INVALID_RESPONSE"); }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new ProviderHttpError("INVALID_RESPONSE");
      return parsed as TResult;
    } finally {
      try { await credentialLease?.release?.(); } catch { /* Lease cleanup is isolated from request outcome. */ }
    }
  }
}

export class ProviderFailoverError extends Error {
  constructor(readonly errors: readonly unknown[]) {
    super("all provider adapters failed");
    this.name = "ProviderFailoverError";
  }
}

export async function invokeWithProviderFailover<TRequest extends Record<string, unknown>, TResult extends Record<string, unknown>>(
  adapters: readonly ProviderAdapter<TRequest, TResult>[], request: TRequest, context: ProviderRequest, signal: AbortSignal,
): Promise<TResult> {
  if (adapters.length === 0) throw new ProviderFailoverError([]);
  const errors: unknown[] = [];
  for (const adapter of adapters) {
    try { return await adapter.invoke(request, context, signal); }
    catch (error) {
      errors.push(error);
      if (signal.aborted) throw error;
      if (error instanceof ProviderHttpError && !error.retryable) throw error;
    }
  }
  throw new ProviderFailoverError(errors);
}
