import type { ProviderCapabilityV1, ProviderUsageV1 } from "@yujian/platform-contracts";
import type { ProviderAdapter, ProviderRequest } from "./index.js";
import { HttpJsonProvider, type HttpJsonProviderOptions, ProviderHttpError } from "./http-json-provider.js";

export interface CompatibleChatMessage { role: "system" | "user" | "assistant" | "tool"; content: string; }
export interface CompatibleChatRequest {
  model: string;
  messages: readonly CompatibleChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  stream?: false;
}
export interface CompatibleChatResult {
  id: string;
  model: string;
  text: string;
  finishReason?: string;
  usage: ProviderUsageV1;
  rawUsage?: Readonly<Record<string, number>>;
}

type WireResult = Record<string, unknown>;

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1_048_576 || /\u0000/u.test(value)) throw new ProviderHttpError("INVALID_RESPONSE");
  return value;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** Versioned mapping for OpenAI-compatible non-streaming chat endpoints used by multiple providers. */
export class OpenAiCompatibleChatProvider implements ProviderAdapter<CompatibleChatRequest, CompatibleChatResult> {
  readonly capability: ProviderCapabilityV1;
  private readonly http: HttpJsonProvider<Record<string, unknown>, WireResult>;

  constructor(capability: ProviderCapabilityV1, options: HttpJsonProviderOptions) {
    if (capability.capability !== "llm" && capability.capability !== "vlm") throw new TypeError("compatible chat provider requires llm or vlm capability");
    this.capability = capability;
    this.http = new HttpJsonProvider(capability, options);
  }

  async invoke(request: CompatibleChatRequest, context: ProviderRequest, signal: AbortSignal): Promise<CompatibleChatResult> {
    if (request.messages.length === 0 || request.messages.length > 256 || request.model.length === 0 || request.model.length > 256) throw new ProviderHttpError("INVALID_REQUEST");
    const body: Record<string, unknown> = { model: request.model, messages: request.messages, stream: false };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxOutputTokens !== undefined) body.max_tokens = request.maxOutputTokens;
    const result = await this.http.invoke(body, context, signal);
    const choices = result.choices;
    if (!Array.isArray(choices) || choices.length === 0 || typeof choices[0] !== "object" || choices[0] === null) throw new ProviderHttpError("INVALID_RESPONSE");
    const choice = choices[0] as Record<string, unknown>;
    const message = choice.message;
    if (typeof message !== "object" || message === null || Array.isArray(message)) throw new ProviderHttpError("INVALID_RESPONSE");
    const usage = typeof result.usage === "object" && result.usage !== null && !Array.isArray(result.usage) ? result.usage as Record<string, unknown> : {};
    const promptTokens = count(usage.prompt_tokens ?? usage.input_tokens);
    const completionTokens = count(usage.completion_tokens ?? usage.output_tokens);
    return {
      id: text(result.id, "id"),
      model: text(result.model ?? request.model, "model"),
      text: text((message as Record<string, unknown>).content, "content"),
      ...(typeof choice.finish_reason === "string" ? { finishReason: choice.finish_reason } : {}),
      usage: { inputTextUnits: promptTokens, outputTextUnits: completionTokens, inputAudioMs: 0, outputAudioMs: 0, imageUnits: 0 },
      rawUsage: { promptTokens, completionTokens },
    };
  }
}

export function extractCompatibleChatUsage(result: CompatibleChatResult): ProviderUsageV1 { return result.usage; }
