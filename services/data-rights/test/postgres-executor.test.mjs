import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PostgresDataRightsExecutor, PostgresDataRightsService } from "../dist/index.js";

test("PostgresDataRightsExecutor exports and deletes registered subject records with protected evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "yujian-data-rights-"));
  const records = [
    { record_id: "record-1", system_name: "audit", record_locator: "audit-1" },
    { record_id: "record-2", system_name: "profile", record_locator: "profile-1" },
  ];
  let receipt;
  let deleteCount = 0;
  const connection = {
    query: async (sql, values = []) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("FROM data_rights_evidence_receipts")) return { rows: receipt === undefined ? [] : [receipt] };
      if (sql.startsWith("SELECT") && sql.includes("FROM data_subject_records")) return { rows: [...records] };
      if (sql.startsWith("DELETE")) { deleteCount += 1; records.splice(0); }
      if (sql.includes("INSERT INTO data_rights_evidence_receipts")) {
        receipt = { tenant_id: values[1], action: "delete", evidence: JSON.parse(values[2]) };
      }
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
    await writeFile(fileURLToPath(deleteUri), "interrupted-materialization");
    const recoveredUri = await executor.deleteSubject({ ...context, requestId: "dsr-delete" });
    const recovered = JSON.parse(await readFile(fileURLToPath(recoveredUri), "utf8"));
    assert.equal(recovered.deletedRecordCount, 2);
    assert.equal(recovered.deletedInventoryDigest, deleted.deletedInventoryDigest);
    assert.equal(deleteCount, 1);
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
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("FROM data_rights_evidence_receipts")) return { rows: [] };
      if (sql.startsWith("SELECT") && sql.includes("FROM data_subject_records")) return { rows: [...records] };
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

test("PostgresDataRightsService heartbeats live work and requeues only expired leases", async () => {
  const queries = [];
  const service = new PostgresDataRightsService({
    query: async (sql, values) => {
      queries.push({ sql, values });
      return { rows: [{ request_id: "dsr-stale" }] };
    },
  });
  assert.equal(await service.recoverStale(30_000), 1);
  assert.match(queries[0].sql, /status = 'processing'/u);
  assert.match(queries[0].sql, /processing_started_at <=/u);
  assert.deepEqual(queries[0].values, [30_000]);
  await assert.rejects(service.recoverStale(29_999), /processing lease is invalid/u);
  assert.equal(await service.heartbeat("dsr-stale"), true);
  assert.match(queries[1].sql, /processing_started_at = NOW\(\)/u);
  assert.deepEqual(queries[1].values, ["dsr-stale"]);
});
