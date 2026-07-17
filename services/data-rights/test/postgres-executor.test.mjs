import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PostgresDataRightsExecutor } from "../dist/index.js";

test("PostgresDataRightsExecutor exports and deletes registered subject records with protected evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "yujian-data-rights-"));
  const records = [
    { record_id: "record-1", system_name: "audit", record_locator: "audit-1" },
    { record_id: "record-2", system_name: "profile", record_locator: "profile-1" },
  ];
  const connection = {
    query: async (sql) => {
      if (sql.startsWith("SELECT")) return { rows: [...records] };
      if (sql.startsWith("DELETE")) records.splice(0);
      return { rows: [] };
    },
    release: async () => undefined,
  };
  const pool = {
    query: (...args) => connection.query(...args),
    connect: async () => connection,
  };
  const executor = new PostgresDataRightsExecutor(pool, root);
  const context = { requestId: "dsr-test", tenantId: "tenant-test", subjectId: "user@example.test" };
  try {
    const exportUri = await executor.exportSubject(context);
    const exported = JSON.parse(await readFile(fileURLToPath(exportUri), "utf8"));
    assert.equal(exported.action, "export");
    assert.equal(exported.recordCount, 2);
    assert.equal(exported.records[0].locator, "audit-1");
    const deleteUri = await executor.deleteSubject({ ...context, requestId: "dsr-delete" });
    const deleted = JSON.parse(await readFile(fileURLToPath(deleteUri), "utf8"));
    assert.equal(deleted.action, "delete");
    assert.equal(deleted.transactionStatus, "committed");
    assert.equal(deleted.deletedRecordCount, 2);
    assert.equal(records.length, 0);
    assert.equal(Object.hasOwn(deleted, "subjectId"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PostgresDataRightsExecutor rolls back before deletion when evidence cannot be prepared", async () => {
  const root = await mkdtemp(join(tmpdir(), "yujian-data-rights-failure-"));
  const blockedEvidenceRoot = join(root, "not-a-directory");
  await writeFile(blockedEvidenceRoot, "blocked");
  const commands = [];
  const records = [{ record_id: "record-1", system_name: "profile", record_locator: "profile-1" }];
  const connection = {
    query: async (sql) => {
      commands.push(sql);
      if (sql.startsWith("SELECT")) return { rows: [...records] };
      if (sql.startsWith("DELETE")) records.splice(0);
      return { rows: [] };
    },
    release: async () => undefined,
  };
  const executor = new PostgresDataRightsExecutor({
    query: (...args) => connection.query(...args),
    connect: async () => connection,
  }, blockedEvidenceRoot);
  try {
    await assert.rejects(
      executor.deleteSubject({ requestId: "dsr-failure", tenantId: "tenant-test", subjectId: "subject-test" }),
    );
    assert.equal(records.length, 1);
    assert.equal(commands.some((sql) => sql.startsWith("DELETE")), false);
    assert.equal(commands.includes("ROLLBACK"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
