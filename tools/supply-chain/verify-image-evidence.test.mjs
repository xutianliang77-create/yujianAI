import assert from "node:assert/strict";
import test from "node:test";

import { validateImageEvidence } from "./verify-image-evidence.mjs";

test("accepts signed image evidence with no unwaived critical vulnerabilities", () => {
  assert.doesNotThrow(() => validateImageEvidence(fixture()));
});

test("rejects a technical pass when critical vulnerabilities remain", () => {
  const evidence = fixture();
  evidence.images[0].vulnerabilityScan.counts.critical = 1;
  evidence.images[0].vulnerabilityScan.unwaivedCritical = 1;
  evidence.images[0].vulnerabilityScan.gate = "blocked";
  assert.throws(() => validateImageEvidence(evidence), /cannot pass with unwaived critical vulnerabilities/u);
});

test("rejects a formal gate pass while personal owners are unassigned", () => {
  const evidence = fixture();
  evidence.gate.formalGate0 = "passed";
  assert.throws(() => validateImageEvidence(evidence), /formal Gate 0 cannot pass/u);
});

test("release mode rejects structurally valid but blocked evidence", () => {
  assert.throws(() => validateImageEvidence(fixture(), { requirePass: true }), /release gate is not passed/u);
});

test("rejects an assigned personal Owner without appointment evidence", () => {
  const evidence = fixture();
  evidence.owners[0].personalOwner = "person";
  evidence.owners[0].status = "assigned-pending-signoff";
  assert.throws(() => validateImageEvidence(evidence), /appointment approver is missing/u);
});

function fixture() {
  return {
    schemaVersion: 1,
    taskId: "P1-M0-04",
    runId: "p1-m0-04-20260718T120000Z",
    generatedAt: "2026-07-18T12:00:00Z",
    status: "passed-technical",
    environment: {
      server: "beelink",
      platform: "linux/amd64",
      evidenceRoot: "remote:/data/models/yujianAI/evidence/p1-m0-04/run",
    },
    scope: {
      policy: "current-pinned-yujian-images",
      excluded: ["unrelated project containers"],
    },
    tools: [
      tool("syft", "1.48.0"),
      tool("grype", "0.116.0"),
      tool("cosign", "3.1.2"),
    ],
    vulnerabilityPolicy: {
      maximumUnwaivedCritical: 0,
      highSeverity: "report-and-owner-review",
      exceptions: [],
      database: {
        builtAt: "2026-07-18T11:00:00Z",
        checksum: sha(),
      },
    },
    images: [{
      id: "livekit-server-linux-amd64",
      reference: `livekit/livekit-server:v1.13.3@${sha()}`,
      registryDigest: sha(),
      localImageId: sha(),
      platform: "linux/amd64",
      sbom: {
        format: "spdx-json",
        spdxVersion: "SPDX-2.3",
        packages: 12,
        path: "remote:/data/models/yujianAI/evidence/p1-m0-04/run/livekit.spdx.json",
        sha256: sha(),
      },
      vulnerabilityScan: {
        path: "remote:/data/models/yujianAI/evidence/p1-m0-04/run/livekit.grype.json",
        sha256: sha(),
        counts: severityCounts(),
        unwaivedCritical: 0,
        gate: "passed",
      },
    }],
    signature: {
      mode: "cosign-sign-blob",
      keyClass: "engineering-evidence-non-production",
      statementPath: "remote:/data/models/yujianAI/evidence/p1-m0-04/run/statement.json",
      statementSha256: sha(),
      bundlePath: "remote:/data/models/yujianAI/evidence/p1-m0-04/run/statement.sigstore.json",
      bundleSha256: sha(),
      publicKeyPath: "remote:/data/models/yujianAI/evidence/p1-m0-04/run/public.pem",
      publicKeySha256: sha(),
      verificationLog: "remote:/data/models/yujianAI/evidence/p1-m0-04/run/signature-verify.log",
      verified: true,
    },
    licenseInventory: {
      packages: 12,
      packagesWithNoAssertion: 3,
    },
    owners: [
      owner("compliance-owner"),
      owner("legal-owner"),
      owner("release-owner"),
      owner("security-owner"),
    ],
    legalReview: {
      licenseInventory: "infra/upstream/THIRD_PARTY_NOTICES.md",
      policy: "infra/upstream/LICENSE_REVIEW.md",
      status: "pending-personal-owner-signoff",
    },
    gate: {
      technicalEvidence: "passed",
      p1M004OwnerApproval: "pending",
      formalGate0: "not-passed",
      formalGate1: "not-passed",
      productionRelease: "blocked",
    },
  };
}

function tool(name, version) {
  return { name, version, sha256: sha(), checksumVerified: true };
}

function owner(role) {
  return { role, personalOwner: null, status: "pending-personal-assignment" };
}

function severityCounts() {
  return { negligible: 0, low: 1, medium: 2, high: 3, critical: 0, unknown: 0 };
}

function sha() {
  return `sha256:${"a".repeat(64)}`;
}
