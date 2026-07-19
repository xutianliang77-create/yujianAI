import { execFileSync } from "node:child_process";

const artifact = process.env.SIGNATURE_ARTIFACT;
const signature = process.env.SIGNATURE_FILE;
const bundle = process.env.COSIGN_BUNDLE;
const publicKey = process.env.COSIGN_PUBLIC_KEY;
if (!artifact || (!bundle && !signature) || !publicKey) {
  throw new Error("SIGNATURE_ARTIFACT, COSIGN_PUBLIC_KEY and COSIGN_BUNDLE (preferred) or SIGNATURE_FILE are required");
}
const verificationMaterial = bundle ? ["--bundle", bundle] : ["--signature", signature];
const tlogPolicy = process.env.COSIGN_INSECURE_IGNORE_TLOG === "true" ? ["--insecure-ignore-tlog"] : [];
execFileSync("cosign", ["verify-blob", "--key", publicKey, ...verificationMaterial, ...tlogPolicy, artifact], {
  stdio: "inherit",
});
process.stdout.write(`Signature verified for ${artifact}\n`);
