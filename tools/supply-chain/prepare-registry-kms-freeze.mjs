import { createHash } from "node:crypto";
import { mkdirSync, openSync, readFileSync, writeFileSync, closeSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validateRegistryKmsFreezePolicy } from "./verify-registry-kms-freeze.mjs";

const policyPath = resolve(process.env.P1_M0_04_REGISTRY_KMS_POLICY ?? "infra/registry/beelink/freeze-policy.json");
const ociPath = resolve(process.env.P1_M0_04_PRODUCTION_OCI_FILE ?? "docs/acceptance/p1-production-oci-evidence.json");
const ownerPath = resolve(process.env.P1_M0_04_OWNER_SIGNOFF_FILE ?? "docs/acceptance/p1-m0-04-owner-signoffs.json");
const output = resolve(process.env.P1_M0_04_REGISTRY_KMS_PLAN ?? "/data/models/yujianAI/registry/evidence/registry-kms-freeze/plan.json");
const policyBytes = readFileSync(policyPath);
const policy = JSON.parse(policyBytes);
validateRegistryKmsFreezePolicy(policy, JSON.parse(readFileSync(ociPath, "utf8")), JSON.parse(readFileSync(ownerPath, "utf8")));

const plan = {
  schemaVersion: 1,
  taskId: "P1-M0-04-REGISTRY-KMS-FREEZE-PLAN",
  generatedAt: new Date().toISOString(),
  policyId: policy.policyId,
  policySha256: `sha256:${createHash("sha256").update(policyBytes).digest("hex")}`,
  mode: "append-only-plan-no-runtime-mutation",
  stages: policy.evidence.requiredStages.map((stage, index) => ({ order: index + 1, stage, status: "planned-not-executed" })),
  registry: { host: policy.registry.host, runtimeImage: policy.registry.runtimeImage, artifacts: policy.artifacts },
  kms: { uri: policy.kms.uri, runtimeImage: policy.kms.runtimeImage, recoveryMode: policy.kms.recovery.mode },
  ownerDecision: policy.ownerDecision,
  productionReleaseAuthorized: false,
};

mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
const descriptor = openSync(output, "wx", 0o600);
try {
  writeFileSync(descriptor, `${JSON.stringify(plan, null, 2)}\n`);
} finally {
  closeSync(descriptor);
}
process.stdout.write(`Registry/KMS append-only plan created: ${output}\n`);
