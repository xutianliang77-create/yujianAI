export type ReleaseGateStatusV1 = "passed" | "failed" | "not-run" | "blocked";

export interface ReleaseEvidenceV1 {
  evidenceRef: string;
  sha256: string;
}

export interface SecurityAuditCheckV1 extends ReleaseEvidenceV1 {
  checkId: "secret-scan" | "sast" | "dependency-scan" | "container-scan" | "sbom" | "signature" | "penetration-test" | "compliance-assessment";
  status: ReleaseGateStatusV1;
  criticalFindings: number;
  highFindings: number;
}

export interface SecurityAuditManifestV1 {
  schemaVersion: 1;
  releaseDigest: string;
  sourceCommit: string;
  checks: readonly SecurityAuditCheckV1[];
  outcome: "passed" | "failed" | "incomplete";
  generatedAt: string;
}

export interface ReleaseGateResultV1 extends ReleaseEvidenceV1 {
  gateId: `gate-${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`;
  status: ReleaseGateStatusV1;
}

export interface ReleaseCandidateFreezeV1 {
  schemaVersion: 1;
  releaseCandidateId: string;
  version: string;
  sourceCommit: string;
  artifactManifest: ReleaseEvidenceV1;
  gateResults: readonly ReleaseGateResultV1[];
  status: "frozen" | "rejected";
  frozenAt: string | null;
  createdAt: string;
}

export interface GaDecisionV1 {
  schemaVersion: 1;
  decisionId: string;
  releaseCandidateId: string;
  releaseCandidateArtifactDigest: string;
  decision: "approve" | "reject";
  gateSnapshotDigest: string;
  ownerReceiptRefs: Readonly<Record<string, string>>;
  decidedAt: string;
}

export interface PublicStatusEventV1 {
  schemaVersion: 1;
  eventId: string;
  severity: "p0" | "p1" | "p2";
  status: "investigating" | "identified" | "monitoring" | "resolved";
  affectedCapabilities: readonly string[];
  affectedRegions: readonly string[];
  publicMessage: string;
  startedAt: string;
  nextUpdateAt: string | null;
  resolvedAt: string | null;
  incidentId: string | null;
  postmortemRef: string | null;
}
