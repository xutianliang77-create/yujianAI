import { execFileSync } from "node:child_process";

const artifact = process.env.SIGNATURE_ARTIFACT;
const signature = process.env.SIGNATURE_FILE;
const publicKey = process.env.COSIGN_PUBLIC_KEY;
if (!artifact || !signature || !publicKey) {
  throw new Error("SIGNATURE_ARTIFACT, SIGNATURE_FILE and COSIGN_PUBLIC_KEY are required");
}
execFileSync("cosign", ["verify-blob", "--key", publicKey, "--signature", signature, artifact], {
  stdio: "inherit",
});
process.stdout.write(`Signature verified for ${artifact}\n`);
