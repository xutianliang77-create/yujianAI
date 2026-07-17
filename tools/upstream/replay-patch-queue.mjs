import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const mirrorRoot = resolve(process.env.YUJIAN_UPSTREAM_MIRROR_ROOT ?? "");
if (mirrorRoot === resolve(".") || mirrorRoot.startsWith(`${resolve(".")}${sep}`)) {
  throw new Error("patch replay requires an external clean mirror root");
}
const queue = JSON.parse(readFileSync(resolve("infra/upstream/livekit-patch-queue.json"), "utf8"));
if (queue.policy?.allowMediaCorePatches !== false) throw new Error("media core patches must remain disabled");
for (const patch of queue.patches ?? []) {
  if (typeof patch.repository !== "string" || typeof patch.patchFile !== "string") {
    throw new Error("each patch must declare repository and patchFile");
  }
  const mirror = resolve(mirrorRoot, `${patch.repository.split("/").at(-1)?.replace(/\.git$/u, "")}.git`);
  execFileSync("git", ["-C", mirror, "show", "--stat", "--oneline", patch.patchFile], { stdio: "inherit" });
}
process.stdout.write(`Patch queue verified: ${(queue.patches ?? []).length} patches\n`);
