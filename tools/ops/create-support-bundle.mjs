import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ID = /^[a-z][a-z0-9-]{2,127}$/u;
const SENSITIVE_KEY = /(authorization|cookie|secret|token|credential|password|api.?key|sdp|recording|media|phone|body|payload)/iu;
const ALLOWED_READINESS_KEYS = new Set(["status", "ready", "upstream", "service", "nodes"]);
const ALLOWED_NODE_KEYS = new Set(["id", "healthy", "latencyMs", "activeRoomCount"]);

function required(name) {
  const value = process.env[name];
  if (typeof value !== "string" || !ID.test(value)) throw new Error(`${name} must be a resource id`);
  return value;
}

function boundedInteger(name, fallback, minimum, maximum) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be ${minimum}-${maximum}`);
  return value;
}

function safeScalar(value) {
  if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value) && value >= 0)) return value;
  if (typeof value === "string" && value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value)) return value;
  return undefined;
}

function readinessProjection(serialized) {
  if (serialized === undefined) return { status: "not-provided" };
  if (Buffer.byteLength(serialized, "utf8") > 65_536) throw new Error("YUJIAN_READINESS_JSON exceeds 64 KiB");
  const input = JSON.parse(serialized);
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("YUJIAN_READINESS_JSON must be an object");
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY.test(key) || !ALLOWED_READINESS_KEYS.has(key)) continue;
    if (key === "nodes") {
      if (!Array.isArray(value) || value.length > 64) throw new Error("readiness nodes must contain at most 64 entries");
      output.nodes = value.map((node) => {
        if (typeof node !== "object" || node === null || Array.isArray(node)) return {};
        return Object.fromEntries(Object.entries(node).flatMap(([nodeKey, nodeValue]) => {
          if (SENSITIVE_KEY.test(nodeKey) || !ALLOWED_NODE_KEYS.has(nodeKey)) return [];
          const safe = safeScalar(nodeValue);
          return safe === undefined ? [] : [[nodeKey, safe]];
        }));
      });
      continue;
    }
    const safe = safeScalar(value);
    if (safe !== undefined) output[key] = safe;
  }
  return output;
}

const ticketId = required("YUJIAN_SUPPORT_TICKET_ID");
const environmentId = required("YUJIAN_ENVIRONMENT");
const ttlHours = boundedInteger("YUJIAN_SUPPORT_BUNDLE_TTL_HOURS", 24, 1, 72);
const generatedAt = new Date();
const output = resolve(process.env.SUPPORT_BUNDLE_OUTPUT ?? `outputs/support/${ticketId}-${generatedAt.getTime()}.json`);
const manifestPath = `${output}.manifest.json`;
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
const gitCommit = process.env.GIT_COMMIT ?? "unknown";
if (gitCommit !== "unknown" && !/^[0-9a-f]{40}$/u.test(gitCommit)) throw new Error("GIT_COMMIT must be a full lowercase commit hash");
const bundle = {
  schemaVersion: 1,
  redactionPolicyVersion: "support-redaction-v1",
  ticketId,
  environmentId,
  generatedAt: generatedAt.toISOString(),
  expiresAt: new Date(generatedAt.getTime() + ttlHours * 3_600_000).toISOString(),
  gitCommit,
  readiness: readinessProjection(process.env.YUJIAN_READINESS_JSON),
  exclusions: ["authorization", "cookies", "secrets", "tokens", "credentials", "request-bodies", "user-payloads", "phone-numbers", "sdp", "recordings", "media"],
  containsMedia: false,
};
const payload = Buffer.from(`${JSON.stringify(bundle, null, 2)}\n`, "utf8");
writeFileSync(output, payload, { flag: "wx", mode: 0o600 });
const manifest = {
  schemaVersion: 1,
  ticketId,
  artifactPath: output,
  sha256: `sha256:${createHash("sha256").update(payload).digest("hex")}`,
  sizeBytes: payload.length,
  redactionPolicyVersion: bundle.redactionPolicyVersion,
  containsMedia: false,
  expiresAt: bundle.expiresAt,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ bundle: output, manifest: manifestPath, sha256: manifest.sha256 })}\n`);
