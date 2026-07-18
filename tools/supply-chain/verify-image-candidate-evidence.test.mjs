import assert from "node:assert/strict";
import test from "node:test";

import { validateCandidateEvidence } from "./verify-image-candidate-evidence.mjs";

test("accepts a signed candidate set that cannot authorize deployment", () => {
  assert.doesNotThrow(() => validateCandidateEvidence(fixture()));
});

test("rejects an eligible decision when Critical findings remain", () => {
  const evidence = fixture();
  evidence.candidates[1].decision = "eligible-for-regression";
  assert.throws(() => validateCandidateEvidence(evidence), /decision is inconsistent/u);
});

test("rejects a runtime switch hidden in candidate evidence", () => {
  const evidence = fixture();
  evidence.currentRuntime.unchanged = false;
  assert.throws(() => validateCandidateEvidence(evidence), /runtime must remain unchanged/u);
});

test("rejects a missing personal Owner nomination record", () => {
  const evidence = fixture();
  evidence.ownerNominations.pop();
  assert.throws(() => validateCandidateEvidence(evidence), /nomination is missing/u);
});

test("accepts user-assigned personal Owners while signoff remains pending", () => {
  const evidence = fixture();
  for (const owner of evidence.ownerNominations) {
    owner.personalOwner = `person-${owner.role}`;
    owner.appointedBy = "project-approver";
    owner.appointedAt = "2026-07-18";
    owner.status = "assigned-pending-signoff";
  }
  assert.doesNotThrow(() => validateCandidateEvidence(evidence));
});

test("accepts completed isolated regression without authorizing deployment", () => {
  const evidence = fixture();
  evidence.candidates[0].regression = regression();
  evidence.candidates[0].decision = "regression-passed-awaiting-deployment-approval";
  evidence.summary.eligibleForRegression = 0;
  evidence.summary.regressionPassed = 1;
  assert.doesNotThrow(() => validateCandidateEvidence(evidence));

  evidence.candidates[0].regression.deploymentApproval = "approved";
  assert.throws(() => validateCandidateEvidence(evidence), /cannot authorize deployment/u);
});

function fixture() {
  return {
    schemaVersion: 1,
    taskId: "P1-M0-04-CANDIDATES",
    runId: "p1-m0-04-candidates-20260718T084500Z",
    generatedAt: "2026-07-18T08:12:53Z",
    status: "blocked",
    deploymentAllowed: false,
    environment: {
      server: "beelink",
      platform: "linux/amd64",
      evidenceRoot: remote("run"),
      reportFiles: 20,
      reportMode: "0600",
    },
    scope: {
      manifest: "infra/upstream/p1-image-candidates.json",
      manifestSha256: sha(),
      runnerSha256: sha(),
    },
    vulnerabilityDatabase: {
      builtAt: "2026-07-18T06:48:35Z",
      checksum: sha(),
      sameAsCurrentImageRun: true,
    },
    tools: [tool("syft"), tool("grype"), tool("cosign")],
    candidates: [
      candidate("redis", 0, "eligible-for-regression"),
      candidate("postgres", 1, "blocked"),
      candidate("openbao", 2, "blocked"),
    ],
    summary: { eligibleForRegression: 1, regressionPassed: 0, blocked: 2, totalCriticalMatchesAcrossAllAlternatives: 3 },
    signature: {
      statementPath: remote("statement.json"),
      statementSha256: sha(),
      bundlePath: remote("statement.sigstore.json"),
      bundleSha256: sha(),
      publicKeyPath: remote("public.pem"),
      publicKeySha256: sha(),
      verificationLog: remote("verify.log"),
      verified: true,
    },
    currentRuntime: {
      unchanged: true,
      runningReferences: {
        redis: `redis:1@${sha()}`,
        postgres: `postgres:1@${sha()}`,
        openbao: `openbao:1@${sha()}`,
      },
      restartCount: 0,
    },
    ownerNominations: [
      nomination("compliance-owner"),
      nomination("legal-owner"),
      nomination("release-owner"),
      nomination("security-owner"),
    ],
    gate: {
      runtimeSwitch: "not-authorized",
      currentImageGate: "blocked",
      productionRelease: "blocked",
    },
  };
}

function candidate(id, critical, decision) {
  return {
    id,
    currentReference: `example/${id}:0@${sha()}`,
    reference: `example/${id}:1@${sha()}`,
    registryDigest: sha(),
    localImageId: sha(),
    platform: "linux/amd64",
    sbom: { spdxVersion: "SPDX-2.3", packages: 2, path: remote(`${id}.spdx.json`), sha256: sha() },
    vulnerabilityScan: { path: remote(`${id}.grype.json`), sha256: sha(), counts: counts(critical) },
    licensesNoAssertion: 1,
    decision,
    requiredBeforeDeployment: "run regression",
  };
}

function nomination(role) {
  return { role, personalOwner: null, status: "awaiting-user-nomination" };
}

function regression() {
  const phase = {
    rateAttempts: 100,
    rateAllowed: 20,
    quotaAttempts: 30,
    quotaSuccessful: 3,
    lease: "single-owner",
  };
  return {
    status: "passed",
    runId: "p1-m0-04-redis-regression-20260718T101047Z",
    generatedAt: "2026-07-18T10:11:12Z",
    reportPath: remote("p1-m0-04-redis-regression-20260718T101047Z/report.json"),
    reportSha256: sha(),
    source: {
      repositoryCommit: "a".repeat(40),
      nodeRunnerSha256: sha(),
      shellRunnerSha256: sha(),
    },
    phases: { initial: { ...phase }, postRestart: { ...phase }, postRebuild: { ...phase } },
    persistence: {
      aofMarkerRecovered: true,
      containerRestart: true,
      containerDeleteRecreate: true,
      finalDbSize: 0,
    },
    isolation: {
      loopbackOnly: true,
      currentRuntimeSwitched: false,
      candidateContainerRemoved: true,
      protectedRestartCountUnchanged: true,
    },
    deploymentApproval: "not-granted",
  };
}

function counts(critical) {
  return { negligible: 0, low: 0, medium: 0, high: 0, critical, unknown: 0 };
}

function tool(name) {
  return { name, version: "1.0.0", sha256: sha(), checksumVerified: true };
}

function remote(file) {
  return `remote:/data/models/yujianAI/evidence/p1-m0-04/${file}`;
}

function sha() {
  return `sha256:${"a".repeat(64)}`;
}
