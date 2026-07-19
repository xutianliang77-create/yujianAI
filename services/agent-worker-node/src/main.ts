import { AgentWorker } from "./worker.js";
import { WorkerControlClient } from "./control-client.js";
import { AgentDispatchRunner } from "./dispatch-runner.js";
import { loadAgentDispatchHandler } from "./handler-loader.js";

const worker = new AgentWorker();
worker.start();
const controlUrl = process.env.YUJIAN_AGENT_CONTROL_URL;
const controlCredential = process.env.YUJIAN_AGENT_CONTROL_CREDENTIAL;
const environmentId = process.env.YUJIAN_AGENT_ENVIRONMENT_ID;
const control = controlUrl !== undefined && controlCredential !== undefined && environmentId !== undefined
  ? new WorkerControlClient({ baseUrl: controlUrl, credential: controlCredential })
  : undefined;
const capabilities = (process.env.YUJIAN_AGENT_CAPABILITIES ?? "").split(",").map((value) => value.trim()).filter(Boolean).slice(0, 64);
let heartbeatTimer: NodeJS.Timeout | undefined;
let dispatchRunner: AgentDispatchRunner | undefined;
if (control !== undefined && environmentId !== undefined) {
  void control.register({ workerId: worker.workerId, environmentId, runtime: "node", capabilities }).catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify({ event: "worker.register_failed", workerId: worker.workerId, error: error instanceof Error ? error.message : "unknown" })}\n`);
  });
  heartbeatTimer = setInterval(() => {
    void control.heartbeat(worker.workerId, worker.activeDispatchIds()).then((result) => {
      for (const dispatchId of result.cancelDispatchIds) worker.cancel(dispatchId, "control-plane-cancelled");
    }).catch((error: unknown) => {
      process.stderr.write(`${JSON.stringify({ event: "worker.heartbeat_failed", workerId: worker.workerId, error: error instanceof Error ? error.message : "unknown" })}\n`);
    });
  }, 5_000);
}

async function startDispatchRunner(): Promise<void> {
  if (control === undefined) return;
  const handlerSpecifier = process.env.YUJIAN_AGENT_HANDLER_MODULE;
  if (handlerSpecifier === undefined || handlerSpecifier.trim() === "") return;
  const handler = await loadAgentDispatchHandler(handlerSpecifier);
  dispatchRunner = new AgentDispatchRunner(worker, control, handler);
  dispatchRunner.start();
}

void startDispatchRunner().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ event: "worker.handler_load_failed", workerId: worker.workerId, error: error instanceof Error ? error.message : "unknown" })}\n`);
  process.exitCode = 1;
});

const shutdown = () => {
  if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
  void (async () => {
    await dispatchRunner?.stop();
    await worker.drain();
  })();
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
