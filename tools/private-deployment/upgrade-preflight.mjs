import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const releasePath = process.argv[2] ?? process.env.YUJIAN_RELEASE_MANIFEST ?? "infra/release/release-manifest.json";
const migrationDir = process.env.YUJIAN_MIGRATION_DIR ?? "infra/database/migrations";

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    fail(`cannot read JSON manifest ${path}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

function integerEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === "") return undefined;
  if (!/^\d+$/u.test(value)) fail(`${name} must be a non-negative integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail(`${name} is outside the safe integer range`);
  return parsed;
}

const manifest = readJson(releasePath);
if (typeof manifest !== "object" || manifest === null || manifest.schemaVersion !== 1) fail("release manifest schemaVersion must be 1");
if (typeof manifest.rollback !== "object" || manifest.rollback === null) fail("release manifest rollback policy is missing");
if (!Number.isInteger(manifest.rollback.maxSchemaSkew) || manifest.rollback.maxSchemaSkew < 0 || manifest.rollback.maxSchemaSkew > 10) fail("release rollback maxSchemaSkew must be an integer from 0 to 10");
if (manifest.rollback.mustRetainPreviousImage !== true) fail("release rollback must retain the previous image");

if (!existsSync(resolve(migrationDir))) fail(`migration directory does not exist: ${migrationDir}`);
const migrations = readdirSync(resolve(migrationDir))
  .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/u.test(name))
  .sort();
if (migrations.length === 0) fail("no ordered SQL migrations found");
const versions = migrations.map((name) => Number(name.slice(0, 3)));
for (let index = 0; index < versions.length; index += 1) {
  const expected = index + 1;
  if (versions[index] !== expected) fail(`migration sequence must be contiguous; expected ${String(expected).padStart(3, "0")}, found ${migrations[index]}`);
}

const currentSchema = integerEnv("YUJIAN_CURRENT_SCHEMA_VERSION");
const targetSchema = integerEnv("YUJIAN_TARGET_SCHEMA_VERSION");
if ((currentSchema === undefined) !== (targetSchema === undefined)) fail("YUJIAN_CURRENT_SCHEMA_VERSION and YUJIAN_TARGET_SCHEMA_VERSION must be provided together");
if (targetSchema !== undefined && targetSchema !== versions.at(-1)) fail(`YUJIAN_TARGET_SCHEMA_VERSION must equal latest migration ${versions.at(-1)}`);
if (currentSchema !== undefined && currentSchema > versions.at(-1)) fail("YUJIAN_CURRENT_SCHEMA_VERSION is newer than the migration set");
if (currentSchema !== undefined && targetSchema !== undefined) {
  if (targetSchema < currentSchema) fail("schema downgrade is not supported by the forward-only migration set");
  if (targetSchema - currentSchema > manifest.rollback.maxSchemaSkew) fail("schema skew exceeds the release rollback policy");
}

const previousImage = process.env.YUJIAN_PREVIOUS_IMAGE_DIGEST;
if (previousImage !== undefined && !/^sha256:[0-9a-f]{64}$/u.test(previousImage)) fail("YUJIAN_PREVIOUS_IMAGE_DIGEST must be a sha256 digest");
const hasRuntimeVersions = currentSchema !== undefined || targetSchema !== undefined;
if (hasRuntimeVersions && previousImage === undefined) fail("YUJIAN_PREVIOUS_IMAGE_DIGEST is required for a runtime upgrade preflight");

console.log(JSON.stringify({
  status: hasRuntimeVersions ? "verified" : "declarative",
  releaseManifest: releasePath,
  migrationCount: migrations.length,
  latestMigration: versions.at(-1),
  rollback: manifest.rollback,
  runtimeVersionsProvided: hasRuntimeVersions,
  previousImageDigestProvided: previousImage !== undefined,
}, null, 2));
