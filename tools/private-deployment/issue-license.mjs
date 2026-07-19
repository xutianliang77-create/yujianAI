import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { issueLicense } from "../../services/license-service/dist/index.js";

const requestPath = process.argv[2];
const policyPath = process.argv[3];
const outputPath = process.argv[4];
const privateKeyPath = process.env.YUJIAN_LICENSE_PRIVATE_KEY_FILE;
if (requestPath === undefined || policyPath === undefined || outputPath === undefined || privateKeyPath === undefined) {
  throw new Error("usage: issue-license <request.json> <policy.json> <output.json>; YUJIAN_LICENSE_PRIVATE_KEY_FILE is required");
}
const request = JSON.parse(readFileSync(resolve(requestPath), "utf8"));
const policy = JSON.parse(readFileSync(resolve(policyPath), "utf8"));
const privateKey = readFileSync(resolve(privateKeyPath), "utf8");
const document = issueLicense(request, policy, privateKey);
const payload = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8");
const output = resolve(outputPath);
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
writeFileSync(output, payload, { flag: "wx", mode: 0o600 });
writeFileSync(`${output}.manifest.json`, `${JSON.stringify({
  schemaVersion: 1,
  licenseId: document.payload.licenseId,
  tenantId: document.payload.tenantId,
  expiresAt: document.payload.expiresAt,
  sha256: `sha256:${createHash("sha256").update(payload).digest("hex")}`,
  distributionContainsPrivateKey: false,
}, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ output, manifest: `${output}.manifest.json` })}\n`);
