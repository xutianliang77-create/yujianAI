import type { ProviderInvocationObservation, ProviderInvocationObserver } from "./index.js";

export interface ProviderUsageSqlPool {
  query<Row extends object>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly Row[] }>;
}

function text(value: string, field: string): string {
  if (value.length === 0 || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) throw new TypeError(`${field} is invalid`);
  return value;
}

/** Append-only, content-free provider latency/usage/cost ledger. */
export class PostgresProviderInvocationObserver implements ProviderInvocationObserver {
  constructor(private readonly pool: ProviderUsageSqlPool) {}

  async observe(value: ProviderInvocationObservation): Promise<void> {
    const usage = value.usage;
    const cost = value.cost;
    await this.pool.query(
      `INSERT INTO agent_provider_invocations
       (tenant_id, environment_id, deployment_id, dispatch_id, provider_id, capability, outcome,
        duration_ms, trace_id, error_code, input_text_units, output_text_units, input_audio_ms,
        output_audio_ms, image_units, currency, amount_micros, pricing_version, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())`,
      [
        text(value.tenantId, "tenantId"), text(value.environmentId, "environmentId"),
        text(value.deploymentId, "deploymentId"), text(value.dispatchId, "dispatchId"),
        text(value.providerId, "providerId"), value.capability, value.outcome, value.durationMs,
        text(value.traceId, "traceId"), value.errorCode ?? null, usage?.inputTextUnits ?? 0,
        usage?.outputTextUnits ?? 0, usage?.inputAudioMs ?? 0, usage?.outputAudioMs ?? 0,
        usage?.imageUnits ?? 0, cost?.currency ?? null, cost?.amountMicros ?? null,
        cost?.pricingVersion ?? null,
      ],
    );
  }
}
