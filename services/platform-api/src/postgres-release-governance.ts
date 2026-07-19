import { createHash, randomUUID } from "node:crypto";
import type { GaDecisionV1, ReleaseCandidateFreezeV1, SecurityAuditManifestV1 } from "@yujian/platform-contracts";
import type { ReliabilitySqlConnection, ReliabilitySqlPool } from "./postgres-reliability.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const REF = /^(?:evidence|https|s3|gs|oss):\/\/[^\s?#]+$/u;
const REQUIRED_OWNERS = ["product-owner", "sre-owner", "security-owner", "legal-owner", "compliance-owner", "finance-owner", "rtc-agent-owner", "release-owner"];
const SECURITY_CHECKS = ["secret-scan", "sast", "dependency-scan", "container-scan", "sbom", "signature", "penetration-test", "compliance-assessment"];
const GATE_STATUSES = new Set(["passed", "failed", "not-run", "blocked"]);
const instant = (value: string): boolean => Number.isFinite(Date.parse(value));

async function transaction<T>(pool: ReliabilitySqlPool, run: (connection: ReliabilitySqlConnection) => Promise<T>): Promise<T> {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const value = await run(connection);
    await connection.query("COMMIT");
    return value;
  } catch (error) { await connection.query("ROLLBACK"); throw error; }
  finally { connection.release(); }
}

/** Archives security, RC and GA records without overwrite paths. */
export class PostgresReleaseGovernanceService {
  constructor(private readonly pool: ReliabilitySqlPool) {}

  async archiveSecurityAudit(manifest: SecurityAuditManifestV1, artifactUri: string, manifestDigest: string): Promise<string> {
    if (!REF.test(artifactUri) || !DIGEST.test(manifestDigest) || !DIGEST.test(manifest.releaseDigest) || !/^[0-9a-f]{40}$/u.test(manifest.sourceCommit) || !instant(manifest.generatedAt) || manifest.checks.length !== 8) throw new TypeError("security audit archive is invalid");
    const checkIds = new Set<string>(manifest.checks.map((check) => check.checkId));
    if (checkIds.size !== SECURITY_CHECKS.length || SECURITY_CHECKS.some((check) => !checkIds.has(check))) throw new TypeError("security audit checks are incomplete");
    const expectedOutcome = manifest.checks.some((check) => check.status === "failed" || check.criticalFindings > 0 || check.highFindings > 0) ? "failed" : manifest.checks.every((check) => check.status === "passed") ? "passed" : "incomplete";
    if (manifest.outcome !== expectedOutcome || manifest.checks.some((check) => !GATE_STATUSES.has(check.status) || !REF.test(check.evidenceRef) || !DIGEST.test(check.sha256) || !Number.isSafeInteger(check.criticalFindings) || check.criticalFindings < 0 || !Number.isSafeInteger(check.highFindings) || check.highFindings < 0 || (check.status === "passed" && (check.criticalFindings !== 0 || check.highFindings !== 0)))) throw new TypeError("security audit outcome is invalid");
    const id = `security-audit-${randomUUID()}`;
    await transaction(this.pool, async (connection) => {
      const inserted = await connection.query<{ audit_manifest_id: string }>("INSERT INTO security_audit_manifests (audit_manifest_id,release_digest,source_commit,manifest_digest,outcome,artifact_uri,generated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (release_digest) DO NOTHING RETURNING audit_manifest_id", [id, manifest.releaseDigest, manifest.sourceCommit, manifestDigest, manifest.outcome, artifactUri, manifest.generatedAt]);
      if (inserted.rows[0] === undefined) throw new Error("security audit release digest already archived");
      for (const check of manifest.checks) await connection.query("INSERT INTO security_audit_checks (audit_manifest_id,check_id,status,critical_findings,high_findings,evidence_ref,evidence_digest) VALUES ($1,$2,$3,$4,$5,$6,$7)", [id, check.checkId, check.status, check.criticalFindings, check.highFindings, check.evidenceRef, check.sha256]);
    });
    return id;
  }

  async archiveReleaseCandidate(candidate: ReleaseCandidateFreezeV1, recordDigest: string): Promise<void> {
    if (candidate.gateResults.length !== 11 || !/^rc-[0-9a-f-]{36}$/u.test(candidate.releaseCandidateId) || !/^v?[0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[0-9]+)?$/u.test(candidate.version) || !instant(candidate.createdAt) || !DIGEST.test(recordDigest) || !/^[0-9a-f]{40}$/u.test(candidate.sourceCommit) || !DIGEST.test(candidate.artifactManifest.sha256) || !REF.test(candidate.artifactManifest.evidenceRef)) throw new TypeError("release candidate archive is invalid");
    const gates = new Set<string>(candidate.gateResults.map((gate) => gate.gateId));
    if (gates.size !== 11 || Array.from({ length: 11 }, (_, index) => `gate-${index}`).some((gate) => !gates.has(gate))) throw new TypeError("release candidate gates are incomplete");
    if (candidate.gateResults.some((gate) => !GATE_STATUSES.has(gate.status) || !DIGEST.test(gate.sha256) || !REF.test(gate.evidenceRef))) throw new TypeError("release candidate gate evidence is invalid");
    const expected = candidate.gateResults.every((gate) => gate.status === "passed") ? "frozen" : "rejected";
    if (candidate.status !== expected || (expected === "frozen") !== (candidate.frozenAt !== null)) throw new TypeError("release candidate status conflicts with gates");
    await transaction(this.pool, async (connection) => {
      await connection.query("INSERT INTO release_candidates (release_candidate_id,version,source_commit,manifest_digest,record_digest,artifact_manifest_uri,status,frozen_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [candidate.releaseCandidateId, candidate.version, candidate.sourceCommit, candidate.artifactManifest.sha256, recordDigest, candidate.artifactManifest.evidenceRef, candidate.status, candidate.frozenAt, candidate.createdAt]);
      for (const gate of candidate.gateResults) await connection.query("INSERT INTO release_gate_results (release_candidate_id,gate_id,status,evidence_ref,evidence_digest,recorded_at) VALUES ($1,$2,$3,$4,$5,$6)", [candidate.releaseCandidateId, gate.gateId, gate.status, gate.evidenceRef, gate.sha256, candidate.createdAt]);
    });
  }

  async archiveGaDecision(decision: GaDecisionV1): Promise<void> {
    if (!/^ga-decision-[0-9a-f-]{36}$/u.test(decision.decisionId) || !/^rc-[0-9a-f-]{36}$/u.test(decision.releaseCandidateId) || !instant(decision.decidedAt) || !DIGEST.test(decision.releaseCandidateArtifactDigest) || !DIGEST.test(decision.gateSnapshotDigest) || Object.values(decision.ownerReceiptRefs).some((ref) => !REF.test(ref))) throw new TypeError("GA decision is invalid");
    if (decision.decision === "approve" && REQUIRED_OWNERS.some((owner) => !REF.test(decision.ownerReceiptRefs[owner] ?? ""))) throw new TypeError("GA approval owner receipts are incomplete");
    if (decision.decision === "reject" && Object.keys(decision.ownerReceiptRefs).length === 0) throw new TypeError("GA rejection requires an owner receipt");
    await transaction(this.pool, async (connection) => {
      const candidateRecord = await connection.query<{ record_digest: string }>("SELECT record_digest FROM release_candidates WHERE release_candidate_id=$1", [decision.releaseCandidateId]);
      if (candidateRecord.rows[0]?.record_digest !== decision.releaseCandidateArtifactDigest) throw new Error("GA decision RC artifact digest mismatch");
      const gates = await connection.query<{ gate_id: string; status: string; evidence_ref: string; evidence_digest: string }>("SELECT gate_id,status,evidence_ref,evidence_digest FROM release_gate_results WHERE release_candidate_id=$1 ORDER BY gate_id", [decision.releaseCandidateId]);
      if (gates.rows.length !== 11) throw new Error("GA decision requires a complete RC gate snapshot");
      const canonical = [...gates.rows].sort((a, b) => Number(a.gate_id.slice(5)) - Number(b.gate_id.slice(5))).map((gate) => ({ gateId: gate.gate_id, status: gate.status, evidenceRef: gate.evidence_ref, sha256: gate.evidence_digest }));
      const actualDigest = `sha256:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`;
      if (actualDigest !== decision.gateSnapshotDigest) throw new Error("GA decision gate snapshot digest mismatch");
      if (decision.decision === "approve") {
        const candidate = await connection.query<{ status: string; passed: string | number; total: string | number }>("SELECT c.status,count(*) FILTER (WHERE g.status='passed') AS passed,count(*) AS total FROM release_candidates c JOIN release_gate_results g ON g.release_candidate_id=c.release_candidate_id WHERE c.release_candidate_id=$1 GROUP BY c.status", [decision.releaseCandidateId]);
        const row = candidate.rows[0];
        if (row?.status !== "frozen" || Number(row.passed) !== 11 || Number(row.total) !== 11) throw new Error("GA approval requires a fully passed frozen RC");
      }
      await connection.query("INSERT INTO ga_decisions (decision_id,release_candidate_id,release_candidate_artifact_digest,decision,gate_snapshot_digest,owner_receipts,decided_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)", [decision.decisionId, decision.releaseCandidateId, decision.releaseCandidateArtifactDigest, decision.decision, decision.gateSnapshotDigest, JSON.stringify(decision.ownerReceiptRefs), decision.decidedAt]);
    });
  }
}
