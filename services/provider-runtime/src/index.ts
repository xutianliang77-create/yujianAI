import type { ProviderCapabilityV1, ProviderCostAttributionV1, ProviderUsageV1 } from "@yujian/platform-contracts";
import { ProviderFailoverError, ProviderHttpError } from "./http-json-provider.js";

export interface ProviderRequest {
  tenantId: string;
  environmentId: string;
  deploymentId: string;
  dispatchId: string;
  traceId: string;
  deadlineAt: string;
  idempotencyKey: string;
}

export interface ProviderAdapter<TRequest, TResult> {
  readonly capability: ProviderCapabilityV1;
  invoke(request: TRequest, context: ProviderRequest, signal: AbortSignal): Promise<TResult>;
}

export interface ProviderInvocationObservation {
  tenantId: string;
  environmentId: string;
  deploymentId: string;
  dispatchId: string;
  providerId: string;
  capability: ProviderCapabilityV1["capability"];
  outcome: "success" | "failure" | "cancelled";
  durationMs: number;
  traceId: string;
  errorCode?: string;
  usage?: ProviderUsageV1;
  cost?: ProviderCostAttributionV1;
}

export interface ProviderInvocationObserver {
  observe(observation: ProviderInvocationObservation): void | Promise<void>;
}

export interface ProviderObservationOptions<TResult> {
  extractUsage?: (result: TResult) => ProviderUsageV1 | undefined;
  attributeCost?: (usage: ProviderUsageV1) => ProviderCostAttributionV1;
}

/** Adds low-cardinality provider telemetry without exposing request bodies or credentials. */
export class ObservedProviderAdapter<TRequest, TResult> implements ProviderAdapter<TRequest, TResult> {
  readonly capability: ProviderCapabilityV1;

  constructor(
    private readonly adapter: ProviderAdapter<TRequest, TResult>,
    private readonly observer: ProviderInvocationObserver,
    private readonly options: ProviderObservationOptions<TResult> = {},
  ) {
    this.capability = adapter.capability;
  }

  async invoke(request: TRequest, context: ProviderRequest, signal: AbortSignal): Promise<TResult> {
    const startedAt = Date.now();
    try {
      const result = await this.adapter.invoke(request, context, signal);
      const usage = this.options.extractUsage?.(result);
      const cost = usage === undefined ? undefined : this.options.attributeCost?.(usage);
      this.observe({ tenantId: context.tenantId, environmentId: context.environmentId, deploymentId: context.deploymentId, dispatchId: context.dispatchId, providerId: this.capability.providerId, capability: this.capability.capability, outcome: "success", durationMs: Date.now() - startedAt, traceId: context.traceId, ...(usage === undefined ? {} : { usage }), ...(cost === undefined ? {} : { cost }) });
      return result;
    } catch (error) {
      const errorCode = error instanceof ProviderHttpError ? error.code : "INTERNAL";
      this.observe({ tenantId: context.tenantId, environmentId: context.environmentId, deploymentId: context.deploymentId, dispatchId: context.dispatchId, providerId: this.capability.providerId, capability: this.capability.capability, outcome: signal.aborted ? "cancelled" : "failure", durationMs: Date.now() - startedAt, traceId: context.traceId, errorCode });
      throw error;
    }
  }

  private observe(observation: ProviderInvocationObservation): void {
    try {
      const result = this.observer.observe(observation);
      if (result !== undefined) void Promise.resolve(result).catch(() => undefined);
    } catch {
      // Observability must not change provider outcome.
    }
  }
}

export class ProviderCircuitBreaker {
  private failures = 0;
  private openUntil = 0;

  constructor(private readonly failureThreshold = 3, private readonly cooldownMs = 30_000) {}

  canRequest(now = Date.now()): boolean { return now >= this.openUntil; }

  success(): void { this.failures = 0; this.openUntil = 0; }

  failure(now = Date.now()): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.openUntil = now + this.cooldownMs;
  }

  async execute<T>(operation: () => Promise<T>, countFailure: (error: unknown) => boolean = () => true): Promise<T> {
    if (!this.canRequest()) throw new Error("provider circuit is open");
    try {
      const result = await operation();
      this.success();
      return result;
    } catch (error) {
      if (countFailure(error)) this.failure();
      throw error;
    }
  }
}

export interface ProviderSelectionOptions {
  region?: string;
  streaming?: boolean;
}

/** Capability/region registry with one circuit breaker per provider binding. */
export class ProviderRegistry<TRequest, TResult> {
  private readonly entries: readonly { adapter: ProviderAdapter<TRequest, TResult>; breaker: ProviderCircuitBreaker }[];

  constructor(
    adapters: readonly ProviderAdapter<TRequest, TResult>[],
    breakerFactory: () => ProviderCircuitBreaker = () => new ProviderCircuitBreaker(),
  ) {
    if (adapters.length === 0 || adapters.length > 64) throw new TypeError("provider registry must contain 1-64 adapters");
    const keys = new Set<string>();
    for (const adapter of adapters) {
      const capability = adapter.capability;
      if (capability.providerId.length === 0 || capability.providerId.length > 128 || /[\u0000-\u001f\u007f]/u.test(capability.providerId)) throw new TypeError("provider id is invalid");
      if (capability.regions.length === 0 || capability.regions.length > 64 || capability.regions.some((region) => region.length === 0 || region.length > 64 || /[\u0000-\u001f\u007f]/u.test(region))) throw new TypeError("provider regions are invalid");
      const key = `${capability.providerId}\u0000${capability.capability}`;
      if (keys.has(key)) throw new TypeError(`duplicate provider capability: ${capability.providerId}/${capability.capability}`);
      keys.add(key);
    }
    this.entries = adapters.map((adapter) => ({ adapter, breaker: breakerFactory() }));
  }

  list(capability?: ProviderCapabilityV1["capability"]): readonly ProviderCapabilityV1[] {
    return this.entries
      .map(({ adapter }) => adapter.capability)
      .filter((item) => capability === undefined || item.capability === capability);
  }

  async invoke(
    capability: ProviderCapabilityV1["capability"],
    request: TRequest,
    context: ProviderRequest,
    signal: AbortSignal,
    options: ProviderSelectionOptions = {},
  ): Promise<TResult> {
    const candidates = this.entries.filter(({ adapter, breaker }) => {
      const item = adapter.capability;
      return item.capability === capability && item.status !== "disabled" && breaker.canRequest() &&
        (options.region === undefined || item.regions.includes(options.region)) &&
        (options.streaming !== true || item.supportsStreaming);
    });
    if (candidates.length === 0) throw new ProviderFailoverError([]);
    const errors: unknown[] = [];
    for (const { adapter, breaker } of candidates) {
      try {
        return await breaker.execute(
          () => adapter.invoke(request, context, signal),
          (error) => !(error instanceof ProviderHttpError && !error.retryable),
        );
      } catch (error) {
        errors.push(error);
        if (signal.aborted) throw error;
        if (error instanceof ProviderHttpError && !error.retryable) throw error;
      }
    }
    throw new ProviderFailoverError(errors);
  }
}

export async function withProviderDeadline<T>(
  deadlineAt: string,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const deadline = Date.parse(deadlineAt);
  if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error("provider deadline is invalid or elapsed");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("deadline"), deadline - Date.now());
  try { return await operation(controller.signal); } finally { clearTimeout(timeout); }
}

export {
  HttpJsonProvider,
  ProviderFailoverError,
  ProviderHttpError,
  invokeWithProviderFailover,
} from "./http-json-provider.js";
export type { HttpJsonProviderOptions, ProviderHttpErrorCode } from "./http-json-provider.js";
export { FixedProviderPricing, normalizeProviderUsage } from "./provider-usage.js";
export type { ProviderUnitPrices } from "./provider-usage.js";
export { resolveProviderHeaders, validateProviderEndpoint } from "./provider-credentials.js";
export type { ProviderCredentialLease, ProviderCredentialProvider, ProviderCredentialRequest } from "./provider-credentials.js";
export { PostgresProviderInvocationObserver } from "./postgres-observer.js";
export type { ProviderUsageSqlPool } from "./postgres-observer.js";
export { FileWorkloadIdentityTokenProvider, HttpsProviderCredentialProvider } from "./workload-identity-credentials.js";
export type { HttpsProviderCredentialProviderOptions, WorkloadIdentityTokenProvider } from "./workload-identity-credentials.js";
export { CompositeProviderInvocationObserver, ProviderMetricsObserver } from "./metrics-observer.js";
export type { ProviderMetricsSink } from "./metrics-observer.js";
export { extractCompatibleChatUsage, OpenAiCompatibleChatProvider } from "./openai-compatible-chat.js";
export type { CompatibleChatMessage, CompatibleChatRequest, CompatibleChatResult } from "./openai-compatible-chat.js";
export { createDomesticCompatibleChatProvider } from "./domestic-compatible-chat.js";
export type { DomesticCompatibleChatOptions } from "./domestic-compatible-chat.js";
