import test from "node:test";
import assert from "node:assert/strict";
import { buildRemediationPackage, parseDependencyNotice, remediateSbom } from "./remediate-noassertion.mjs";

const baseSbom = (name, packages) => ({
  spdxVersion: "SPDX-2.3",
  name,
  documentNamespace: `https://yujian.example.test/${name}`,
  creationInfo: { created: "2026-07-18T00:00:00Z", creators: ["Tool: syft"] },
  packages
});

const packageRecord = (name, declared = "NOASSERTION", concluded = "NOASSERTION") => ({
  SPDXID: `SPDXRef-${name.replaceAll(/[^A-Za-z0-9.-]/gu, "-")}`,
  name,
  licenseDeclared: declared,
  licenseConcluded: concluded
});

test("parses generated dependency license headings", () => {
  assert.deepEqual(parseDependencyNotice("## example.com/mod\n\n**License:** Apache-2.0\n"), [
    { name: "example.com/mod", license: "Apache-2.0" }
  ]);
});

test("preserves declarations while adding conclusions and explicit LicenseRefs", () => {
  const policy = {
    customLicenseRefs: [{ licenseId: "LicenseRef-Test-Aggregate", extractedText: "aggregate" }],
    overrides: [{
      image: "image-a",
      name: "image/root",
      licenseConcluded: "LicenseRef-Test-Aggregate",
      resolutionStatus: "informational-aggregate",
      evidence: ["NOTICE.md"]
    }]
  };
  const result = remediateSbom({
    sbom: baseSbom("test", [
      packageRecord("example.com/mod"),
      packageRecord("image/root"),
      packageRecord("already-known", "MIT")
    ]),
    imageId: "image-a",
    noticeSections: [{ name: "example.com/mod/subpackage", license: "Apache-2.0" }],
    policy,
    generatedAt: "2026-07-19T00:00:00Z",
    runId: "run-1"
  });
  assert.equal(result.remediated.packages[0].licenseDeclared, "NOASSERTION");
  assert.equal(result.remediated.packages[0].licenseConcluded, "Apache-2.0");
  assert.equal(result.remediated.packages[1].licenseConcluded, "LicenseRef-Test-Aggregate");
  assert.equal(result.remediated.packages[2].licenseConcluded, "MIT");
  assert.equal(result.inventory.length, 2);
});

test("fails closed for an unresolved package or undefined LicenseRef", () => {
  const input = {
    sbom: baseSbom("test", [packageRecord("unknown")]),
    imageId: "image-a",
    noticeSections: [],
    generatedAt: "2026-07-19T00:00:00Z",
    runId: "run-1"
  };
  assert.throws(() => remediateSbom({ ...input, policy: { customLicenseRefs: [], overrides: [] } }), /unresolved NOASSERTION/u);
  assert.throws(() => remediateSbom({
    ...input,
    policy: {
      customLicenseRefs: [],
      overrides: [{
        image: "image-a",
        name: "unknown",
        licenseConcluded: "LicenseRef-Missing",
        resolutionStatus: "blocked",
        evidence: []
      }]
    }
  }), /undefined LicenseRef/u);
});

test("builds a two-image package only when every declared NOASSERTION is classified", () => {
  const notice = Array.from({ length: 342 }, (_, index) => (
    `## example.com/mod${index}\n\n**License:** ${index === 0 ? "Apache-2.0" : "MIT"}\n`
  )).join("\n");
  const policy = {
    schemaVersion: 1,
    taskId: "P1-M0-04-NOASSERTION-REMEDIATION",
    expected: {
      declaredNoAssertion: 2,
      images: {
        "postgres-16.14-alpine-gosu-go1.25.12": 1,
        "openbao-2.5.4-crypto0.52-net0.55-openssl3.5.7-go1.25.12": 1
      }
    },
    customLicenseRefs: [],
    overrides: []
  };
  const result = buildRemediationPackage({
    postgresSbom: baseSbom("postgres", [packageRecord("example.com/mod0")]),
    openbaoSbom: baseSbom("openbao", [packageRecord("example.com/mod1")]),
    dependencyNotice: notice,
    policy,
    generatedAt: "2026-07-19T00:00:00Z",
    runId: "run-1"
  });
  assert.equal(result.summary.declaredNoAssertion, 2);
  assert.equal(result.summary.concludedNoAssertion, 0);
});
