import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  OWNER_TASK_CONTRACTS,
  parseOwnerDecisionTemplate,
  revisionFor,
} from "./contracts.js";
import type {
  OwnerApprovalHistoryEntry,
  OwnerApprovalReceipt,
  OwnerDecisionReceipt,
  OwnerDecisionTemplate,
  OwnerId,
  OwnerSupersessionReceipt,
} from "./types.js";
import type { StoredOwnerDecision } from "./evidence-store.js";

interface OwnerKeyRecord {
  personalOwner: OwnerId;
  role: string;
  keyUri: string;
  publicKeySha256: string;
  exportable: false;
  allowPlaintextBackup: false;
}

export interface OwnerTaskView {
  decisionId: string;
  decisionType: string;
  personalOwner: OwnerId;
  role: string;
  title: string;
  summary: string;
  allowedDecisions: readonly string[];
  status: "awaiting-personal-decision" | "signed-decision-recorded";
  revision: string;
  evidence: OwnerDecisionTemplate["evidence"];
  facts: OwnerDecisionTemplate["facts"];
  currentSequence: number;
  currentReceiptSha256?: string;
  receipt?: PublicOwnerReceipt;
  history: OwnerApprovalHistoryEntry[];
}

type PublicOwnerReceipt = Omit<OwnerApprovalReceipt, "signature"> | Omit<OwnerSupersessionReceipt, "signature">;

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
}

function parseKeyRegistry(value: unknown): Map<OwnerId, OwnerKeyRecord> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("owner key registry is invalid");
  const input = value as Record<string, unknown>;
  if (input.taskId !== "P1-M0-04-OWNER-KEY-REGISTRY" || !Array.isArray(input.owners)) throw new Error("owner key registry identity is invalid");
  const result = new Map<OwnerId, OwnerKeyRecord>();
  for (const value of input.owners) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("owner key record is invalid");
    const owner = value as unknown as OwnerKeyRecord;
    if (!(["aaa", "bbb", "ccc", "ddd"] as const).includes(owner.personalOwner)
      || owner.keyUri !== `openbao://yujian-owner-${owner.personalOwner}`
      || !/^sha256:[0-9a-f]{64}$/u.test(owner.publicKeySha256)
      || owner.exportable !== false || owner.allowPlaintextBackup !== false) {
      throw new Error("owner key record does not satisfy the approval boundary");
    }
    result.set(owner.personalOwner, owner);
  }
  if (result.size !== 4) throw new Error("owner key registry must contain four independent keys");
  return result;
}

export class OwnerApprovalCatalog {
  readonly templates: ReadonlyMap<string, OwnerDecisionTemplate>;
  readonly keys: ReadonlyMap<OwnerId, OwnerKeyRecord>;

  private constructor(
    templates: ReadonlyMap<string, OwnerDecisionTemplate>,
    keys: ReadonlyMap<OwnerId, OwnerKeyRecord>,
  ) {
    this.templates = templates;
    this.keys = keys;
  }

  static async load(templateRoot: string, keyRegistryPath: string): Promise<OwnerApprovalCatalog> {
    const files = (await readdir(templateRoot)).filter((name) => name.endsWith("-decision.json")).sort();
    const templates = new Map<string, OwnerDecisionTemplate>();
    for (const file of files) {
      const path = resolve(templateRoot, file);
      const template = parseOwnerDecisionTemplate(parseJson(await readFile(path, "utf8"), path));
      if (templates.has(template.decisionId)) throw new Error(`duplicate owner decision id: ${template.decisionId}`);
      templates.set(template.decisionId, template);
    }
    if (templates.size !== Object.keys(OWNER_TASK_CONTRACTS).length) {
      throw new Error("owner approval catalog must contain all five decision templates");
    }
    const keys = parseKeyRegistry(parseJson(await readFile(keyRegistryPath, "utf8"), keyRegistryPath));
    for (const template of templates.values()) {
      const key = keys.get(template.personalOwner);
      if (key?.role !== template.role) throw new Error(`owner key role mismatch for ${template.personalOwner}`);
    }
    return new OwnerApprovalCatalog(templates, keys);
  }

  get(decisionId: string): OwnerDecisionTemplate | undefined {
    return this.templates.get(decisionId);
  }

  publicKeySha256(owner: OwnerId): string {
    const key = this.keys.get(owner);
    if (key === undefined) throw new Error(`owner key is missing: ${owner}`);
    return key.publicKeySha256;
  }

  view(template: OwnerDecisionTemplate, records: readonly StoredOwnerDecision[] = []): OwnerTaskView {
    const contract = OWNER_TASK_CONTRACTS[template.decisionType];
    if (contract === undefined) throw new Error(`owner task contract is missing: ${template.decisionType}`);
    const current = records.at(-1);
    return {
      decisionId: template.decisionId,
      decisionType: template.decisionType,
      personalOwner: template.personalOwner,
      role: template.role,
      title: contract.title,
      summary: contract.summary,
      allowedDecisions: contract.decisions,
      status: current === undefined ? "awaiting-personal-decision" : "signed-decision-recorded",
      revision: revisionFor(template),
      evidence: template.evidence,
      facts: template.facts,
      currentSequence: current?.sequence ?? 0,
      history: records.map(historyEntry),
      ...(current === undefined ? {} : {
        currentReceiptSha256: current.receiptSha256,
        receipt: withoutSignature(current.receipt),
      }),
    };
  }
}

function withoutSignature(receipt: OwnerDecisionReceipt): PublicOwnerReceipt {
  const { signature: _signature, ...publicReceipt } = receipt;
  return publicReceipt as PublicOwnerReceipt;
}

function historyEntry(record: StoredOwnerDecision): OwnerApprovalHistoryEntry {
  const receipt = record.receipt;
  return {
    sequence: record.sequence,
    receiptSha256: record.receiptSha256,
    artifactSha256: receipt.artifactSha256,
    decision: receipt.decision,
    decidedAt: receipt.decidedAt,
    recordedAt: receipt.recordedAt,
    keyUri: receipt.keyUri,
    keyVersion: receipt.keyVersion,
    signatureVerified: true,
    credentialRevoked: true,
    ...(receipt.taskId === "P1-M0-04-PERSONAL-OWNER-SUPERSESSION" ? {
      supersedesReceiptSha256: receipt.supersedesReceiptSha256,
      supersessionReason: receipt.supersessionReason,
    } : {}),
  };
}
