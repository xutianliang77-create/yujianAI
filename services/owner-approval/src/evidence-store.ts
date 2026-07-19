import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { artifactBytes } from "./contracts.js";
import type {
  OwnerApprovalReceipt,
  OwnerDecisionReceipt,
  OwnerDecisionTemplate,
  OwnerSignature,
  OwnerSupersedingDecisionArtifact,
  OwnerSupersessionReceipt,
} from "./types.js";

type OwnerDecisionArtifact = OwnerDecisionTemplate | OwnerSupersedingDecisionArtifact;

export interface StoredOwnerDecision {
  sequence: number;
  receiptSha256: string;
  artifact: OwnerDecisionArtifact;
  receipt: OwnerDecisionReceipt;
}

export class OwnerApprovalConflictError extends Error {
  constructor(message = "该任务已经记录决定或正在处理") {
    super(message);
    this.name = "OwnerApprovalConflictError";
  }
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseJson(bytes: Buffer, path: string): Record<string, unknown> {
  try {
    const value = JSON.parse(bytes.toString("utf8")) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new Error(`owner approval evidence is not valid JSON: ${path}`);
  }
}

function validateIdentity(
  decisionId: string,
  artifact: Record<string, unknown>,
  receipt: Record<string, unknown>,
): void {
  if (artifact.decisionId !== decisionId || receipt.decisionId !== decisionId
    || artifact.decisionType !== receipt.decisionType
    || artifact.personalOwner !== receipt.personalOwner
    || artifact.role !== receipt.role
    || artifact.decision !== receipt.decision
    || artifact.decidedAt !== receipt.decidedAt) {
    throw new Error(`owner approval evidence identity mismatch: ${decisionId}`);
  }
}

async function loadRecord(directory: string, decisionId: string, sequence: number): Promise<StoredOwnerDecision> {
  const decisionPath = resolve(directory, "decision.json");
  const resultPath = resolve(directory, "result.json");
  const [decisionBytes, resultBytes] = await Promise.all([readFile(decisionPath), readFile(resultPath)]);
  const artifact = parseJson(decisionBytes, decisionPath);
  const receipt = parseJson(resultBytes, resultPath);
  validateIdentity(decisionId, artifact, receipt);
  if (receipt.schemaVersion !== 1
    || receipt.signatureVerified !== true || receipt.credentialRevoked !== true
    || receipt.gateUpdated !== false || receipt.productionReleaseAuthorized !== false
    || typeof receipt.signature !== "string" || receipt.signature.length < 10
    || typeof receipt.artifactSha256 !== "string" || receipt.artifactSha256 !== sha256(decisionBytes)) {
    throw new Error(`owner approval receipt integrity mismatch: ${decisionId}`);
  }
  if (sequence === 0) {
    if (artifact.taskId !== "P1-M0-04-OWNER-DECISION"
      || receipt.taskId !== "P1-M0-04-PERSONAL-OWNER-SIGNATURE") {
      throw new Error(`owner approval original record is invalid: ${decisionId}`);
    }
  } else if (artifact.taskId !== "P1-M0-04-OWNER-SUPERSEDING-DECISION"
    || receipt.taskId !== "P1-M0-04-PERSONAL-OWNER-SUPERSESSION"
    || artifact.sequence !== sequence || receipt.supersessionSequence !== sequence) {
    throw new Error(`owner approval supersession sequence is invalid: ${decisionId}`);
  }
  return {
    sequence,
    receiptSha256: sha256(resultBytes),
    artifact: artifact as unknown as OwnerDecisionArtifact,
    receipt: receipt as unknown as OwnerDecisionReceipt,
  };
}

export class OwnerApprovalEvidenceStore {
  constructor(private readonly root: string) {}

  async prepare(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
  }

  async history(decisionId: string): Promise<StoredOwnerDecision[]> {
    let original: StoredOwnerDecision;
    try {
      original = await loadRecord(resolve(this.root, decisionId), decisionId, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const records = [original];
    const supersessionsRoot = resolve(this.root, decisionId, "supersessions");
    let directories;
    try {
      directories = await readdir(supersessionsRoot, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return records;
      throw error;
    }
    const names = directories
      .filter((entry) => entry.isDirectory() && /^\d{6}$/u.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    for (let index = 0; index < names.length; index += 1) {
      const sequence = index + 1;
      if (names[index] !== String(sequence).padStart(6, "0")) {
        throw new Error(`owner approval supersession chain is not contiguous: ${decisionId}`);
      }
      const record = await loadRecord(resolve(supersessionsRoot, names[index]!), decisionId, sequence);
      const previous = records[records.length - 1]!;
      const artifact = record.artifact as OwnerSupersedingDecisionArtifact;
      const receipt = record.receipt as OwnerSupersessionReceipt;
      if (artifact.supersedes.receiptSha256 !== previous.receiptSha256
        || artifact.supersedes.artifactSha256 !== previous.receipt.artifactSha256
        || artifact.supersedes.recordedAt !== previous.receipt.recordedAt
        || receipt.supersedesReceiptSha256 !== previous.receiptSha256
        || receipt.supersedesArtifactSha256 !== previous.receipt.artifactSha256
        || artifact.templateRevision !== original.receipt.templateRevision
        || receipt.templateRevision !== original.receipt.templateRevision
        || artifact.supersessionReason !== receipt.supersessionReason
        || artifact.personalOwner !== original.receipt.personalOwner
        || artifact.role !== original.receipt.role
        || artifact.decisionType !== original.receipt.decisionType) {
        throw new Error(`owner approval supersession chain is invalid: ${decisionId}`);
      }
      records.push(record);
    }
    return records;
  }

  async receipt(decisionId: string): Promise<OwnerDecisionReceipt | undefined> {
    const records = await this.history(decisionId);
    return records.at(-1)?.receipt;
  }

  async recordSigned(
    decisionId: string,
    producer: () => Promise<{
      artifact: OwnerDecisionTemplate;
      signature: OwnerSignature;
      templateRevision: string;
      publicKeySha256: string;
    }>,
  ): Promise<OwnerApprovalReceipt> {
    return this.withLock(decisionId, async () => {
      if ((await this.history(decisionId)).length > 0) throw new OwnerApprovalConflictError();
      const { artifact, signature, templateRevision, publicKeySha256 } = await producer();
      if (artifact.decisionId !== decisionId) throw new Error("approval producer returned a different decision id");
      const bytes = artifactBytes(artifact);
      const receipt: OwnerApprovalReceipt = {
        schemaVersion: 1,
        taskId: "P1-M0-04-PERSONAL-OWNER-SIGNATURE",
        decisionId: artifact.decisionId,
        decisionType: artifact.decisionType,
        personalOwner: artifact.personalOwner,
        role: artifact.role,
        decision: artifact.decision!,
        decidedAt: artifact.decidedAt!,
        recordedAt: new Date().toISOString(),
        artifactSha256: sha256(bytes),
        templateRevision,
        keyUri: signature.keyUri,
        keyVersion: signature.keyVersion,
        publicKeySha256,
        signature: signature.signature,
        signatureVerified: true,
        credentialRevoked: true,
        gateUpdated: false,
        productionReleaseAuthorized: false,
      };
      await this.writeRecord(resolve(this.root, decisionId), bytes, signature, receipt);
      return receipt;
    });
  }

  async recordSuperseding(
    decisionId: string,
    expectedReceiptSha256: string,
    producer: (previous: StoredOwnerDecision, sequence: number) => Promise<{
      artifact: OwnerSupersedingDecisionArtifact;
      signature: OwnerSignature;
      publicKeySha256: string;
    }>,
  ): Promise<OwnerSupersessionReceipt> {
    return this.withLock(decisionId, async () => {
      const records = await this.history(decisionId);
      const previous = records.at(-1);
      if (previous === undefined) throw new OwnerApprovalConflictError("必须先记录原始决定");
      if (previous.receiptSha256 !== expectedReceiptSha256) {
        throw new OwnerApprovalConflictError("当前决定已变化，请刷新后重新审阅");
      }
      const sequence = previous.sequence + 1;
      const { artifact, signature, publicKeySha256 } = await producer(previous, sequence);
      if (artifact.decisionId !== decisionId || artifact.sequence !== sequence) {
        throw new Error("approval producer returned a different supersession identity");
      }
      const bytes = artifactBytes(artifact);
      const receipt: OwnerSupersessionReceipt = {
        schemaVersion: 1,
        taskId: "P1-M0-04-PERSONAL-OWNER-SUPERSESSION",
        decisionId: artifact.decisionId,
        decisionType: artifact.decisionType,
        personalOwner: artifact.personalOwner,
        role: artifact.role,
        decision: artifact.decision,
        decidedAt: artifact.decidedAt,
        recordedAt: new Date().toISOString(),
        artifactSha256: sha256(bytes),
        templateRevision: artifact.templateRevision,
        supersessionSequence: sequence,
        supersedesReceiptSha256: previous.receiptSha256,
        supersedesArtifactSha256: previous.receipt.artifactSha256,
        supersessionReason: artifact.supersessionReason,
        keyUri: signature.keyUri,
        keyVersion: signature.keyVersion,
        publicKeySha256,
        signature: signature.signature,
        signatureVerified: true,
        credentialRevoked: true,
        gateUpdated: false,
        productionReleaseAuthorized: false,
      };
      const directory = resolve(this.root, decisionId, "supersessions", String(sequence).padStart(6, "0"));
      await this.writeRecord(directory, bytes, signature, receipt);
      return receipt;
    });
  }

  private async writeRecord(
    target: string,
    decisionBytes: Buffer,
    signature: OwnerSignature,
    receipt: OwnerDecisionReceipt,
  ): Promise<void> {
    const parent = resolve(target, "..");
    await mkdir(parent, { recursive: true, mode: 0o700 });
    const temporary = resolve(parent, `.tmp-${randomUUID()}`);
    try {
      await mkdir(temporary, { mode: 0o700 });
      await writeFile(resolve(temporary, "decision.json"), decisionBytes, { mode: 0o600 });
      await writeFile(resolve(temporary, "signature.json"), artifactBytes(signature), { mode: 0o600 });
      await writeFile(resolve(temporary, "result.json"), artifactBytes(receipt), { mode: 0o600 });
      try {
        await rename(temporary, target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST" || (error as NodeJS.ErrnoException).code === "ENOTEMPTY") {
          throw new OwnerApprovalConflictError();
        }
        throw error;
      }
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  private async withLock<T>(decisionId: string, operation: () => Promise<T>): Promise<T> {
    await this.prepare();
    const lockPath = resolve(this.root, `${decisionId}.lock`);
    let lock;
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new OwnerApprovalConflictError();
      throw error;
    }
    try {
      return await operation();
    } finally {
      await lock.close();
      await unlink(lockPath).catch(() => undefined);
    }
  }
}
