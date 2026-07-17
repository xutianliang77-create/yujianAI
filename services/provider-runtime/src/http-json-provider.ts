import type { ProviderCapabilityV1 } from "@yujian/platform-contracts";
import type { ProviderAdapter, ProviderRequest } from "./index.js";

export interface HttpJsonProviderOptions {
  endpoint: string;
  headers?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class ProviderHttpError extends Error {
  constructor(message: string, readonly statusCode?: number, readonly retryable = false) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

function deadlineSignal(deadlineAt: string, timeoutMs: number, parent: AbortSignal): AbortSignal {
  const deadline = Date.parse(deadlineAt);
  if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new ProviderHttpError("provider deadline is invalid or elapsed");
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

/** Provider-neutral JSON adapter; secrets stay in injected headers and never in the request model. */
export class HttpJsonProvider<TRequest extends Record<string, unknown>, TResult extends Record<string, unknown>>
  implements ProviderAdapter<TRequest, TResult> {
  readonly capability: ProviderCapabilityV1;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    capability: ProviderCapabilityV1,
    private readonly options: HttpJsonProviderOptions,
  ) {
    const endpoint = new URL(options.endpoint);
    if (endpoint.protocol !== "https:" && endpoint.hostname !== "127.0.0.1" && endpoint.hostname !== "localhost") {
      throw new TypeError("provider endpoint must use HTTPS outside loopback");
    }
    this.capability = capability;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 120_000) throw new RangeError("provider timeout must be 100-120000ms");
  }

  async invoke(request: TRequest, context: ProviderRequest, signal: AbortSignal): Promise<TResult> {
    if (context.idempotencyKey.length === 0 || context.idempotencyKey.length > 128) throw new ProviderHttpError("provider idempotency key is invalid");
    const response = await this.fetchImpl(this.options.endpoint, {
      method: "POST",
      body: JSON.stringify(request),
      signal: deadlineSignal(context.deadlineAt, this.timeoutMs, signal),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-yujian-trace-id": context.traceId,
        "idempotency-key": context.idempotencyKey,
        ...(this.options.headers ?? {}),
      },
    }).catch((error) => {
      if (error instanceof ProviderHttpError) throw error;
      throw new ProviderHttpError(error instanceof Error ? error.message : "provider request failed", undefined, true);
    });
    const body = await response.text();
    if (!response.ok) throw new ProviderHttpError(`provider returned HTTP ${response.status}`, response.status, response.status === 408 || response.status === 429 || response.status >= 500);
    if (body.length > 1_048_576) throw new ProviderHttpError("provider response is too large");
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { throw new ProviderHttpError("provider response is not JSON"); }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new ProviderHttpError("provider response must be a JSON object");
    return parsed as TResult;
  }
}

export class ProviderFailoverError extends Error {
  constructor(readonly errors: readonly unknown[]) {
    super("all provider adapters failed");
    this.name = "ProviderFailoverError";
  }
}

export async function invokeWithProviderFailover<TRequest extends Record<string, unknown>, TResult extends Record<string, unknown>>(
  adapters: readonly ProviderAdapter<TRequest, TResult>[],
  request: TRequest,
  context: ProviderRequest,
  signal: AbortSignal,
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
