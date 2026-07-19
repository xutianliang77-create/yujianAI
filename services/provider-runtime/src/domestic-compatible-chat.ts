import type { ProviderCapabilityV1 } from "@yujian/platform-contracts";
import type { ProviderCredentialProvider } from "./provider-credentials.js";
import { OpenAiCompatibleChatProvider } from "./openai-compatible-chat.js";

export interface DomesticCompatibleChatOptions {
  providerId: string;
  endpoint: string;
  regions: readonly string[];
  credentialProvider: ProviderCredentialProvider;
  timeoutMs?: number;
  maxResponseBytes?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Production binding for a China-region OpenAI-compatible LLM/VLM endpoint.
 * The deployment supplies the endpoint and short-lived credential exchanger;
 * prompts and credentials are never persisted by this adapter.
 */
export function createDomesticCompatibleChatProvider(options: DomesticCompatibleChatOptions): OpenAiCompatibleChatProvider {
  if (!/^[a-z][a-z0-9-]{2,63}$/u.test(options.providerId)) throw new TypeError("domestic provider id is invalid");
  if (options.regions.length === 0 || options.regions.length > 16 || options.regions.some((region) => !/^cn-[a-z0-9-]{2,32}$/u.test(region))) {
    throw new TypeError("domestic provider regions must be explicit cn-* regions");
  }
  const capability: ProviderCapabilityV1 = {
    providerId: options.providerId,
    capability: "llm",
    regions: [...new Set(options.regions)],
    supportsStreaming: false,
    status: "healthy",
  };
  return new OpenAiCompatibleChatProvider(capability, {
    endpoint: options.endpoint,
    credentialProvider: options.credentialProvider,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.maxResponseBytes === undefined ? {} : { maxResponseBytes: options.maxResponseBytes }),
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  });
}
