import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const manifestPath = process.argv[2] ?? process.env.YUJIAN_OFFLINE_MANIFEST;
if (manifestPath === undefined) throw new Error("offline manifest path is required");
const manifest = JSON.parse(readFileSync(resolve(manifestPath), "utf8"));
if (typeof manifest !== "object" || manifest === null || manifest.schemaVersion !== 1 || manifest.product !== "yujian-realtime") throw new Error("offline manifest schema or product is invalid");
if (!Array.isArray(manifest.architecture) || manifest.architecture.length === 0 || manifest.architecture.some((item) => item !== "linux/amd64" && item !== "linux/arm64")) throw new Error("offline manifest architecture is invalid");
if (!Array.isArray(manifest.requiredArtifacts) || manifest.requiredArtifacts.length === 0 || manifest.requiredArtifacts.some((item) => typeof item !== "string" || item.length === 0)) throw new Error("offline manifest requiredArtifacts is invalid");
if (new Set(manifest.requiredArtifacts).size !== manifest.requiredArtifacts.length) throw new Error("offline manifest contains duplicate artifacts");
if (!Array.isArray(manifest.externalServices) || manifest.externalServices.some((item) => typeof item !== "string" || item.length === 0)) throw new Error("offline manifest externalServices is invalid");
if (!Array.isArray(manifest.forbiddenDefaults) || manifest.forbiddenDefaults.some((item) => typeof item !== "string" || item.length === 0)) throw new Error("offline manifest forbiddenDefaults is invalid");
if (manifest.containsSecrets !== undefined && manifest.containsSecrets !== false) throw new Error("offline manifest must declare containsSecrets=false");
if (manifest.artifacts !== undefined) {
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== manifest.requiredArtifacts.length) throw new Error("offline artifact details are invalid");
  for (const detail of manifest.artifacts) {
    if (typeof detail !== "object" || detail === null || typeof detail.name !== "string" || typeof detail.mediaType !== "string" || !Number.isSafeInteger(detail.sizeBytes) || detail.sizeBytes < 1 || typeof detail.sha256 !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(detail.sha256)) throw new Error("offline artifact detail is invalid");
    if (!manifest.requiredArtifacts.includes(`${detail.name}@${detail.sha256}`)) throw new Error(`offline artifact detail is not in requiredArtifacts: ${detail.name}`);
  }
}
const artifactRoot = process.env.YUJIAN_OFFLINE_ARTIFACT_ROOT;
const placeholders = manifest.requiredArtifacts.filter((item) => /<[^>]+>/u.test(item));
if (artifactRoot === undefined) {
  if (placeholders.length === 0) throw new Error("YUJIAN_OFFLINE_ARTIFACT_ROOT is required to verify non-placeholder artifacts");
  process.stdout.write(`offline manifest schema passed; artifact inventory is declarative (${placeholders.length} placeholders)\n`);
  process.exit(0);
}
for (const artifact of manifest.requiredArtifacts) {
  if (/<[^>]+>/u.test(artifact)) throw new Error(`offline artifact placeholder is unresolved: ${artifact}`);
  const separator = artifact.indexOf("@sha256:");
  const filePart = separator < 0 ? artifact : artifact.slice(0, separator);
  const expectedDigest = separator < 0 ? undefined : artifact.slice(separator + "@sha256:".length);
  if (expectedDigest !== undefined && !/^[0-9a-f]{64}$/u.test(expectedDigest)) throw new Error(`offline artifact digest is invalid: ${artifact}`);
  if (filePart.includes("..") || filePart.includes("/") || filePart.includes("\\")) throw new Error(`offline artifact path is invalid: ${artifact}`);
  const fileName = basename(filePart);
  const artifactPath = resolve(artifactRoot, fileName);
  if (!existsSync(artifactPath)) throw new Error(`offline artifact is missing: ${fileName}`);
  if (expectedDigest !== undefined) {
    const bytes = readFileSync(artifactPath);
    const actualDigest = createHash("sha256").update(bytes).digest("hex");
    if (actualDigest !== expectedDigest) throw new Error(`offline artifact digest mismatch: ${fileName}`);
    const detail = manifest.artifacts?.find((item) => item.name === fileName);
    if (detail !== undefined && detail.sizeBytes !== bytes.byteLength) throw new Error(`offline artifact size mismatch: ${fileName}`);
  }
}
process.stdout.write(`offline manifest verified; artifacts=${manifest.requiredArtifacts.length}\n`);
