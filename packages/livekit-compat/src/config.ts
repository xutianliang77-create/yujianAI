import { normalizeLiveKitWsUrl } from "./endpoints.js";

export interface LiveKitConnectionConfig {
  wsUrl: string;
  apiKey: string;
  apiSecret: string;
}

export function validateLiveKitConnectionConfig(
  input: LiveKitConnectionConfig,
): LiveKitConnectionConfig {
  const wsUrl = normalizeLiveKitWsUrl(input.wsUrl);
  const apiKey = input.apiKey.trim();
  if (apiKey.length === 0) {
    throw new TypeError("LIVEKIT_API_KEY must not be empty");
  }
  if (input.apiSecret.length === 0) {
    throw new TypeError("LIVEKIT_API_SECRET must not be empty");
  }
  if (CONTROL_CHARACTERS.test(apiKey) || CONTROL_CHARACTERS.test(input.apiSecret)) {
    throw new TypeError("LiveKit credentials must not contain control characters");
  }

  return {
    wsUrl,
    apiKey,
    apiSecret: input.apiSecret,
  };
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
