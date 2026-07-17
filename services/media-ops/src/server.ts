import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { MediaOperationStatusV1, MediaProviderStatusUpdateV1 } from "@yujian/platform-contracts";
import { MediaOpsControl, MediaOpsError, type MediaOpsProvider } from "./control.js";
import type { MediaOpsPersistence } from "./persistence.js";

function equalSecret(supplied: string | undefined, expected: string): boolean {
  if (supplied === undefined) return false;
  const left = createHash("sha256").update(supplied).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

async function json(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (Buffer.concat(chunks).length > 16 * 1024) throw new MediaOpsError("QUOTA_EXCEEDED", "payload too large");
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new MediaOpsError("CONFLICT", "JSON object required");
  return value as Record<string, unknown>;
}

function send(response: ServerResponse, status: number, data: unknown): void {
  const body = Buffer.from(JSON.stringify(data), "utf8");
  response.writeHead(status, { "cache-control": "no-store", "content-type": "application/json", "content-length": String(body.length) });
  response.end(body);
}

function statusForMediaError(error: MediaOpsError): number {
  if (error.code === "POLICY_DISABLED") return 403;
  if (error.code === "NOT_FOUND") return 404;
  if (error.code === "CONFLICT") return 409;
  if (error.code === "QUOTA_EXCEEDED") return 429;
  if (error.code === "PROVIDER_UNAVAILABLE") return 502;
  return 400;
}

const MEDIA_STATUSES = new Set<MediaOperationStatusV1>([
  "requested", "starting", "active", "draining", "completed", "failed", "cancelled",
]);

function parseProviderStatusUpdate(body: Record<string, unknown>): MediaProviderStatusUpdateV1 {
  const allowed = new Set(["status", "providerId", "objectUri", "retentionExpiresAt"]);
  const unknown = Object.keys(body).find((key) => !allowed.has(key));
  if (unknown !== undefined) throw new MediaOpsError("CONFLICT", `unknown provider status field ${unknown}`);
  if (typeof body.status !== "string" || !MEDIA_STATUSES.has(body.status as MediaOperationStatusV1)) {
    throw new MediaOpsError("CONFLICT", "status is not a supported media operation status");
  }
  const optionalText = (field: string): string | undefined => {
    const value = body[field];
    if (value === undefined) return undefined;
    if (typeof value !== "string" || value.length === 0 || value.length > 256 || value.trim() !== value) {
      throw new MediaOpsError("CONFLICT", `${field} must be a trimmed non-empty string`);
    }
    return value;
  };
  const providerId = optionalText("providerId");
  const objectUri = optionalText("objectUri");
  const retentionExpiresAt = optionalText("retentionExpiresAt");
  return {
    status: body.status as MediaOperationStatusV1,
    ...(providerId === undefined ? {} : { providerId }),
    ...(objectUri === undefined ? {} : { objectUri }),
    ...(retentionExpiresAt === undefined ? {} : { retentionExpiresAt }),
  };
}

type MediaOpsOptions = ConstructorParameters<typeof MediaOpsControl>[0];

function createHandler(internalCredential: string, control: MediaOpsControl, provider?: MediaOpsProvider, persistence?: MediaOpsPersistence) {
  const restored = persistence === undefined ? Promise.resolve() : persistence.load().then((snapshot) => { if (snapshot !== undefined) control.restore(snapshot); });
  let persistTail: Promise<void> = Promise.resolve();
  const persistSnapshot = async (): Promise<void> => {
    if (persistence === undefined) return;
    const snapshot = control.snapshot();
    const write = persistTail.catch(() => undefined).then(() => persistence.save(snapshot));
    persistTail = write;
    await write;
  };
  const sendMutation = async (response: ServerResponse, status: number, data: unknown): Promise<void> => { await persistSnapshot(); send(response, status, data); };
  return async (request: IncomingMessage, response: ServerResponse) => {
    try {
      await restored;
      if (request.method === "GET" && request.url === "/healthz") {
        send(response, 200, { status: "ok" });
        return;
      }
      if (!equalSecret(request.headers["x-yujian-internal-token"] as string | undefined, internalCredential)) {
        send(response, 401, { error: "authentication_failed" });
        return;
      }
      const url = new URL(request.url ?? "/", "http://media-ops.local");
      const path = url.pathname.split("/").filter(Boolean);
      const basePath = path[0] === "internal" && path[1] === "v1" && path[2] === "environments" && path[4] === "media";
      const isIngressPath = path[5] === "ingress";
      const isEgressPath = path[5] === "egress";
      const isSipPath = path[5] === "sip" && path[6] === "calls";
      const isStatusPath = request.method === "POST" && (
        (path.length === 7 && (isIngressPath || isEgressPath) && path[6]?.endsWith(":status")) ||
        (path.length === 8 && isSipPath && path[7]?.endsWith(":status"))
      );
      const isTransferPath = request.method === "POST" && path.length === 8 && isSipPath && path[7]?.endsWith(":transfer");
      const isHangupPath = request.method === "POST" && path.length === 8 && isSipPath && path[7]?.endsWith(":hangup");
      const isCreatePath = request.method === "POST" && ((path.length === 6 && (isIngressPath || isEgressPath)) || (path.length === 7 && isSipPath));
      const isCollectionGet = request.method === "GET" && ((path.length === 6 && (isIngressPath || isEgressPath)) || (path.length === 7 && isSipPath));
      const isResourceGet = request.method === "GET" && ((path.length === 7 && (isIngressPath || isEgressPath)) || (path.length === 8 && isSipPath));
      const validPath = basePath && (isCreatePath || isCollectionGet || isResourceGet || isStatusPath || isTransferPath || isHangupPath);
      if (!validPath) {
        send(response, 404, { error: "resource_not_found" });
        return;
      }
      const environmentId = path[3] ?? "";
      if (isStatusPath) {
        const body = await json(request);
        const update = parseProviderStatusUpdate(body);
        const kind = isIngressPath ? "ingress" : isEgressPath ? "egress" : "call";
        const resourceId = (path[path.length - 1] ?? "").replace(/:status$/u, "");
        if (kind === "ingress") control.getIngress(resourceId, environmentId);
        else if (kind === "egress") control.getEgress(resourceId, environmentId);
        else control.getSipCall(resourceId, environmentId);
        const data = control.applyProviderStatus(kind, resourceId, update);
        await sendMutation(response, 200, { data });
        return;
      }
      if (isTransferPath || isHangupPath) {
        if (provider === undefined) throw new MediaOpsError("PROVIDER_UNAVAILABLE", "SIP provider is not configured");
        const callId = (path[7] ?? "").replace(/:(?:transfer|hangup)$/u, "");
        const call = control.getSipCall(callId, environmentId);
        const idempotencyKey = request.headers["idempotency-key"];
        if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0 || idempotencyKey.length > 128) throw new MediaOpsError("CONFLICT", "idempotency key is required");
        const operation = isTransferPath ? "transfer" : "hangup";
        const cached = control.getOperationResult(operation, environmentId, callId, idempotencyKey);
        if (cached !== undefined) {
          send(response, 200, { data: cached });
          return;
        }
        if (call.participantIdentity === undefined) throw new MediaOpsError("CONFLICT", "SIP participant identity is required for this operation");
        const body = await json(request);
        if (isTransferPath) {
          const transferTo = body.transferTo;
          if (typeof transferTo !== "string" || transferTo.length === 0 || transferTo.length > 256 || transferTo.trim() !== transferTo) throw new MediaOpsError("CONFLICT", "transferTo must be a trimmed non-empty string");
          await provider.transferSipCall({ callId: call.callId, roomName: call.roomName, participantIdentity: call.participantIdentity, transferTo, idempotencyKey });
          const result = control.getSipCall(callId, environmentId);
          control.saveOperationResult(operation, environmentId, callId, idempotencyKey, result);
          await sendMutation(response, 200, { data: result });
          return;
        }
        await provider.hangupSipCall({ callId: call.callId, roomName: call.roomName, participantIdentity: call.participantIdentity, idempotencyKey });
        const result = control.completeSipCall(callId);
        control.saveOperationResult(operation, environmentId, callId, idempotencyKey, result);
        await sendMutation(response, 200, { data: result });
        return;
      }
      if (isCollectionGet || isResourceGet) {
        const resourceId = path[path.length - 1];
        if (isIngressPath) {
          const data = isResourceGet ? control.getIngress(resourceId ?? "", environmentId) : control.listIngress(environmentId);
          send(response, 200, { data });
          return;
        }
        if (isEgressPath) {
          const data = isResourceGet ? control.getEgress(resourceId ?? "", environmentId) : control.listEgress(environmentId);
          send(response, 200, { data });
          return;
        }
        const data = isResourceGet ? control.getSipCall(resourceId ?? "", environmentId) : control.listSipCalls(environmentId);
        send(response, 200, { data });
        return;
      }
      const body = await json(request);
      const idempotencyKey = request.headers["idempotency-key"];
      if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0 || idempotencyKey.length > 128) {
        send(response, 400, { error: "idempotency_key_required" });
        return;
      }
      if (path[5] === "ingress") {
        const existing = control.findIngressByIdempotency(environmentId, idempotencyKey);
        const sourceUrl = typeof body.url === "string" ? body.url : undefined;
        const job = control.createIngress({ environmentId, roomName: String(body.roomName ?? ""), inputType: body.inputType as "rtmp" | "whip" | "url", idempotencyKey, ...(sourceUrl === undefined ? {} : { sourceUrl }) });
        const data = provider === undefined || existing !== undefined ? job : await provider.createIngress({ ingressId: job.ingressId, environmentId, roomName: job.roomName, inputType: job.inputType, ...(sourceUrl === undefined ? {} : { sourceUrl }) }).then((result) => control.activateIngress(job.ingressId, result.providerIngressId)).catch(async (error) => { control.fail("ingress", job.ingressId); await persistSnapshot(); throw new MediaOpsError("PROVIDER_UNAVAILABLE", error instanceof Error ? error.message : "Ingress provider failed"); });
        await sendMutation(response, 201, { data });
        return;
      }
      if (path[5] === "egress") {
        const existing = control.findEgressByIdempotency(environmentId, idempotencyKey);
        const outputTarget = typeof body.outputTarget === "string" ? body.outputTarget : undefined;
        const job = control.createEgress({ environmentId, roomName: String(body.roomName ?? ""), outputType: body.outputType as "mp4" | "hls" | "rtmp", idempotencyKey, ...(outputTarget === undefined ? {} : { outputTarget }) });
        const data = provider === undefined || existing !== undefined ? job : await provider.createEgress({ egressId: job.egressId, environmentId, roomName: job.roomName, outputType: job.outputType, ...(outputTarget === undefined ? {} : { outputTarget }) }).then((result) => control.activateEgress(job.egressId, result)).catch(async (error) => { control.fail("egress", job.egressId); await persistSnapshot(); throw new MediaOpsError("PROVIDER_UNAVAILABLE", error instanceof Error ? error.message : "Egress provider failed"); });
        await sendMutation(response, 201, { data });
        return;
      }
      if (path[5] === "sip" && path[6] === "calls" && body.direction !== undefined) {
        const dtmf = body.dtmf === undefined ? undefined : String(body.dtmf);
        const existing = control.findSipCallByIdempotency(environmentId, idempotencyKey);
        const call = control.requestSipCall({
          environmentId,
          roomName: String(body.roomName ?? ""),
          ...(body.sipTrunkId === undefined ? {} : { sipTrunkId: String(body.sipTrunkId) }),
          ...(body.participantIdentity === undefined ? {} : { participantIdentity: String(body.participantIdentity) }),
          ...(dtmf === undefined ? {} : { dtmf }),
          direction: body.direction as "inbound" | "outbound",
          remoteNumber: String(body.remoteNumber ?? ""),
          idempotencyKey,
        });
        const data = provider === undefined || existing !== undefined ? call : await provider.requestSipCall({
          callId: call.callId,
          environmentId,
          roomName: call.roomName,
          ...(call.sipTrunkId === undefined ? {} : { sipTrunkId: call.sipTrunkId }),
          ...(call.participantIdentity === undefined ? {} : { participantIdentity: call.participantIdentity }),
          ...(dtmf === undefined ? {} : { dtmf }),
          direction: call.direction,
          remoteNumber: String(body.remoteNumber ?? ""),
          idempotencyKey: call.idempotencyKey,
        }).then((result) => {
          if (result.participantIdentity !== undefined && call.participantIdentity === undefined) control.setSipParticipantIdentity(call.callId, result.participantIdentity);
          return control.activateSipCall(call.callId, result.providerCallId);
        }).catch(async (error) => { control.fail("call", call.callId); await persistSnapshot(); throw new MediaOpsError("PROVIDER_UNAVAILABLE", error instanceof Error ? error.message : "SIP provider failed"); });
        await sendMutation(response, 201, { data });
        return;
      }
      send(response, 404, { error: "resource_not_found" });
    } catch (error) {
      const status = error instanceof MediaOpsError ? statusForMediaError(error) : 400;
      send(response, status, { error: error instanceof Error ? error.message : "request_failed" });
    }
  };
}

export function createMediaOpsServer(
  internalCredential: string,
  control?: MediaOpsControl,
  options?: MediaOpsOptions,
  provider?: MediaOpsProvider,
  persistence?: MediaOpsPersistence,
) {
  return createServer(createHandler(internalCredential, control ?? new MediaOpsControl(options ?? { sipEnabled: false }), provider, persistence));
}

export function createMediaOpsHttpsServer(
  internalCredential: string,
  tls: { key: string; cert: string },
  control?: MediaOpsControl,
  options?: MediaOpsOptions,
  provider?: MediaOpsProvider,
  persistence?: MediaOpsPersistence,
) {
  return createHttpsServer(tls, createHandler(internalCredential, control ?? new MediaOpsControl(options ?? { sipEnabled: false }), provider, persistence));
}
