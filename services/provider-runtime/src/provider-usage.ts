import type { ProviderCostAttributionV1, ProviderUsageV1 } from "@yujian/platform-contracts";

export interface ProviderUnitPrices {
  inputTextUnitMicros: number;
  outputTextUnitMicros: number;
  inputAudioMillisecondMicros: number;
  outputAudioMillisecondMicros: number;
  imageUnitMicros: number;
}

function unit(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative safe integer`);
  return value;
}

export function normalizeProviderUsage(value: ProviderUsageV1): ProviderUsageV1 {
  return {
    inputTextUnits: unit(value.inputTextUnits, "inputTextUnits"),
    outputTextUnits: unit(value.outputTextUnits, "outputTextUnits"),
    inputAudioMs: unit(value.inputAudioMs, "inputAudioMs"),
    outputAudioMs: unit(value.outputAudioMs, "outputAudioMs"),
    imageUnits: unit(value.imageUnits, "imageUnits"),
  };
}

/** Deterministic deployment-owned price snapshot. It never calls a provider billing API. */
export class FixedProviderPricing {
  constructor(
    private readonly currency: ProviderCostAttributionV1["currency"],
    private readonly pricingVersion: string,
    private readonly prices: ProviderUnitPrices,
  ) {
    if (pricingVersion.length === 0 || pricingVersion.length > 128 || /[\u0000-\u001f\u007f]/u.test(pricingVersion)) throw new TypeError("provider pricing version is invalid");
    for (const [field, value] of Object.entries(prices)) unit(value, field);
  }

  attribute(raw: ProviderUsageV1): ProviderCostAttributionV1 {
    const usage = normalizeProviderUsage(raw);
    const amountMicros = usage.inputTextUnits * this.prices.inputTextUnitMicros +
      usage.outputTextUnits * this.prices.outputTextUnitMicros +
      usage.inputAudioMs * this.prices.inputAudioMillisecondMicros +
      usage.outputAudioMs * this.prices.outputAudioMillisecondMicros +
      usage.imageUnits * this.prices.imageUnitMicros;
    if (!Number.isSafeInteger(amountMicros)) throw new RangeError("provider cost attribution exceeds safe integer range");
    return { currency: this.currency, amountMicros, pricingVersion: this.pricingVersion };
  }
}
