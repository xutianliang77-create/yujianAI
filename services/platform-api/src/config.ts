import type {
  YujianRtcConnectionConfig,
  YujianRtcNodeConfig,
} from "@yujian/livekit-compat";
import type { PlatformRoleV1 } from "@yujian/platform-contracts";
import type { PlatformCredential } from "./auth.js";

export interface PlatformApiConfig {
  host: string;
  port: number;
  platformCredentials: readonly PlatformCredential[];
  /** Optional bootstrap credential for tenant creation and control-plane admin APIs. */
  adminCredential?: string;
  /** Preferred Yujian-owned multi-node configuration. */
  rtcNodes?: readonly YujianRtcNodeConfig[];
  /** Compatibility input kept for callers that still provide one upstream node. */
  livekit?: YujianRtcConnectionConfig;
  mediaOps?: { baseUrl: string; credential: string };
  apiKeyGraceMs?: number;
  /** Optional exact browser origin; unset keeps the API same-origin/server-only. */
  corsOrigin?: string;
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const RESOURCE_ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/u;
const MAX_CREDENTIALS = 100;
const CREDENTIAL_FIELDS = new Set([
  "tenantId",
  "projectId",
  "environmentId",
  "credential",
  "scopes",
  "roles",
]);
const PLATFORM_ROLES = new Set<PlatformRoleV1>([
  "tenant_owner", "tenant_admin", "developer", "billing_admin", "security_auditor",
  "support_operator", "private_deployment_admin",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} must be set`);
  }
  if (CONTROL_CHARACTERS.test(value)) {
    throw new Error(`${name} must not contain control characters`);
  }
  return value;
}

function optionalCredential(environment: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = environment[name];
  if (value === undefined) return undefined;
  if (value.length < 32 || CONTROL_CHARACTERS.test(value)) {
    throw new Error(`${name} must be at least 32 control-free characters`);
  }
  return value;
}

function readPort(value: string | undefined): number {
  if (value === undefined) {
    return 8090;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PLATFORM_API_PORT must be an integer from 1 to 65535");
  }
  return port;
}

function readApiKeyGraceMs(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 86_400_000) throw new Error("YUJIAN_API_KEY_GRACE_MS must be 0-86400000");
  return parsed;
}

function readScopedCredentials(serialized: string): PlatformCredential[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error("YUJIAN_PLATFORM_CREDENTIALS_JSON must be valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_CREDENTIALS) {
    throw new Error(
      `YUJIAN_PLATFORM_CREDENTIALS_JSON must contain 1-${MAX_CREDENTIALS} credentials`,
    );
  }

  const credentialValues = new Set<string>();
  const scopeKeys = new Set<string>();
  return parsed.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`platform credential ${index} must be an object`);
    }
    for (const field of Object.keys(entry)) {
      if (!CREDENTIAL_FIELDS.has(field)) {
        throw new Error(`platform credential ${index}.${field} is unknown`);
      }
    }
    const tenantId = readResourceId(entry.tenantId, index, "tenantId");
    const projectId = readResourceId(entry.projectId, index, "projectId");
    const environmentId = readResourceId(
      entry.environmentId,
      index,
      "environmentId",
    );
    if (
      typeof entry.credential !== "string" ||
      entry.credential.length < 32 ||
      CONTROL_CHARACTERS.test(entry.credential)
    ) {
      throw new Error(
        `platform credential ${index}.credential must be at least 32 control-free characters`,
      );
    }
    if (credentialValues.has(entry.credential)) {
      throw new Error(`platform credential ${index}.credential is duplicated`);
    }
    credentialValues.add(entry.credential);
    const scopeKey = `${tenantId}\u0000${projectId}\u0000${environmentId}`;
    const credentialScopes = entry.scopes === undefined ? undefined : readStringList(entry.scopes, `platform credential ${index}.scopes`);
    const credentialRoles = entry.roles === undefined ? undefined : readStringList(entry.roles, `platform credential ${index}.roles`, PLATFORM_ROLES) as PlatformRoleV1[];
    if (scopeKeys.has(scopeKey)) {
      throw new Error(`platform credential ${index} scope is duplicated`);
    }
    scopeKeys.add(scopeKey);
    return {
      tenantId,
      projectId,
      environmentId,
      credential: entry.credential,
      ...(credentialScopes === undefined ? {} : { scopes: credentialScopes }),
      ...(credentialRoles === undefined ? {} : { roles: credentialRoles }),
    };
  });
}

function readStringList(value: unknown, field: string, allowed?: ReadonlySet<string>): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64 || value.some((item) => typeof item !== "string" || item.length === 0 || item.length > 128 || CONTROL_CHARACTERS.test(item) || (allowed !== undefined && !allowed.has(item)))) {
    throw new Error(`${field} must contain 1-64 control-free strings`);
  }
  return [...new Set(value as string[])];
}

function readResourceId(value: unknown, index: number, field: string): string {
  if (typeof value !== "string" || !RESOURCE_ID_PATTERN.test(value)) {
    throw new Error(`platform credential ${index}.${field} is invalid`);
  }
  return value;
}

function readRtcNode(
  environment: NodeJS.ProcessEnv,
  id: string,
  urlName: string,
  apiKey: string,
  apiSecret: string,
): YujianRtcNodeConfig {
  return {
    id,
    wsUrl: requiredEnvironmentValue(environment, urlName),
    apiKey,
    apiSecret,
  };
}

export function loadPlatformApiConfig(
  environment: NodeJS.ProcessEnv = process.env,
): PlatformApiConfig {
  const host = environment.PLATFORM_API_HOST ?? "127.0.0.1";
  if (host.length === 0 || CONTROL_CHARACTERS.test(host)) {
    throw new Error("PLATFORM_API_HOST is invalid");
  }

  const apiKey = requiredEnvironmentValue(
    environment,
    environment.YUJIAN_RTC_API_KEY === undefined
      ? "LIVEKIT_API_KEY"
      : "YUJIAN_RTC_API_KEY",
  );
  const apiSecret = requiredEnvironmentValue(
    environment,
    environment.YUJIAN_RTC_API_SECRET === undefined
      ? "LIVEKIT_API_SECRET"
      : "YUJIAN_RTC_API_SECRET",
  );
  const primaryUrlName =
    environment.YUJIAN_RTC_PRIMARY_URL === undefined
      ? "LIVEKIT_URL"
      : "YUJIAN_RTC_PRIMARY_URL";
  const primary = readRtcNode(environment, "primary", primaryUrlName, apiKey, apiSecret);
  const secondaryUrl = environment.YUJIAN_RTC_SECONDARY_URL;
  const mediaOpsUrl = environment.YUJIAN_MEDIA_OPS_URL;
  const mediaOpsCredential = environment.YUJIAN_MEDIA_OPS_CREDENTIAL;
  if ((mediaOpsUrl === undefined) !== (mediaOpsCredential === undefined)) {
    throw new Error("YUJIAN_MEDIA_OPS_URL and YUJIAN_MEDIA_OPS_CREDENTIAL must be set together");
  }
  const mediaOps = mediaOpsUrl === undefined || mediaOpsCredential === undefined
    ? undefined
    : { baseUrl: mediaOpsUrl, credential: optionalCredential(environment, "YUJIAN_MEDIA_OPS_CREDENTIAL")! };
  const apiKeyGraceMs = readApiKeyGraceMs(environment.YUJIAN_API_KEY_GRACE_MS);
  const corsOrigin = environment.YUJIAN_PLATFORM_CORS_ORIGIN;
  if (corsOrigin !== undefined) {
    let parsedOrigin: URL;
    try { parsedOrigin = new URL(corsOrigin); }
    catch { throw new Error("YUJIAN_PLATFORM_CORS_ORIGIN must be a valid origin"); }
    if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.pathname !== "/" || parsedOrigin.search !== "" || parsedOrigin.hash !== "") {
      throw new Error("YUJIAN_PLATFORM_CORS_ORIGIN must contain only an http(s) origin");
    }
  }
  const adminCredential = optionalCredential(
    environment,
    "YUJIAN_PLATFORM_ADMIN_CREDENTIAL",
  );
  const rtcNodes = [
    primary,
    ...(secondaryUrl === undefined
      ? []
      : [
          {
            id: "secondary",
            wsUrl: secondaryUrl,
            apiKey,
            apiSecret,
          },
        ]),
  ];

  return {
    host,
    port: readPort(environment.PLATFORM_API_PORT),
    platformCredentials: readScopedCredentials(
      requiredEnvironmentValue(environment, "YUJIAN_PLATFORM_CREDENTIALS_JSON"),
    ),
    ...(adminCredential === undefined ? {} : { adminCredential }),
    ...(mediaOps === undefined ? {} : { mediaOps }),
    ...(apiKeyGraceMs === undefined ? {} : { apiKeyGraceMs }),
    ...(corsOrigin === undefined ? {} : { corsOrigin: corsOrigin.replace(/\/$/u, "") }),
    rtcNodes,
    livekit: primary,
  };
}
