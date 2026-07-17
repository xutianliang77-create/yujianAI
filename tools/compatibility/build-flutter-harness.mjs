import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectDirectory = fileURLToPath(
  new URL("../../tests/compatibility/flutter/", import.meta.url),
);
const child = spawn(
  "flutter",
  ["build", "web", "--base-href", "/flutter/"],
  {
    cwd: projectDirectory,
    env: {
      ...process.env,
      PUB_HOSTED_URL: process.env.PUB_HOSTED_URL ?? "https://pub.dev",
    },
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  throw error;
});

process.exitCode = await new Promise((resolve) => {
  child.on("close", (code) => resolve(code ?? 1));
});
