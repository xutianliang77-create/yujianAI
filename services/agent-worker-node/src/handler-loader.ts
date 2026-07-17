import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { AgentDispatchHandler } from "./dispatch-runner.js";

type HandlerModule = {
  default?: unknown;
  handleDispatch?: unknown;
};

/** Load deployment-owned Room/provider work without bundling provider secrets. */
export async function loadAgentDispatchHandler(specifier: string): Promise<AgentDispatchHandler> {
  const url = specifier.startsWith("file:") ? specifier : pathToFileURL(resolve(specifier)).href;
  const loaded = await import(url) as HandlerModule;
  const candidate = loaded.handleDispatch ?? loaded.default;
  if (typeof candidate !== "function") throw new Error("agent handler module must export handleDispatch or default");
  return candidate as AgentDispatchHandler;
}
