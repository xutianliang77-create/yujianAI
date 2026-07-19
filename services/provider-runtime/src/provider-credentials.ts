import type { ProviderCapabilityV1 } from "@yujian/platform-contracts";

export interface ProviderCredentialRequest {
  providerId: string;
  capability: ProviderCapabilityV1["capability"];
  traceId: string;
  deadlineAt: string;
}

export interface ProviderCredentialLease {
  /** Short-lived secret headers. The runtime never persists or observes their values. */
  headers: Readonly<Record<string, string>>;
  expiresAt: string;
  release?: () => void | Promise<void>;
}

export interface ProviderCredentialProvider {
  resolve(request: ProviderCredentialRequest): Promise<ProviderCredentialLease>;
}

const HEADER_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const RESERVED_HEADERS = new Set(["accept", "content-length", "content-type", "host", "idempotency-key", "x-yujian-trace-id"]);
const SECRET_HEADER = /(?:authorization|api[-_]?key|token|secret|cookie)/iu;

export function resolveProviderHeaders(values: Readonly<Record<string, string>>, allowSecrets: boolean): Record<string, string> {
  const result: Record<string, string> = {};
  const entries = Object.entries(values);
  if (entries.length > 32) throw new TypeError("provider headers exceed limit");
  for (const [rawName, value] of entries) {
    const name = rawName.toLowerCase();
    if (!HEADER_NAME.test(name) || RESERVED_HEADERS.has(name)) throw new TypeError("provider header name is not allowed");
    if (!allowSecrets && SECRET_HEADER.test(name)) throw new TypeError("provider secret headers require a credential provider");
    if (typeof value !== "string" || value.length === 0 || value.length > 8_192 || /[\r\n\u0000]/u.test(value)) throw new TypeError("provider header value is invalid");
    result[name] = value;
  }
  return result;
}

export function validateProviderEndpoint(value: string): string {
  const endpoint = new URL(value);
  const loopback = endpoint.hostname === "127.0.0.1" || endpoint.hostname === "localhost" || endpoint.hostname === "[::1]";
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && loopback)) throw new TypeError("provider endpoint must use HTTPS outside loopback");
  if (endpoint.username !== "" || endpoint.password !== "" || endpoint.search !== "" || endpoint.hash !== "") throw new TypeError("provider endpoint cannot contain credentials, query or fragment");
  return endpoint.toString();
}
