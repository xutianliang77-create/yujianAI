import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NOASSERTION = "NOASSERTION";

export function parseDependencyNotice(text) {
  return [...text.matchAll(/^## (.+)\n\n\*\*License:\*\* (.+)$/gmu)].map((match) => ({
    name: match[1],
    license: match[2]
  }));
}

export function remediateSbom({ sbom, imageId, noticeSections, policy, generatedAt, runId }) {
  const inventory = [];
  const customIds = new Set(policy.customLicenseRefs.map((item) => item.licenseId));
  const packages = sbom.packages.map((sourcePackage) => {
    if ((sourcePackage.licenseDeclared ?? NOASSERTION) !== NOASSERTION) {
      if ((sourcePackage.licenseConcluded ?? NOASSERTION) === NOASSERTION) {
        return { ...sourcePackage, licenseConcluded: sourcePackage.licenseDeclared };
      }
      return sourcePackage;
    }
    const resolution = resolvePackage(sourcePackage, imageId, noticeSections, policy.overrides);
    if (!resolution) {
      throw new Error(`unresolved NOASSERTION package: ${imageId}:${sourcePackage.name}@${sourcePackage.versionInfo ?? "UNKNOWN"}`);
    }
    if (resolution.licenseConcluded === NOASSERTION) throw new Error(`${sourcePackage.name} still concludes NOASSERTION`);
    if (resolution.licenseConcluded.startsWith("LicenseRef-") && !customIds.has(resolution.licenseConcluded)) {
      throw new Error(`${sourcePackage.name} uses an undefined LicenseRef`);
    }
    inventory.push({
      imageId,
      spdxId: sourcePackage.SPDXID,
      name: sourcePackage.name,
      version: sourcePackage.versionInfo ?? "UNKNOWN",
      licenseDeclared: sourcePackage.licenseDeclared ?? NOASSERTION,
      licenseConcluded: resolution.licenseConcluded,
      resolutionStatus: resolution.resolutionStatus,
      evidence: resolution.evidence
    });
    const annotations = [...(sourcePackage.annotations ?? []), {
      annotationDate: generatedAt,
      annotationType: "REVIEW",
      annotator: "Organization: Yujian AI",
      comment: `P1-M0-04 engineering license conclusion; source declaration remains ${NOASSERTION}; status=${resolution.resolutionStatus}`
    }];
    return { ...sourcePackage, licenseConcluded: resolution.licenseConcluded, annotations };
  });
  const usedLicenseRefs = new Set(inventory
    .map((item) => item.licenseConcluded)
    .filter((value) => value.startsWith("LicenseRef-")));
  const extracted = [
    ...(sbom.hasExtractedLicensingInfos ?? []),
    ...policy.customLicenseRefs.filter((item) => usedLicenseRefs.has(item.licenseId))
  ];
  const remediated = {
    ...sbom,
    name: `${sbom.name}-license-conclusions`,
    documentNamespace: `${sbom.documentNamespace.replace(/\/$/u, "")}/license-remediation/${runId}`,
    creationInfo: {
      ...sbom.creationInfo,
      created: generatedAt,
      creators: [...new Set([...(sbom.creationInfo?.creators ?? []), "Organization: Yujian AI"])]
    },
    packages,
    hasExtractedLicensingInfos: extracted
  };
  return { remediated, inventory };
}

function resolvePackage(pkg, imageId, sections, overrides) {
  const override = overrides.find((item) => item.image === imageId
    && item.name === pkg.name
    && (!item.version || item.version === pkg.versionInfo));
  if (override) return override;
  const matches = sections.filter((section) => section.license !== "Unknown" && (
    pkg.name === section.name
      || pkg.name.startsWith(`${section.name}/`)
      || section.name.startsWith(`${pkg.name}/`)
  ));
  const licenses = [...new Set(matches.map((section) => section.license))].sort();
  if (licenses.length === 0) return undefined;
  return {
    licenseConcluded: licenses.join(" AND "),
    resolutionStatus: "engineering-concluded",
    evidence: [...new Set(matches.map((section) => `licenses/openbao-dependencies.md#${section.name}`))].sort()
  };
}

export function buildRemediationPackage({ postgresSbom, openbaoSbom, dependencyNotice, policy, generatedAt, runId }) {
  if (policy.schemaVersion !== 1 || policy.taskId !== "P1-M0-04-NOASSERTION-REMEDIATION") {
    throw new Error("license remediation policy identity is invalid");
  }
  const noticeSections = parseDependencyNotice(dependencyNotice);
  if (noticeSections.length !== 342) throw new Error(`expected 342 OpenBao notice sections, found ${noticeSections.length}`);
  const inputs = [
    ["postgres-16.14-alpine-gosu-go1.25.12", postgresSbom],
    ["openbao-2.5.4-crypto0.52-net0.55-openssl3.5.7-go1.25.12", openbaoSbom]
  ];
  const documents = {};
  const inventory = [];
  for (const [imageId, sbom] of inputs) {
    const result = remediateSbom({ sbom, imageId, noticeSections, policy, generatedAt, runId });
    documents[imageId] = result.remediated;
    inventory.push(...result.inventory);
    const expected = policy.expected.images[imageId];
    if (result.inventory.length !== expected) {
      throw new Error(`${imageId} expected ${expected} NOASSERTION records, found ${result.inventory.length}`);
    }
  }
  if (inventory.length !== policy.expected.declaredNoAssertion) {
    throw new Error(`expected ${policy.expected.declaredNoAssertion} total NOASSERTION records, found ${inventory.length}`);
  }
  const statusCounts = countBy(inventory, (item) => item.resolutionStatus);
  const licenseCounts = countBy(inventory, (item) => item.licenseConcluded);
  const concludedNoAssertion = inventory.filter((item) => item.licenseConcluded === NOASSERTION).length;
  return {
    documents,
    inventory: inventory.sort((a, b) => `${a.imageId}:${a.name}:${a.spdxId}`.localeCompare(`${b.imageId}:${b.name}:${b.spdxId}`)),
    summary: {
      declaredNoAssertion: inventory.length,
      concludedNoAssertion,
      legalOwnerReviewRequired: statusCounts["legal-owner-review-required"] ?? 0,
      resolutionStatusCounts: statusCounts,
      licenseConclusionCounts: licenseCounts
    }
  };
}

function countBy(items, selector) {
  return Object.fromEntries([...items.reduce((counts, item) => {
    const key = selector(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map())].sort(([left], [right]) => left.localeCompare(right)));
}

function sha256(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index]?.startsWith("--") || args[index + 1] === undefined) throw new Error(`invalid argument: ${args[index]}`);
    values[args[index].slice(2)] = args[index + 1];
  }
  for (const required of ["postgres-sbom", "openbao-sbom", "dependency-notice", "policy", "output", "generated-at", "run-id"]) {
    if (!values[required]) throw new Error(`missing --${required}`);
  }
  return values;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const raw = {
    postgres: readFileSync(resolve(args["postgres-sbom"])),
    openbao: readFileSync(resolve(args["openbao-sbom"])),
    notice: readFileSync(resolve(args["dependency-notice"])),
    policy: readFileSync(resolve(args.policy))
  };
  const result = buildRemediationPackage({
    postgresSbom: JSON.parse(raw.postgres),
    openbaoSbom: JSON.parse(raw.openbao),
    dependencyNotice: raw.notice.toString("utf8"),
    policy: JSON.parse(raw.policy),
    generatedAt: args["generated-at"],
    runId: args["run-id"]
  });
  const output = resolve(args.output);
  mkdirSync(join(output, "remediated-sbom"), { recursive: true });
  const postgresId = "postgres-16.14-alpine-gosu-go1.25.12";
  const openbaoId = "openbao-2.5.4-crypto0.52-net0.55-openssl3.5.7-go1.25.12";
  writeJson(join(output, "remediated-sbom", "postgres.spdx.json"), result.documents[postgresId]);
  writeJson(join(output, "remediated-sbom", "openbao.spdx.json"), result.documents[openbaoId]);
  writeJson(join(output, "noassertion-inventory.json"), result.inventory);
  writeJson(join(output, "report.json"), {
    schemaVersion: 1,
    taskId: "P1-M0-04-LICENSE-REMEDIATION",
    runId: args["run-id"],
    generatedAt: args["generated-at"],
    status: "engineering-remediation-complete-legal-owner-blocked",
    deploymentAllowed: false,
    inputs: {
      [basename(args["postgres-sbom"])]: sha256(raw.postgres),
      [basename(args["openbao-sbom"])]: sha256(raw.openbao),
      [basename(args["dependency-notice"])]: sha256(raw.notice),
      [basename(args.policy)]: sha256(raw.policy)
    },
    summary: result.summary,
    ownerBoundary: {
      legalOwner: "ccc",
      currentDecision: "rejected-sequence-1",
      complianceOwner: "ddd",
      complianceDecision: "approved-sequence-1",
      productionRelease: "blocked"
    }
  });
  process.stdout.write(`License remediation generated: declared=${result.summary.declaredNoAssertion}; concluded-NOASSERTION=${result.summary.concludedNoAssertion}; legal-review=${result.summary.legalOwnerReviewRequired}\n`);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli();
