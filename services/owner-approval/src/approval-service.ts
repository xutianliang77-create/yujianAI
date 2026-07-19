import {
  artifactBytes,
  buildDecidedArtifact,
  buildSupersedingArtifact,
  isOwnerId,
  parseOwnerDecisionSubmission,
  parseOwnerSupersedingDecisionSubmission,
} from "./contracts.js";
import { OwnerApprovalCatalog, type OwnerTaskView } from "./catalog.js";
import { OwnerApprovalConflictError, OwnerApprovalEvidenceStore } from "./evidence-store.js";
import type { OwnerSigner } from "./openbao-signer.js";
import type { OwnerApprovalReceipt, OwnerId, OwnerSignature, OwnerSupersessionReceipt } from "./types.js";

export class OwnerApprovalNotFoundError extends Error {
  constructor() {
    super("审批任务不存在");
    this.name = "OwnerApprovalNotFoundError";
  }
}

export class OwnerApprovalService {
  constructor(
    private readonly catalog: OwnerApprovalCatalog,
    private readonly evidence: OwnerApprovalEvidenceStore,
    private readonly signer: OwnerSigner,
  ) {}

  async list(owner?: string): Promise<OwnerTaskView[]> {
    if (owner !== undefined && !isOwnerId(owner)) throw new OwnerApprovalNotFoundError();
    const tasks: OwnerTaskView[] = [];
    for (const template of this.catalog.templates.values()) {
      if (owner !== undefined && template.personalOwner !== owner) continue;
      tasks.push(this.catalog.view(template, await this.evidence.history(template.decisionId)));
    }
    return tasks;
  }

  async decide(decisionId: string, body: unknown): Promise<OwnerApprovalReceipt> {
    const template = this.catalog.get(decisionId);
    if (template === undefined) throw new OwnerApprovalNotFoundError();
    const submission = parseOwnerDecisionSubmission(body, template);
    return this.evidence.recordSigned(decisionId, async () => {
      const artifact = buildDecidedArtifact(template, submission);
      const signature = await this.signer.sign({
        owner: template.personalOwner,
        artifact: artifactBytes(artifact),
        wrappedToken: submission.wrappedToken,
      });
      ensureOwnerSignature(template.personalOwner, signature);
      return {
        artifact,
        signature,
        templateRevision: submission.revision,
        publicKeySha256: this.catalog.publicKeySha256(template.personalOwner as OwnerId),
      };
    });
  }

  async supersede(decisionId: string, body: unknown): Promise<OwnerSupersessionReceipt> {
    const template = this.catalog.get(decisionId);
    if (template === undefined) throw new OwnerApprovalNotFoundError();
    const submission = parseOwnerSupersedingDecisionSubmission(body, template);
    return this.evidence.recordSuperseding(decisionId, submission.expectedReceiptSha256, async (previous, sequence) => {
      const artifact = buildSupersedingArtifact(template, submission, {
        receiptSha256: previous.receiptSha256,
        artifactSha256: previous.receipt.artifactSha256,
        recordedAt: previous.receipt.recordedAt,
      }, sequence);
      const signature = await this.signer.sign({
        owner: template.personalOwner,
        artifact: artifactBytes(artifact),
        wrappedToken: submission.wrappedToken,
      });
      ensureOwnerSignature(template.personalOwner, signature);
      return {
        artifact,
        signature,
        publicKeySha256: this.catalog.publicKeySha256(template.personalOwner as OwnerId),
      };
    });
  }
}

function ensureOwnerSignature(owner: OwnerId, signature: OwnerSignature): void {
  if (signature.keyUri !== `openbao://yujian-owner-${owner}`
    || signature.verified !== true || signature.credentialRevoked !== true) {
    throw new OwnerApprovalConflictError("签名结果未满足 Owner 隔离要求");
  }
}
