import { loadConfig } from "./config.js";
import { InClusterOperatorApi } from "./kubernetes-api.js";
import { DeploymentReconciler } from "./reconciler.js";

const config = loadConfig();
const api = new InClusterOperatorApi(config.apiServer, config.namespace, config.tokenFile);
const reconciler = new DeploymentReconciler(api);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stopping = true; });

while (!stopping) {
  try {
    for (const resource of await api.listPlatforms()) {
      try { await reconciler.reconcile(resource); }
      catch (error) { process.stderr.write(`${JSON.stringify({ level: "error", resource: resource.metadata.name, message: error instanceof Error ? error.message : "reconcile failed" })}\n`); }
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ level: "error", message: error instanceof Error ? error.message : "operator list failed" })}\n`);
  }
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
}
