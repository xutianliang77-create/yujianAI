import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const input = resolve(process.env.SBOM_INPUT ?? "outputs/sbom/yujian-package-lock.spdx.json");
const document = JSON.parse(readFileSync(input, "utf8"));

function fail(message) {
  throw new Error(`SBOM invalid: ${message}`);
}

if (document.spdxVersion !== "SPDX-2.3") fail("spdxVersion must be SPDX-2.3");
if (document.SPDXID !== "SPDXRef-DOCUMENT") fail("document SPDXID is invalid");
if (typeof document.documentNamespace !== "string" || !document.documentNamespace.startsWith("https://yujian.ai/spdx/")) {
  fail("document namespace must use the yujian.ai SPDX namespace");
}
if (!Array.isArray(document.packages) || document.packages.length === 0) fail("packages must be non-empty");

const names = new Set();
const ids = new Set();
for (const packageEntry of document.packages) {
  if (typeof packageEntry.name !== "string" || packageEntry.name.length === 0) fail("package name is missing");
  if (typeof packageEntry.versionInfo !== "string" || packageEntry.versionInfo.length === 0) fail(`${packageEntry.name} version is missing`);
  if (typeof packageEntry.SPDXID !== "string" || packageEntry.SPDXID.length === 0) fail(`${packageEntry.name} SPDXID is missing`);
  if (names.has(packageEntry.name)) fail(`duplicate package ${packageEntry.name}`);
  if (ids.has(packageEntry.SPDXID)) fail(`duplicate SPDXID ${packageEntry.SPDXID}`);
  names.add(packageEntry.name);
  ids.add(packageEntry.SPDXID);
}

process.stdout.write(`SBOM verified: ${document.packages.length} packages\n`);
