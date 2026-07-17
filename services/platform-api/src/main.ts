import { loadPlatformApiConfig } from "./config.js";
import { createPlatformServer } from "./server.js";
import { loadPlatformRuntime } from "./runtime.js";

const config = loadPlatformApiConfig();
const runtimeSpecifier = process.env.YUJIAN_PLATFORM_RUNTIME_MODULE;
const serverPromise = loadPlatformRuntime(runtimeSpecifier, config).then((dependencies) => {
  if (process.env.NODE_ENV === "production") {
    if (dependencies.persistence === undefined) throw new Error("production platform api requires a persistence adapter");
    if (dependencies.storePersistence === undefined) throw new Error("production platform api requires a durable platform store persistence adapter");
    if (dependencies.rateLimiter === undefined) throw new Error("production platform api requires a distributed rate limiter");
    if (dependencies.resourceUsage === undefined) throw new Error("production platform api requires a resource usage provider");
    if (dependencies.tokenQuota === undefined) throw new Error("production platform api requires a distributed token quota provider");
    if (dependencies.outboxWorker === undefined) throw new Error("production platform api requires an outbox delivery worker");
    if (dependencies.persistence.listUsage === undefined || dependencies.persistence.listAudit === undefined) throw new Error("production platform api requires durable usage and audit readers");
  }
  return { server: createPlatformServer(config, dependencies), worker: dependencies.outboxWorker, close: dependencies.close };
});

let runtime: Awaited<typeof serverPromise> | undefined;
serverPromise.then((created) => {
  runtime = created;
  created.server.listen(config.port, config.host, () => {
    created.worker?.start();
    console.log(JSON.stringify({ level: "info", message: "platform api listening", host: config.host, port: config.port, runtimeModule: runtimeSpecifier === undefined ? "default" : "external" }));
  });
}).catch((error: unknown) => {
  console.error(JSON.stringify({ level: "error", message: "platform api startup failed", error: error instanceof Error ? error.message : "unknown" }));
  process.exitCode = 1;
});

let closing = false;
function shutdown(signal: string) {
  if (closing) {
    return;
  }
  closing = true;
  console.log(
    JSON.stringify({
      level: "info",
      message: "platform api draining",
      signal,
    }),
  );
  if (runtime === undefined) return;
  const activeRuntime = runtime;
  void (async () => {
    await activeRuntime.worker?.stop();
    await activeRuntime.close?.();
    activeRuntime.server.close((error) => {
      if (error) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "platform api shutdown failed",
            errorName: error.name,
          }),
        );
        process.exitCode = 1;
      }
    });
  })();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
