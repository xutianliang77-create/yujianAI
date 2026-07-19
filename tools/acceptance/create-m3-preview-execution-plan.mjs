#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const policyPath = resolve(root, "infra/acceptance/m3-preview-evidence-policy.json");
const policyBytes = readFileSync(policyPath);
const policy = JSON.parse(policyBytes.toString("utf8"));
const output = resolve(process.env.YUJIAN_M3_EXECUTION_PLAN ?? process.argv[2] ?? "outputs/m3-preview/execution-plan.json");
const gitCommit = process.env.GIT_COMMIT ?? "unknown";
if (gitCommit !== "unknown" && !/^[0-9a-f]{40}$/u.test(gitCommit)) throw new Error("GIT_COMMIT must be a full lowercase hash");
const runId = `m3-preview-${new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
const carrierTasks = policy.carrierNetwork.requiredCarriers.flatMap((carrier) =>
  policy.carrierNetwork.requiredRegions.map((region) => ({
    taskId: `carrier-${carrier}-${region}`,
    carrier,
    region,
    minimumJoinAttempts: policy.carrierNetwork.minimumJoinAttemptsPerCell,
    status: "pending",
    evidence: null,
  })),
);
const plan = {
  schemaVersion: 1,
  evidenceType: "m3-preview-execution-plan",
  runId,
  generatedAt: new Date().toISOString(),
  target: { gitCommit },
  policy: {
    path: "infra/acceptance/m3-preview-evidence-policy.json",
    sha256: `sha256:${createHash("sha256").update(policyBytes).digest("hex")}`,
  },
  tasks: {
    carrierNetwork: carrierTasks,
    designPartnerTrials: Array.from({ length: policy.designPartners.minimumClosedTrials }, (_, index) => ({
      taskId: `design-partner-${index + 1}`,
      status: "pending",
      partnerId: null,
      evidence: null,
    })),
    stability: policy.reliability.requiredStabilityHours.map((durationHours) => ({
      taskId: `stability-${durationHours}h`,
      durationHours,
      status: "pending",
      evidence: null,
    })),
    faultInjection: policy.reliability.requiredFaultScenarios.map((scenario) => ({
      taskId: `fault-${scenario}`,
      scenario,
      status: "pending",
      maintenanceApprovalRequired: true,
      evidence: null,
    })),
  },
  gateStatus: "not-executed",
  productionReleaseAuthorized: false,
};
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ runId, plan: output, gateStatus: plan.gateStatus })}\n`);
