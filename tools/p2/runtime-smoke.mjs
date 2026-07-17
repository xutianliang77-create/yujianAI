#!/usr/bin/env node
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { createOpenBaoSecretResolver, createPlatformRuntime } from "../../infra/p2/runtime/platform-runtime.mjs";

function required(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${name} must be set`);
  return value;
}

const databaseUrl = required("YUJIAN_DATABASE_URL");
const kmsAddresses = required("YUJIAN_KMS_ADDR").split(",").map((value) => value.trim()).filter(Boolean);
const kmsAddress = kmsAddresses[0]?.replace(/\/$/u, "");
if (kmsAddress === undefined) throw new Error("YUJIAN_KMS_ADDR must contain an address");
const kmsToken = required("YUJIAN_KMS_TOKEN");
const kmsAdminToken = required("YUJIAN_KMS_ADMIN_TOKEN");
const secretRef = `yujian/p2/smoke-${randomUUID()}`;
const secret = randomBytes(32);
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
const runtime = await createPlatformRuntime({ config: {} });

try {
  const migrations = await pool.query("SELECT count(*)::int AS count FROM yujian_schema_migrations");
  const migrationCount = Number(migrations.rows[0]?.count);
  if (migrationCount !== 9) throw new Error(`expected 9 migrations, found ${migrationCount}`);

  const rateLimit = await runtime.rateLimiter.check("yujian:p2:runtime-smoke");
  if (!rateLimit.allowed || rateLimit.limit < 1) throw new Error("Redis rate limiter adapter is not operational");
  const storeSnapshot = await runtime.storePersistence.load();

  const write = await fetch(`${kmsAddress}/v1/kv/data/${secretRef}`, {
    method: "POST",
    headers: { "X-Vault-Token": kmsAdminToken, "content-type": "application/json" },
    body: JSON.stringify({ data: { value: secret.toString("base64") } }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!write.ok) throw new Error(`OpenBao write failed with HTTP ${write.status}`);
  const resolved = await createOpenBaoSecretResolver(kmsAddresses.join(","), kmsToken).resolve(secretRef);
  if (Buffer.compare(Buffer.from(resolved), secret) !== 0) throw new Error("OpenBao secret round-trip mismatch");

  console.log(JSON.stringify({
    postgres: { migrations: migrationCount, storeSnapshot: storeSnapshot === undefined ? "empty" : "loaded" },
    redis: { rateLimit: "atomic-counter" },
    kms: { provider: "openbao", secretBytes: resolved.byteLength },
    runtimeAdapters: Object.keys(runtime).filter((key) => key !== "close").sort(),
  }));
} finally {
  await fetch(`${kmsAddress}/v1/kv/metadata/${secretRef}`, {
    method: "DELETE",
    headers: { "X-Vault-Token": kmsAdminToken },
    signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);
  await runtime.close?.();
  await pool.end();
}
