export type OwnerId = "aaa" | "bbb" | "ccc" | "ddd";

export type OwnerRole =
  | "security-owner"
  | "release-owner"
  | "legal-owner"
  | "compliance-owner";

export type OwnerDecision =
  | "approve"
  | "reject"
  | "approve-with-conditions"
  | "time-bound-exception";

export interface OwnerEvidenceReference {
  path: string;
  sha256: string;
}

export interface OwnerDecisionTemplate {
  schemaVersion: 1;
  taskId: "P1-M0-04-OWNER-DECISION";
  decisionId: string;
  personalOwner: OwnerId;
  role: OwnerRole;
  decisionType: string;
  status: "awaiting-personal-decision" | "ready-for-personal-signature";
  decision: OwnerDecision | null;
  decidedAt: string | null;
  reason: string | null;
  conditions: string | null;
  expiresAt: string | null;
  evidence: readonly OwnerEvidenceReference[];
  facts: Readonly<Record<string, unknown>>;
}

export interface OwnerDecisionSubmission {
  revision: string;
  decision: OwnerDecision;
  reason: string;
  conditions?: string;
  expiresAt?: string;
  wrappedToken: string;
  confirmEvidenceReviewed: true;
}

export interface OwnerSupersedingDecisionSubmission extends OwnerDecisionSubmission {
  expectedReceiptSha256: string;
  supersessionReason: string;
  confirmOriginalPreserved: true;
}

export interface OwnerTaskContract {
  owner: OwnerId;
  role: OwnerRole;
  title: string;
  summary: string;
  decisions: readonly OwnerDecision[];
}

export interface OwnerSignature {
  keyUri: string;
  keyVersion: number;
  signature: string;
  verified: true;
  credentialRevoked: true;
}

export interface OwnerApprovalReceipt {
  schemaVersion: 1;
  taskId: "P1-M0-04-PERSONAL-OWNER-SIGNATURE";
  decisionId: string;
  decisionType: string;
  personalOwner: OwnerId;
  role: OwnerRole;
  decision: OwnerDecision;
  decidedAt: string;
  recordedAt: string;
  artifactSha256: string;
  templateRevision: string;
  keyUri: string;
  keyVersion: number;
  publicKeySha256: string;
  signature: string;
  signatureVerified: true;
  credentialRevoked: true;
  gateUpdated: false;
  productionReleaseAuthorized: false;
}

export interface OwnerSupersedingDecisionArtifact {
  schemaVersion: 1;
  taskId: "P1-M0-04-OWNER-SUPERSEDING-DECISION";
  decisionId: string;
  decisionType: string;
  personalOwner: OwnerId;
  role: OwnerRole;
  sequence: number;
  templateRevision: string;
  supersedes: {
    receiptSha256: string;
    artifactSha256: string;
    recordedAt: string;
  };
  decision: OwnerDecision;
  decidedAt: string;
  reason: string;
  conditions: string | null;
  expiresAt: string | null;
  supersessionReason: string;
  evidence: readonly OwnerEvidenceReference[];
  facts: Readonly<Record<string, unknown>>;
}

export interface OwnerSupersessionReceipt {
  schemaVersion: 1;
  taskId: "P1-M0-04-PERSONAL-OWNER-SUPERSESSION";
  decisionId: string;
  decisionType: string;
  personalOwner: OwnerId;
  role: OwnerRole;
  decision: OwnerDecision;
  decidedAt: string;
  recordedAt: string;
  artifactSha256: string;
  templateRevision: string;
  supersessionSequence: number;
  supersedesReceiptSha256: string;
  supersedesArtifactSha256: string;
  supersessionReason: string;
  keyUri: string;
  keyVersion: number;
  publicKeySha256: string;
  signature: string;
  signatureVerified: true;
  credentialRevoked: true;
  gateUpdated: false;
  productionReleaseAuthorized: false;
}

export type OwnerDecisionReceipt = OwnerApprovalReceipt | OwnerSupersessionReceipt;

export interface OwnerApprovalHistoryEntry {
  sequence: number;
  receiptSha256: string;
  artifactSha256: string;
  decision: OwnerDecision;
  decidedAt: string;
  recordedAt: string;
  keyUri: string;
  keyVersion: number;
  signatureVerified: true;
  credentialRevoked: true;
  supersedesReceiptSha256?: string;
  supersessionReason?: string;
}
