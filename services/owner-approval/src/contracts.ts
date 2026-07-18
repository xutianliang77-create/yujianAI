import { createHash } from "node:crypto";
import type {
  OwnerDecision,
  OwnerDecisionReceipt,
  OwnerDecisionSubmission,
  OwnerDecisionTemplate,
  OwnerId,
  OwnerSupersedingDecisionArtifact,
  OwnerSupersedingDecisionSubmission,
  OwnerTaskContract,
} from "./types.js";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const decisionIdPattern = /^p1-m0-04-[a-z0-9-]{3,80}$/u;
const controlCharacters = /[\u0000-\u001f\u007f]/u;

export const OWNER_TASK_CONTRACTS: Readonly<Record<string, OwnerTaskContract>> = {
  "security-evidence": {
    owner: "aaa",
    role: "security-owner",
    title: "安全证据确认",
    summary: "确认零 Critical/High 扫描、残余风险与签名策略。",
    decisions: ["approve", "reject", "time-bound-exception"],
  },
  "redis-release": {
    owner: "bbb",
    role: "release-owner",
    title: "Redis 发布决定",
    summary: "批准或驳回 Redis 候选版本进入后续发布流程。",
    decisions: ["approve", "reject"],
  },
  "registry-kms-freeze": {
    owner: "bbb",
    role: "release-owner",
    title: "Registry / KMS 冻结",
    summary: "确认生产 Registry、KMS key URI、回滚与归档边界。",
    decisions: ["approve", "reject", "approve-with-conditions"],
  },
  "license-notice-source-offer": {
    owner: "ccc",
    role: "legal-owner",
    title: "许可证与源码提供",
    summary: "审阅 LICENSE、NOTICE、source offer 与商标风险。",
    decisions: ["approve", "reject", "approve-with-conditions"],
  },
  "china-distribution": {
    owner: "ddd",
    role: "compliance-owner",
    title: "中国分发合规",
    summary: "审阅中国部署、证据留存、证书续期与单节点风险。",
    decisions: ["approve", "reject", "approve-with-conditions"],
  },
};

export class OwnerApprovalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerApprovalValidationError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OwnerApprovalValidationError("请求必须是 JSON 对象");
  }
  return value as Record<string, unknown>;
}

function cleanText(value: unknown, field: string, minimum: number, maximum: number): string {
  if (typeof value !== "string") throw new OwnerApprovalValidationError(`${field} 必须是文本`);
  const cleaned = value.trim();
  if (cleaned.length < minimum || cleaned.length > maximum || controlCharacters.test(cleaned)) {
    throw new OwnerApprovalValidationError(`${field} 长度必须为 ${minimum}-${maximum} 且不能包含控制字符`);
  }
  return cleaned;
}

function validDate(value: unknown, field: string): string {
  const text = cleanText(value, field, 20, 40);
  if (!Number.isFinite(Date.parse(text))) throw new OwnerApprovalValidationError(`${field} 必须是有效时间`);
  return new Date(text).toISOString();
}

export function parseOwnerDecisionTemplate(value: unknown): OwnerDecisionTemplate {
  const input = record(value);
  const contract = typeof input.decisionType === "string" ? OWNER_TASK_CONTRACTS[input.decisionType] : undefined;
  if (input.schemaVersion !== 1 || input.taskId !== "P1-M0-04-OWNER-DECISION" || contract === undefined) {
    throw new OwnerApprovalValidationError("Owner 决定模板标识无效");
  }
  if (input.personalOwner !== contract.owner || input.role !== contract.role) {
    throw new OwnerApprovalValidationError("Owner 与角色合同不匹配");
  }
  if (typeof input.decisionId !== "string" || !decisionIdPattern.test(input.decisionId)) {
    throw new OwnerApprovalValidationError("decisionId 无效");
  }
  if (input.status !== "awaiting-personal-decision" || input.decision !== null || input.decidedAt !== null
    || input.reason !== null || input.conditions !== null || input.expiresAt !== null) {
    throw new OwnerApprovalValidationError("模板必须保持未决定状态");
  }
  if (!Array.isArray(input.evidence) || input.evidence.length < 2) {
    throw new OwnerApprovalValidationError("证据列表不完整");
  }
  for (const item of input.evidence) {
    const evidence = record(item);
    if (typeof evidence.path !== "string" || evidence.path.length < 10 || !digestPattern.test(String(evidence.sha256))) {
      throw new OwnerApprovalValidationError("证据引用无效");
    }
  }
  if (typeof input.facts !== "object" || input.facts === null || Array.isArray(input.facts)) {
    throw new OwnerApprovalValidationError("事实摘要无效");
  }
  return input as unknown as OwnerDecisionTemplate;
}

export function parseOwnerDecisionSubmission(value: unknown, template: OwnerDecisionTemplate): OwnerDecisionSubmission {
  const input = record(value);
  const known = new Set(["revision", "decision", "reason", "conditions", "expiresAt", "wrappedToken", "confirmEvidenceReviewed"]);
  if (Object.keys(input).some((field) => !known.has(field))) {
    throw new OwnerApprovalValidationError("请求包含未知字段");
  }
  const contract = OWNER_TASK_CONTRACTS[template.decisionType];
  if (contract === undefined || !contract.decisions.includes(input.decision as OwnerDecision)) {
    throw new OwnerApprovalValidationError("该任务不允许此决定");
  }
  if (input.confirmEvidenceReviewed !== true) {
    throw new OwnerApprovalValidationError("必须确认已审阅全部证据");
  }
  const revision = cleanText(input.revision, "revision", 71, 71);
  if (!digestPattern.test(revision)) throw new OwnerApprovalValidationError("revision 无效");
  const reason = cleanText(input.reason, "reason", 20, 2000);
  const wrappedToken = cleanText(input.wrappedToken, "wrappedToken", 20, 2048);
  const needsConditions = input.decision === "approve-with-conditions" || input.decision === "time-bound-exception";
  const conditions = needsConditions ? cleanText(input.conditions, "conditions", 20, 2000) : undefined;
  const expiresAt = input.decision === "time-bound-exception" ? validDate(input.expiresAt, "expiresAt") : undefined;
  return {
    revision,
    decision: input.decision as OwnerDecision,
    reason,
    ...(conditions === undefined ? {} : { conditions }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    wrappedToken,
    confirmEvidenceReviewed: true,
  };
}

export function parseOwnerSupersedingDecisionSubmission(
  value: unknown,
  template: OwnerDecisionTemplate,
): OwnerSupersedingDecisionSubmission {
  const input = record(value);
  const known = new Set([
    "revision", "expectedReceiptSha256", "decision", "reason", "conditions", "expiresAt",
    "supersessionReason", "wrappedToken", "confirmEvidenceReviewed", "confirmOriginalPreserved",
  ]);
  if (Object.keys(input).some((field) => !known.has(field))) {
    throw new OwnerApprovalValidationError("请求包含未知字段");
  }
  if (input.confirmOriginalPreserved !== true) {
    throw new OwnerApprovalValidationError("必须确认原始证据将保持不变");
  }
  const base = parseOwnerDecisionSubmission({
    revision: input.revision,
    decision: input.decision,
    reason: input.reason,
    ...(input.conditions === undefined ? {} : { conditions: input.conditions }),
    ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
    wrappedToken: input.wrappedToken,
    confirmEvidenceReviewed: input.confirmEvidenceReviewed,
  }, template);
  const expectedReceiptSha256 = cleanText(input.expectedReceiptSha256, "expectedReceiptSha256", 71, 71);
  if (!digestPattern.test(expectedReceiptSha256)) {
    throw new OwnerApprovalValidationError("expectedReceiptSha256 无效");
  }
  return {
    ...base,
    expectedReceiptSha256,
    supersessionReason: cleanText(input.supersessionReason, "supersessionReason", 20, 2000),
    confirmOriginalPreserved: true,
  };
}

export function revisionFor(template: OwnerDecisionTemplate): string {
  return `sha256:${createHash("sha256").update(artifactBytes(template)).digest("hex")}`;
}

export function buildDecidedArtifact(
  template: OwnerDecisionTemplate,
  submission: OwnerDecisionSubmission,
  decidedAt = new Date().toISOString(),
): OwnerDecisionTemplate {
  if (submission.revision !== revisionFor(template)) {
    throw new OwnerApprovalValidationError("证据模板已变化，请刷新后重新审阅");
  }
  return {
    ...template,
    status: "ready-for-personal-signature",
    decision: submission.decision,
    decidedAt,
    reason: submission.reason,
    conditions: submission.conditions ?? null,
    expiresAt: submission.expiresAt ?? null,
  };
}

export function buildSupersedingArtifact(
  template: OwnerDecisionTemplate,
  submission: OwnerSupersedingDecisionSubmission,
  previous: Pick<OwnerDecisionReceipt, "artifactSha256" | "recordedAt"> & { receiptSha256: string },
  sequence: number,
  decidedAt = new Date().toISOString(),
): OwnerSupersedingDecisionArtifact {
  if (submission.revision !== revisionFor(template)) {
    throw new OwnerApprovalValidationError("证据模板已变化，请刷新后重新审阅");
  }
  if (submission.expectedReceiptSha256 !== previous.receiptSha256) {
    throw new OwnerApprovalValidationError("当前决定已变化，请刷新后重新审阅");
  }
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new OwnerApprovalValidationError("替代序号无效");
  }
  return {
    schemaVersion: 1,
    taskId: "P1-M0-04-OWNER-SUPERSEDING-DECISION",
    decisionId: template.decisionId,
    decisionType: template.decisionType,
    personalOwner: template.personalOwner,
    role: template.role,
    sequence,
    templateRevision: submission.revision,
    supersedes: {
      receiptSha256: previous.receiptSha256,
      artifactSha256: previous.artifactSha256,
      recordedAt: previous.recordedAt,
    },
    decision: submission.decision,
    decidedAt,
    reason: submission.reason,
    conditions: submission.conditions ?? null,
    expiresAt: submission.expiresAt ?? null,
    supersessionReason: submission.supersessionReason,
    evidence: template.evidence,
    facts: template.facts,
  };
}

export function artifactBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function isOwnerId(value: string): value is OwnerId {
  return value === "aaa" || value === "bbb" || value === "ccc" || value === "ddd";
}
