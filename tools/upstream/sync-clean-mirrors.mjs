import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

const manifest = JSON.parse(
  readFileSync(resolve("infra/upstream/livekit-versions.json"), "utf8"),
);
const mirrorRoot = resolve(
  process.env.YUJIAN_UPSTREAM_MIRROR_ROOT ??
    join(homedir(), ".cache", "yujian", "upstream"),
);
const workspaceRoot = resolve(".");
if (
  mirrorRoot === workspaceRoot ||
  mirrorRoot.startsWith(`${workspaceRoot}${sep}`)
) {
  throw new Error("YUJIAN_UPSTREAM_MIRROR_ROOT must be outside the workspace");
}
mkdirSync(mirrorRoot, { recursive: true });

const repositories = new Map();
for (const component of manifest.components) {
  const components = repositories.get(component.repository) ?? [];
  components.push(component);
  repositories.set(component.repository, components);
}

for (const [repository, components] of repositories) {
  const directory = join(mirrorRoot, basename(repository, ".git") + ".git");
  if (!repositoryExists(directory)) {
    execFileSync("git", ["clone", "--mirror", repository, directory], {
      stdio: "inherit",
    });
  } else {
    const origin = git(directory, ["remote", "get-url", "origin"]).trim();
    if (origin !== repository) {
      throw new Error(`mirror ${directory} has unexpected origin ${origin}`);
    }
    execFileSync("git", ["-C", directory, "fetch", "--prune", "--tags", "origin"], {
      stdio: "inherit",
    });
  }
  for (const component of components) {
    git(directory, ["cat-file", "-e", `${component.commit}^{commit}`]);
  }
}

process.stdout.write(
  `Clean LiveKit mirrors synchronized (${repositories.size} repositories) at ${mirrorRoot}\n`,
);

function repositoryExists(directory) {
  try {
    return git(directory, ["rev-parse", "--is-bare-repository"]).trim() === "true";
  } catch {
    return false;
  }
}

function git(directory, arguments_) {
  return execFileSync("git", ["-C", directory, ...arguments_], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
