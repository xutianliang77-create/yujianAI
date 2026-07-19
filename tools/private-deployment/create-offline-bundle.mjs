import { createHash } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const inventoryPath = process.argv[2];
const outputRoot = process.argv[3];
if (inventoryPath === undefined || outputRoot === undefined) throw new Error("usage: create-offline-bundle <inventory.json> <new-output-directory>");
const inventory = JSON.parse(readFileSync(resolve(inventoryPath), "utf8"));
if (typeof inventory !== "object" || inventory === null || inventory.schemaVersion !== 1 || inventory.product !== "yujian-realtime") throw new Error("offline inventory is invalid");
if (!Array.isArray(inventory.architecture) || inventory.architecture.length === 0 || inventory.architecture.some((value) => value !== "linux/amd64" && value !== "linux/arm64")) throw new Error("offline architecture inventory is invalid");
if (!Array.isArray(inventory.artifacts) || inventory.artifacts.length === 0) throw new Error("offline artifact inventory is empty");
const output = resolve(outputRoot);
mkdirSync(output, { recursive: false, mode: 0o700 });
const requiredArtifacts = [];
const details = [];
for (const raw of inventory.artifacts) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("offline artifact entry is invalid");
  const name = raw.name;
  const sourcePath = raw.sourcePath;
  const mediaType = raw.mediaType;
  if (typeof name !== "string" || basename(name) !== name || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(name)) throw new Error("offline artifact name is invalid");
  if (typeof sourcePath !== "string" || typeof mediaType !== "string" || mediaType.length === 0 || mediaType.length > 128) throw new Error(`offline artifact ${name} metadata is invalid`);
  const source = resolve(sourcePath);
  const stat = lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw new Error(`offline artifact ${name} must be a non-empty regular file`);
  const bytes = readFileSync(source);
  const digest = createHash("sha256").update(bytes).digest("hex");
  copyFileSync(source, join(output, name));
  requiredArtifacts.push(`${name}@sha256:${digest}`);
  details.push({ name, mediaType, sizeBytes: stat.size, sha256: `sha256:${digest}` });
}
if (new Set(requiredArtifacts).size !== requiredArtifacts.length) throw new Error("offline artifact names must be unique");
const manifest = {
  schemaVersion: 1,
  product: inventory.product,
  architecture: inventory.architecture,
  generatedAt: new Date().toISOString(),
  requiredArtifacts,
  artifacts: details,
  externalServices: inventory.externalServices ?? ["postgresql", "redis", "kms-or-license-public-key", "object-storage", "oidc"],
  forbiddenDefaults: ["public yujian callback", "embedded secret", "anonymous telemetry"],
  containsSecrets: false,
};
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
writeFileSync(join(output, "manifest.json"), manifestBytes, { flag: "wx", mode: 0o600 });
writeFileSync(join(output, "manifest.sha256"), `${createHash("sha256").update(manifestBytes).digest("hex")}  manifest.json\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ output, artifacts: details.length, manifestSha256: createHash("sha256").update(manifestBytes).digest("hex") })}\n`);
