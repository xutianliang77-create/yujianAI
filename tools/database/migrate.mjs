#!/usr/bin/env node
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const migrationDirectory = resolve(root, "infra/database/migrations");
const databaseUrl = process.env.YUJIAN_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";

if (typeof databaseUrl !== "string" || databaseUrl.length === 0 || /[\u0000-\u001f\u007f]/u.test(databaseUrl)) {
  throw new Error("YUJIAN_DATABASE_URL must be set and control-free");
}
if (typeof psql !== "string" || psql.length === 0 || /[\u0000-\u001f\u007f]/u.test(psql)) {
  throw new Error("PSQL_BIN is invalid");
}

const url = new URL(databaseUrl);
if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error("YUJIAN_DATABASE_URL must use postgres://");
if (url.username.length === 0 || url.pathname.length <= 1) throw new Error("YUJIAN_DATABASE_URL must include user and database");

const migrations = readdirSync(migrationDirectory)
  .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/u.test(name))
  .sort();
if (migrations.length === 0) throw new Error("no database migrations found");

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

const script = [
  "\\set ON_ERROR_STOP on",
  "CREATE TABLE IF NOT EXISTS yujian_schema_migrations (migration_id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());",
  "SELECT pg_advisory_lock(hashtextextended('yujian-schema-migrations', 0));",
  ...migrations.flatMap((name) => {
    const id = name.replace(/\.sql$/u, "");
    const file = resolve(migrationDirectory, name);
    return [
      `SELECT EXISTS (SELECT 1 FROM yujian_schema_migrations WHERE migration_id = ${sqlLiteral(id)}) AS migration_applied \\gset`,
      "\\if :migration_applied",
      `\\echo migration ${id} already applied`,
      "\\else",
      "BEGIN;",
      `\\ir ${sqlLiteral(file)}`,
      `INSERT INTO yujian_schema_migrations (migration_id) VALUES (${sqlLiteral(id)});`,
      "COMMIT;",
      `\\echo migration ${id} applied`,
      "\\endif",
    ];
  }),
  "SELECT pg_advisory_unlock(hashtextextended('yujian-schema-migrations', 0));",
  "\\q",
  "",
].join("\n");

const environment = { ...process.env };
environment.PGHOST = url.hostname;
if (url.port.length > 0) environment.PGPORT = url.port;
environment.PGUSER = decodeURIComponent(url.username);
environment.PGPASSWORD = decodeURIComponent(url.password);
environment.PGDATABASE = decodeURIComponent(url.pathname.slice(1));
const sslMode = url.searchParams.get("sslmode");
if (sslMode !== null) environment.PGSSLMODE = sslMode;

const result = spawnSync(psql, ["--no-psqlrc", "--quiet"], {
  cwd: root,
  env: environment,
  input: script,
  encoding: "utf8",
  stdio: ["pipe", "inherit", "inherit"],
});
if (result.error !== undefined) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`database migrations applied: ${migrations.length}`);
