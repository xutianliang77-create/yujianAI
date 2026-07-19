import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { AgentControlError, AgentControlPlane, type AgentControlOptions } from "./controller.js";
import type { AgentWorkerRegistrationV1 } from "./control-types.js";
import type { AgentControlPersistence } from "./persistence.js";
import type { AgentDispatchQuotaCoordinator } from "./dispatch-quota.js";
import type { AgentDispatchV1 } from "@yujian/platform-contracts";

function validToken(supplied: string | undefined, expected: string): boolean {
  if (supplied === undefined) return false;
  const left = createHash("sha256").update(supplied).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (Buffer.concat(chunks).length > 32 * 1024) throw new AgentControlError("CONFLICT", "payload too large");
  }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AgentControlError("CONFLICT", "JSON body is invalid"); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AgentControlError("CONFLICT", "JSON object required");
  return value as Record<string, unknown>;
}

function send(response: ServerResponse, status: number, data: unknown): void {
  const body = Buffer.from(JSON.stringify(data), "utf8");
  response.writeHead(status, { "cache-control": "no-store", "content-type": "application/json", "content-length": String(body.length) });
  response.end(body);
}

function requiredText(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0 || value.length > 256) throw new AgentControlError("CONFLICT", `${field} is required`);
  return value;
}

function requiredInteger(body: Record<string, unknown>, field: string): number {
  const value = body[field];
  if (typeof value !== "number" || !Number.isInteger(value)) throw new AgentControlError("CONFLICT", `${field} must be an integer`);
  return value;
}

function headerValue(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}

function createHandler(
  internalCredential: string,
  control: AgentControlPlane,
  adminCredential = internalCredential,
  persistence?: AgentControlPersistence,
  dispatchQuota?: AgentDispatchQuotaCoordinator,
) {
  const restored = persistence === undefined
    ? Promise.resolve()
    : persistence.load().then((snapshot) => {
      if (snapshot !== undefined) control.restore(snapshot);
      return dispatchQuota?.reconcile(control.snapshot().dispatches);
    });
  const sendMutation = async (response: ServerResponse, status: number, data: unknown): Promise<void> => {
    if (persistence !== undefined) await persistence.save(control.snapshot());
    send(response, status, data);
  };
  const sendAdmittedMutation = async (response: ServerResponse, status: number, dispatch: AgentDispatchV1): Promise<void> => {
    let admission: Awaited<ReturnType<AgentDispatchQuotaCoordinator["admit"]>> = "acquired";
    try { if (dispatchQuota !== undefined) admission = await dispatchQuota.admit(dispatch); }
    catch {
      control.cancelDispatch(dispatch.dispatchId);
      if (persistence !== undefined) await persistence.save(control.snapshot());
      throw new AgentControlError("QUOTA_EXCEEDED", "distributed dispatch quota is unavailable");
    }
    if (admission === "quota_exceeded") {
      control.cancelDispatch(dispatch.dispatchId);
      if (persistence !== undefined) await persistence.save(control.snapshot());
      throw new AgentControlError("QUOTA_EXCEEDED", "distributed dispatch quota exceeded");
    }
    await sendMutation(response, status, { data: dispatch });
  };
  const sendTerminalMutation = async (response: ServerResponse, dispatch: AgentDispatchV1): Promise<void> => {
    if (persistence !== undefined) await persistence.save(control.snapshot());
    try { await dispatchQuota?.release(dispatch); } catch { /* Deadline-bound lease remains fail-closed until expiry. */ }
    send(response, 200, { data: dispatch });
  };
  return async (request: IncomingMessage, response: ServerResponse) => {
    try {
      await restored;
      if (request.method === "GET" && request.url === "/healthz") {
        send(response, 200, { status: "ok" });
        return;
      }
      if (request.method !== "POST") {
        send(response, 405, { error: "method_not_allowed" });
        return;
      }
      const path = new URL(request.url ?? "/", "http://agent-control.local").pathname;
      const isWorkerPath = path.startsWith("/internal/v1/agent-workers/");
      const isAdminPath = path.startsWith("/internal/v1/agent/");
      const suppliedCredential = isAdminPath
        ? headerValue(request, "x-yujian-agent-admin-token")
        : isWorkerPath
          ? headerValue(request, "x-yujian-worker-token")
          : undefined;
      if ((!isWorkerPath && !isAdminPath) || !validToken(suppliedCredential, isAdminPath ? adminCredential : internalCredential)) {
        send(response, 401, { error: "authentication_failed" });
        return;
      }
      const body = await readBody(request);
      if (path === "/internal/v1/agent-workers/register") {
        const registration: AgentWorkerRegistrationV1 = {
          workerId: requiredText(body, "workerId"),
          environmentId: requiredText(body, "environmentId"),
          runtime: body.runtime === "python" ? "python" : "node",
          capabilities: Array.isArray(body.capabilities) ? body.capabilities.filter((value): value is string => typeof value === "string").slice(0, 64) : [],
        };
        await sendMutation(response, 201, { data: control.registerWorker(registration) });
        return;
      }
      if (path === "/internal/v1/agent-workers/heartbeat") {
        const ids = Array.isArray(body.activeDispatchIds) ? body.activeDispatchIds.filter((value): value is string => typeof value === "string") : [];
        const workerId = requiredText(body, "workerId");
        const cancelDispatchIds = ids.filter((id) => {
          const dispatch = control.dispatches.get(id);
          return dispatch !== undefined && ["completed", "failed", "cancelled"].includes(dispatch.status);
        });
        const activeIds = ids.filter((id) => !cancelDispatchIds.includes(id));
        await sendMutation(response, 200, { data: control.heartbeatWorker(workerId, activeIds), cancelDispatchIds });
        return;
      }
      if (path === "/internal/v1/agent-workers/claim") {
        await sendMutation(response, 200, { data: control.claimNextDispatch(requiredText(body, "workerId")) ?? null });
        return;
      }
      if (path === "/internal/v1/agent/rules") {
        await sendMutation(response, 201, { data: control.registerRule({
          environmentId: requiredText(body, "environmentId"),
          trigger: body.trigger as "room_joined" | "track_published" | "data_received" | "scheduled",
          agentArtifactId: requiredText(body, "agentArtifactId"),
          maxConcurrent: requiredInteger(body, "maxConcurrent"),
          timeoutMs: requiredInteger(body, "timeoutMs"),
          enabled: body.enabled !== false,
        }) });
        return;
      }
      if (path === "/internal/v1/agent/triggers") {
        const deadlineAt = typeof body.deadlineAt === "string" ? body.deadlineAt : undefined;
        await sendAdmittedMutation(response, 201, control.triggerDispatch(
          requiredText(body, "environmentId"),
          body.trigger as "room_joined" | "track_published" | "data_received" | "scheduled",
          requiredText(body, "roomName"),
          deadlineAt,
        ));
        return;
      }
      if (path === "/internal/v1/agent-workers/complete") {
        await sendTerminalMutation(response, control.completeDispatch(requiredText(body, "workerId"), requiredText(body, "dispatchId")));
        return;
      }
      if (path === "/internal/v1/agent-workers/start") {
        await sendMutation(response, 200, { data: control.startDispatch(requiredText(body, "workerId"), requiredText(body, "dispatchId")) });
        return;
      }
      if (path === "/internal/v1/agent-workers/fail") {
        await sendTerminalMutation(response, control.failDispatch(requiredText(body, "workerId"), requiredText(body, "dispatchId"), requiredText(body, "reason")));
        return;
      }
      if (path === "/internal/v1/agent-workers/cancel") {
        await sendTerminalMutation(response, control.cancelDispatch(requiredText(body, "dispatchId"), requiredText(body, "workerId")));
        return;
      }
      if (path === "/internal/v1/agent/artifacts") {
        const artifact = await control.registerArtifact({
          tenantId: requiredText(body, "tenantId"),
          projectId: requiredText(body, "projectId"),
          image: requiredText(body, "image"),
          digest: requiredText(body, "digest"),
          runtime: body.runtime === "python" ? "python" : "node",
          entrypoint: requiredText(body, "entrypoint"),
          ...(typeof body.sbomUri === "string" ? { sbomUri: body.sbomUri } : {}),
          signatureRef: requiredText(body, "signatureRef"),
        });
        await sendMutation(response, 201, { data: artifact });
        return;
      }
      if (path === "/internal/v1/agent/deployments") {
        const deployment = control.deploy(
          requiredText(body, "environmentId"),
          requiredText(body, "artifactId"),
          requiredInteger(body, "desiredReplicas"),
          body.canaryPercent === undefined ? 10 : requiredInteger(body, "canaryPercent"),
        );
        await sendMutation(response, 201, { data: deployment });
        return;
      }
      if (path === "/internal/v1/agent/dispatches") {
        const dispatch = control.dispatch(requiredText(body, "environmentId"), requiredText(body, "deploymentId"), requiredText(body, "roomName"), requiredText(body, "deadlineAt"));
        await sendAdmittedMutation(response, 201, dispatch);
        return;
      }
      const deploymentMutation = path.match(/^\/internal\/v1\/agent\/deployments\/([^/]+):(rollback|reconcile)$/u);
      if (deploymentMutation !== null) {
        const deploymentId = deploymentMutation[1] ?? "";
        const data = deploymentMutation[2] === "rollback"
          ? control.rollback(deploymentId)
          : control.reconcile(deploymentId, requiredInteger(body, "observedReplicas"));
        await sendMutation(response, 200, { data });
        return;
      }
      const dispatchCancel = path.match(/^\/internal\/v1\/agent\/dispatches\/([^/]+):cancel$/u);
      if (dispatchCancel !== null) {
        await sendTerminalMutation(response, control.cancelDispatch(dispatchCancel[1] ?? ""));
        return;
      }
      send(response, 404, { error: "resource_not_found" });
    } catch (error) {
      const status = error instanceof AgentControlError
        ? error.code === "NOT_FOUND" ? 404 : error.code === "POLICY_DENIED" ? 403 : error.code === "QUOTA_EXCEEDED" ? 429 : 409
        : 400;
      send(response, status, { error: error instanceof AgentControlError ? error.message : "request_failed" });
    }
  };
}

export interface AgentControlServerOptions {
  /** Separate credential for artifact/deployment/dispatch administration. */
  adminCredential?: string;
  /** Optional durable snapshot adapter; omit only for development or contract checks. */
  persistence?: AgentControlPersistence;
  /** Optional deployment-owned signature/SBOM verifier; production should fail closed when absent. */
  artifactVerifier?: AgentControlOptions["verifyArtifact"];
  /** Required in production to enforce queue and concurrency limits across replicas. */
  dispatchQuota?: AgentDispatchQuotaCoordinator;
}

export function createAgentControlServer(
  internalCredential: string,
  control: AgentControlPlane | undefined = undefined,
  options: AgentControlServerOptions = {},
) {
  const resolvedControl = control ?? new AgentControlPlane(undefined, options.artifactVerifier === undefined ? {} : { verifyArtifact: options.artifactVerifier });
  return createServer(createHandler(internalCredential, resolvedControl, options.adminCredential, options.persistence, options.dispatchQuota));
}

export function createAgentControlHttpsServer(
  internalCredential: string,
  tls: { key: string; cert: string },
  control: AgentControlPlane | undefined = undefined,
  options: AgentControlServerOptions = {},
) {
  const resolvedControl = control ?? new AgentControlPlane(undefined, options.artifactVerifier === undefined ? {} : { verifyArtifact: options.artifactVerifier });
  return createHttpsServer(tls, createHandler(internalCredential, resolvedControl, options.adminCredential, options.persistence, options.dispatchQuota));
}
