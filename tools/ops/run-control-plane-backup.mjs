#!/usr/bin/env node
import pg from "pg";
import {
  HttpControlPlaneBackupProvider,
  PostgresControlPlaneBackupCoordinator,
} from "@yujian/platform-api";

const { Pool } = pg;

function required(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${name} must be set and control-free`);
  return value;
}

function integer(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be ${minimum}-${maximum}`);
  return value;
}

const action = process.argv[2];
if (action !== "backup" && action !== "restore-drill") throw new Error("usage: run-control-plane-backup.mjs backup|restore-drill [backupRunId]");
const databaseUrl = required("YUJIAN_DATABASE_URL");
const pool = new Pool({ connectionString: databaseUrl, max: 2 });
const provider = new HttpControlPlaneBackupProvider({
  endpoint: required("YUJIAN_BACKUP_PROVIDER_URL"),
  authorization: () => `Bearer ${required("YUJIAN_BACKUP_PROVIDER_TOKEN")}`,
  timeoutMs: integer("YUJIAN_BACKUP_PROVIDER_TIMEOUT_MS", 30_000, 1_000, 300_000),
});
const coordinator = new PostgresControlPlaneBackupCoordinator(pool, provider);

try {
  if (action === "backup") {
    const result = await coordinator.createBackup({
      encryptionKeyRef: required("YUJIAN_BACKUP_KMS_KEY_REF"),
      schemaMigration: process.env.YUJIAN_SCHEMA_MIGRATION ?? "016_ga_commerce.sql",
      rpoSeconds: integer("YUJIAN_BACKUP_RPO_SECONDS", 900, 0, 86_400),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    const backupRunId = process.argv[3];
    if (typeof backupRunId !== "string" || !/^backup-[0-9a-f-]{36}$/u.test(backupRunId)) throw new Error("restore-drill requires a backupRunId");
    process.stdout.write(`${JSON.stringify(await coordinator.runRestoreDrill(backupRunId))}\n`);
  }
} finally {
  await pool.end();
}
