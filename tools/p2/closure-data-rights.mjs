import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

export async function runDataRightsClosure({ api, pool, tenantId, ownerToken, runId, waitFor }) {
  const subject = `data-subject-${runId}`;
  await pool.query(
    "INSERT INTO data_subject_records (record_id, tenant_id, subject_id, system_name, record_locator) VALUES ($1,$2,$3,'profile','profile-1'),($4,$2,$3,'audit','audit-1')",
    [`record-${randomUUID()}`, tenantId, subject, `record-${randomUUID()}`],
  );
  const submit = async (kind) => api(`/platform/v1/tenants/${tenantId}/data-rights`, ownerToken, {
    method: "POST",
    headers: { "idempotency-key": `${runId}:${kind}` },
    body: JSON.stringify({ subjectId: subject, kind }),
  });
  const exportRequest = await submit("export");
  if (exportRequest.status !== 202) throw new Error("data-rights export submission failed");
  const exportDone = await waitFor(async () => {
    const value = await api(`/platform/v1/data-rights/${exportRequest.payload.data.requestId}`, ownerToken);
    return value.payload?.data?.status === "completed" ? value.payload.data : undefined;
  }, "data-rights export executor did not complete");
  const deleteRequest = await submit("delete");
  if (deleteRequest.status !== 202) throw new Error("data-rights deletion submission failed");
  const deleteDone = await waitFor(async () => {
    const value = await api(`/platform/v1/data-rights/${deleteRequest.payload.data.requestId}`, ownerToken);
    return value.payload?.data?.status === "completed" ? value.payload.data : undefined;
  }, "data-rights deletion executor did not complete");
  const deleteReceipt = await pool.query(
    "SELECT evidence FROM data_rights_evidence_receipts WHERE request_id = $1 AND tenant_id = $2 AND action = 'delete'",
    [deleteDone.requestId, tenantId],
  );
  if (deleteReceipt.rows.length !== 1 || JSON.stringify(deleteReceipt.rows[0]?.evidence).includes(subject)) {
    throw new Error("data-rights deletion receipt is missing or contains the raw subject");
  }
  const remaining = Number((await pool.query(
    "SELECT count(*) AS count FROM data_subject_records WHERE tenant_id = $1 AND subject_id = $2",
    [tenantId, subject],
  )).rows[0]?.count);
  if (remaining !== 0) throw new Error("data-rights deletion left registered subject records");

  const recoverySubject = `recovered-subject-${runId}`;
  const recoveryRequestId = `dsr-recovery-${randomUUID()}`;
  const recoveryPreparedAt = new Date(Date.now() - 600_000).toISOString();
  const recoveryEvidence = {
    schemaVersion: "yujian.data-rights-evidence/v1",
    requestId: recoveryRequestId,
    tenantId,
    subjectDigest: createHash("sha256").update(recoverySubject).digest("hex"),
    completedAt: new Date().toISOString(),
    action: "delete",
    deletedRecordCount: 1,
    systems: ["profile"],
    deletedInventoryDigest: createHash("sha256").update(JSON.stringify(["profile\u0000profile-crash-recovery"])).digest("hex"),
    transactionStatus: "committed",
    preparedAt: recoveryPreparedAt,
  };
  await pool.query(
    `INSERT INTO data_subject_requests
       (request_id, tenant_id, subject_id, kind, status, created_at, processing_started_at)
     VALUES ($1,$2,$3,'delete','processing',now() - interval '10 minutes',now() - interval '10 minutes')`,
    [recoveryRequestId, tenantId, recoverySubject],
  );
  await pool.query(
    `INSERT INTO data_rights_evidence_receipts (request_id, tenant_id, action, evidence)
     VALUES ($1,$2,'delete',$3::jsonb)`,
    [recoveryRequestId, tenantId, JSON.stringify(recoveryEvidence)],
  );
  const recoveryDone = await waitFor(async () => {
    const value = await api(`/platform/v1/data-rights/${recoveryRequestId}`, ownerToken);
    return value.payload?.data?.status === "completed" ? value.payload.data : undefined;
  }, "stale data-rights processing request was not recovered", 40_000);

  for (const evidence of [exportDone.evidenceUri, deleteDone.evidenceUri, recoveryDone.evidenceUri]) {
    const path = new URL(evidence);
    const mode = (await stat(path)).mode & 0o777;
    const body = await readFile(path, "utf8");
    if (mode !== 0o600 || body.includes(subject) || body.includes(recoverySubject)) {
      throw new Error("data-rights evidence permissions or subject redaction failed");
    }
  }
  return {
    result: { dataRights: { export: "completed", deletion: "completed", receipts: "delete-and-crash-recovery-durable", crashRecovery: "stale-processing-replayed-from-durable-receipt", remainingRecords: remaining, evidence: "mode-0600-subject-digested" } },
    cleanup: { exportRequestId: exportDone.requestId, deleteRequestId: deleteDone.requestId, recoveryRequestId },
  };
}
