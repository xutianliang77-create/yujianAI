export function normalizeLiveKitWsUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new TypeError("LIVEKIT_URL must be a valid absolute URL");
  }

  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new TypeError("LIVEKIT_URL must use ws or wss");
  }
  if (url.username || url.password) {
    throw new TypeError("LIVEKIT_URL must not contain credentials");
  }
  if (url.search || url.hash) {
    throw new TypeError("LIVEKIT_URL must not contain query or fragment data");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new TypeError("LIVEKIT_URL must not contain a path");
  }

  return url.toString().replace(/\/$/u, "");
}

export function toLiveKitHttpUrl(wsUrl: string): string {
  const normalized = normalizeLiveKitWsUrl(wsUrl);
  return normalized.replace(/^ws:/u, "http:").replace(/^wss:/u, "https:");
}
