import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const lock = JSON.parse(readFileSync(resolve("package-lock.json"), "utf8"));
const packages = Object.entries(lock.packages ?? {})
  .filter(([name]) => name.startsWith("node_modules/"))
  .map(([name, value]) => ({
    SPDXID: `SPDXRef-${name.slice("node_modules/".length).replace(/[^A-Za-z0-9.-]/gu, "-")}`,
    name: name.slice("node_modules/".length),
    versionInfo: value.version ?? "workspace",
    downloadLocation: value.resolved ?? "NOASSERTION",
    licenseConcluded: value.license ?? "NOASSERTION",
  }));
const document = {
  spdxVersion: "SPDX-2.3",
  dataLicense: "CC0-1.0",
  SPDXID: "SPDXRef-DOCUMENT",
  name: "yujianAI-package-lock",
  documentNamespace: `https://yujian.ai/spdx/${lock.name}/${lock.version}`,
  creationInfo: { created: new Date().toISOString(), creators: ["Tool: yujian-sbom-generator"] },
  packages,
};
const output = resolve(process.env.SBOM_OUTPUT ?? "outputs/sbom/yujian-package-lock.spdx.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, "utf8");
process.stdout.write(`SBOM written to ${output}\n`);
