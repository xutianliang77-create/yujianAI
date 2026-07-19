import { randomUUID } from "node:crypto";
import type { EgressJobV1, IngressJobV1, MediaProviderStatusUpdateV1, SipCallV1 } from "@yujian/platform-contracts";
import type { MediaOpsSnapshot } from "./persistence.js";
import type { MediaOpsClock, MediaOpsProvider } from "./control-types.js";
import { idempotencyScope, MediaOpsError, requestFingerprint, requireDateText, requireExternalHttpsUrl, requireStableUri, requireTarget, requireText, restoreMediaOpsSnapshot, sha256, STATUS_TRANSITIONS } from "./control-state.js";
export { MediaOpsError } from "./control-state.js";
export type { MediaOpsClock, MediaOpsProvider } from "./control-types.js";

export class MediaOpsControl {
  readonly calls = new Map<string, SipCallV1>();
  readonly ingress = new Map<string, IngressJobV1>();
  readonly egress = new Map<string, EgressJobV1>();
  private readonly idempotency = new Map<string, SipCallV1 | IngressJobV1 | EgressJobV1>();
  private readonly idempotencyFingerprints = new Map<string, string>();
  private readonly operationResults = new Map<string, SipCallV1>();
  private readonly clock: MediaOpsClock;

  constructor(private readonly options: { sipEnabled?: boolean; ingressEnabled?: boolean; egressEnabled?: boolean; maxActiveIngress?: number; maxActiveEgress?: number } = {}, clock: MediaOpsClock = { now: () => new Date() }) {
    this.clock = clock;
  }

  snapshot(): MediaOpsSnapshot { return { calls: [...this.calls.values()], ingress: [...this.ingress.values()], egress: [...this.egress.values()], idempotency: [...this.idempotency.entries()], idempotencyFingerprints: [...this.idempotencyFingerprints.entries()], operationResults: [...this.operationResults.entries()] }; }

  restore(snapshot: MediaOpsSnapshot): void {
    const restored = restoreMediaOpsSnapshot(snapshot);
    this.calls.clear();
    this.ingress.clear();
    this.egress.clear();
    this.idempotency.clear();
    this.idempotencyFingerprints.clear();
    this.operationResults.clear();
    for (const [key, value] of restored.calls) this.calls.set(key, value);
    for (const [key, value] of restored.ingress) this.ingress.set(key, value);
    for (const [key, value] of restored.egress) this.egress.set(key, value);
    for (const [key, value] of restored.idempotency) this.idempotency.set(key, value);
    for (const [key, value] of restored.idempotencyFingerprints) this.idempotencyFingerprints.set(key, value);
    for (const [key, value] of restored.operationResults) this.operationResults.set(key, value);
  }

  requestSipCall(input: { environmentId: string; roomName: string; sipTrunkId?: string; participantIdentity?: string; dtmf?: string; direction: "inbound" | "outbound"; remoteNumber: string; idempotencyKey: string }): SipCallV1 {
    if (this.options.sipEnabled !== true) throw new MediaOpsError("POLICY_DISABLED", "SIP is disabled until provider and compliance gates are approved");
    requireText(input.environmentId, "environmentId");
    requireText(input.roomName, "roomName");
    if (input.sipTrunkId !== undefined) requireText(input.sipTrunkId, "sipTrunkId");
    if (input.participantIdentity !== undefined) requireText(input.participantIdentity, "participantIdentity");
    if (input.dtmf !== undefined && (input.dtmf.length === 0 || input.dtmf.length > 64 || !/^[0-9*#w]+$/u.test(input.dtmf))) throw new MediaOpsError("CONFLICT", "dtmf contains unsupported digits");
    requireText(input.remoteNumber, "remoteNumber");
    requireText(input.idempotencyKey, "idempotencyKey");
    if (!(input.direction === "inbound" || input.direction === "outbound")) {
      throw new MediaOpsError("CONFLICT", "unsupported SIP call direction");
    }
    const scope = idempotencyScope("sip", input.environmentId, input.idempotencyKey);
    const fingerprint = requestFingerprint({
      roomName: input.roomName,
      sipTrunkId: input.sipTrunkId ?? null,
      participantIdentity: input.participantIdentity ?? null,
      dtmf: input.dtmf ?? null,
      direction: input.direction,
      remoteNumberHash: sha256(input.remoteNumber),
    });
    const cached = this.idempotency.get(scope);
    if (cached !== undefined) {
      if (this.idempotencyFingerprints.get(scope) !== fingerprint) throw new MediaOpsError("CONFLICT", "idempotency key was reused with a different SIP request");
      return cached as SipCallV1;
    }
    const now = this.clock.now().toISOString();
    const call: SipCallV1 = {
      callId: `call-${randomUUID()}`,
      environmentId: input.environmentId,
      ...(input.sipTrunkId === undefined ? {} : { sipTrunkId: input.sipTrunkId }),
      ...(input.participantIdentity === undefined ? {} : { participantIdentity: input.participantIdentity }),
      direction: input.direction,
      roomName: input.roomName,
      remoteNumberHash: sha256(input.remoteNumber),
      ...(input.dtmf === undefined ? {} : { dtmfSequenceHash: sha256(input.dtmf) }),
      status: "requested",
      idempotencyKeyHash: sha256(input.idempotencyKey),
      createdAt: now,
      updatedAt: now,
    };
    this.calls.set(call.callId, call);
    this.idempotency.set(scope, call);
    this.idempotencyFingerprints.set(scope, fingerprint);
    return call;
  }

  createIngress(input: { environmentId: string; roomName: string; inputType: IngressJobV1["inputType"]; idempotencyKey: string; sourceUrl?: string }): IngressJobV1 {
    if (this.options.ingressEnabled === false) throw new MediaOpsError("POLICY_DISABLED", "Ingress is disabled by environment policy");
    requireText(input.environmentId, "environmentId");
    requireText(input.roomName, "roomName");
    requireText(input.idempotencyKey, "idempotencyKey");
    if (input.sourceUrl !== undefined) requireExternalHttpsUrl(input.sourceUrl);
    if (input.inputType === "url" && input.sourceUrl === undefined) throw new MediaOpsError("CONFLICT", "sourceUrl is required for URL ingress");
    if (!(input.inputType === "rtmp" || input.inputType === "whip" || input.inputType === "url")) {
      throw new MediaOpsError("CONFLICT", "unsupported ingress input type");
    }
    const scope = idempotencyScope("ingress", input.environmentId, input.idempotencyKey);
    const fingerprint = requestFingerprint({ roomName: input.roomName, inputType: input.inputType, sourceUrl: input.sourceUrl ?? null });
    const cached = this.idempotency.get(scope);
    if (cached !== undefined) {
      if (this.idempotencyFingerprints.get(scope) !== fingerprint) throw new MediaOpsError("CONFLICT", "idempotency key was reused with a different ingress request");
      return cached as IngressJobV1;
    }
    this.enforceActiveLimit(this.ingress, this.options.maxActiveIngress, "ingress");
    const now = this.clock.now().toISOString();
    const job: IngressJobV1 = { ingressId: `ingress-${randomUUID()}`, environmentId: input.environmentId, roomName: input.roomName, inputType: input.inputType, idempotencyKeyHash: sha256(input.idempotencyKey), status: "requested", createdAt: now, updatedAt: now };
    this.ingress.set(job.ingressId, job);
    this.idempotency.set(scope, job);
    this.idempotencyFingerprints.set(scope, fingerprint);
    return job;
  }

  findIngressByIdempotency(environmentId: string, idempotencyKey: string): IngressJobV1 | undefined {
    return this.idempotency.get(idempotencyScope("ingress", environmentId, idempotencyKey)) as IngressJobV1 | undefined;
  }

  createEgress(input: { environmentId: string; roomName: string; outputType: EgressJobV1["outputType"]; idempotencyKey: string; outputTarget?: string }): EgressJobV1 {
    if (this.options.egressEnabled === false) throw new MediaOpsError("POLICY_DISABLED", "Egress is disabled by environment policy");
    requireText(input.environmentId, "environmentId");
    requireText(input.roomName, "roomName");
    requireText(input.idempotencyKey, "idempotencyKey");
    if (input.outputTarget !== undefined) requireTarget(input.outputTarget, "outputTarget");
    if (!(input.outputType === "mp4" || input.outputType === "hls" || input.outputType === "rtmp")) {
      throw new MediaOpsError("CONFLICT", "unsupported egress output type");
    }
    const scope = idempotencyScope("egress", input.environmentId, input.idempotencyKey);
    const fingerprint = requestFingerprint({ roomName: input.roomName, outputType: input.outputType, outputTarget: input.outputTarget ?? null });
    const cached = this.idempotency.get(scope);
    if (cached !== undefined) {
      if (this.idempotencyFingerprints.get(scope) !== fingerprint) throw new MediaOpsError("CONFLICT", "idempotency key was reused with a different egress request");
      return cached as EgressJobV1;
    }
    this.enforceActiveLimit(this.egress, this.options.maxActiveEgress, "egress");
    const now = this.clock.now().toISOString();
    const job: EgressJobV1 = { egressId: `egress-${randomUUID()}`, environmentId: input.environmentId, roomName: input.roomName, outputType: input.outputType, idempotencyKeyHash: sha256(input.idempotencyKey), status: "requested", createdAt: now, updatedAt: now };
    this.egress.set(job.egressId, job);
    this.idempotency.set(scope, job);
    this.idempotencyFingerprints.set(scope, fingerprint);
    return job;
  }

  findEgressByIdempotency(environmentId: string, idempotencyKey: string): EgressJobV1 | undefined {
    return this.idempotency.get(idempotencyScope("egress", environmentId, idempotencyKey)) as EgressJobV1 | undefined;
  }

  transition<T extends SipCallV1 | IngressJobV1 | EgressJobV1>(kind: "call" | "ingress" | "egress", resourceId: string, status: T["status"]): T {
    const map = kind === "call" ? this.calls : kind === "ingress" ? this.ingress : this.egress;
    const current = map.get(resourceId);
    if (current === undefined) throw new MediaOpsError("NOT_FOUND", `${kind} not found`);
    if (!STATUS_TRANSITIONS[current.status].includes(status)) {
      throw new MediaOpsError("CONFLICT", `${kind} cannot transition from ${current.status} to ${status}`);
    }
    const updated = { ...current, status, updatedAt: this.clock.now().toISOString() } as T;
    map.set(resourceId, updated as never);
    return updated;
  }

  getIngress(ingressId: string, environmentId?: string): IngressJobV1 {
    const job = this.ingress.get(ingressId);
    if (job === undefined || (environmentId !== undefined && job.environmentId !== environmentId)) throw new MediaOpsError("NOT_FOUND", "ingress not found");
    return job;
  }

  getEgress(egressId: string, environmentId?: string): EgressJobV1 {
    const job = this.egress.get(egressId);
    if (job === undefined || (environmentId !== undefined && job.environmentId !== environmentId)) throw new MediaOpsError("NOT_FOUND", "egress not found");
    return job;
  }

  getSipCall(callId: string, environmentId?: string): SipCallV1 {
    const call = this.calls.get(callId);
    if (call === undefined || (environmentId !== undefined && call.environmentId !== environmentId)) throw new MediaOpsError("NOT_FOUND", "SIP call not found");
    return call;
  }

  findSipCallByIdempotency(environmentId: string, idempotencyKey: string): SipCallV1 | undefined {
    return this.idempotency.get(idempotencyScope("sip", environmentId, idempotencyKey)) as SipCallV1 | undefined;
  }

  getOperationResult(operation: "transfer" | "hangup", environmentId: string, callId: string, idempotencyKey: string): SipCallV1 | undefined {
    requireText(environmentId, "environmentId");
    requireText(callId, "callId");
    requireText(idempotencyKey, "idempotencyKey");
    return this.operationResults.get(idempotencyScope(`${operation}:${callId}`, environmentId, idempotencyKey));
  }

  saveOperationResult(operation: "transfer" | "hangup", environmentId: string, callId: string, idempotencyKey: string, result: SipCallV1): void {
    requireText(environmentId, "environmentId");
    requireText(callId, "callId");
    requireText(idempotencyKey, "idempotencyKey");
    this.operationResults.set(idempotencyScope(`${operation}:${callId}`, environmentId, idempotencyKey), result);
  }

  activateIngress(ingressId: string, providerIngressId: string): IngressJobV1 {
    requireText(providerIngressId, "providerIngressId");
    const current = this.getIngress(ingressId);
    if (current.status !== "requested") throw new MediaOpsError("CONFLICT", "ingress is not awaiting provider activation");
    const starting = { ...current, status: "starting" as const, providerIngressId, updatedAt: this.clock.now().toISOString() };
    const active = { ...starting, status: "active" as const, updatedAt: this.clock.now().toISOString() };
    this.ingress.set(ingressId, active);
    return active;
  }

  activateEgress(egressId: string, provider: { providerEgressId: string; objectUri?: string; retentionExpiresAt?: string }): EgressJobV1 {
    requireText(provider.providerEgressId, "providerEgressId");
    if (provider.objectUri !== undefined) requireStableUri(provider.objectUri, "objectUri");
    if (provider.retentionExpiresAt !== undefined) requireDateText(provider.retentionExpiresAt, "retentionExpiresAt");
    const current = this.getEgress(egressId);
    if (current.status !== "requested") throw new MediaOpsError("CONFLICT", "egress is not awaiting provider activation");
    const starting = { ...current, status: "starting" as const, providerEgressId: provider.providerEgressId, ...(provider.objectUri === undefined ? {} : { objectUri: provider.objectUri }), ...(provider.retentionExpiresAt === undefined ? {} : { retentionExpiresAt: provider.retentionExpiresAt }), updatedAt: this.clock.now().toISOString() };
    const active = { ...starting, status: "active" as const, updatedAt: this.clock.now().toISOString() };
    this.egress.set(egressId, active);
    return active;
  }

  activateSipCall(callId: string, providerCallId: string): SipCallV1 {
    requireText(providerCallId, "providerCallId");
    const current = this.getSipCall(callId);
    if (current.status !== "requested") throw new MediaOpsError("CONFLICT", "SIP call is not awaiting provider activation");
    const starting = { ...current, status: "starting" as const, providerCallId, updatedAt: this.clock.now().toISOString() };
    const active = { ...starting, status: "active" as const, answeredAt: this.clock.now().toISOString(), updatedAt: this.clock.now().toISOString() };
    this.calls.set(callId, active);
    return active;
  }

  setSipParticipantIdentity(callId: string, participantIdentity: string): SipCallV1 {
    requireText(participantIdentity, "participantIdentity");
    const current = this.getSipCall(callId);
    const updated = { ...current, participantIdentity, updatedAt: this.clock.now().toISOString() };
    this.calls.set(callId, updated);
    return updated;
  }

  setSipTrunkId(callId: string, sipTrunkId: string): SipCallV1 {
    requireText(sipTrunkId, "sipTrunkId");
    const current = this.getSipCall(callId);
    if (current.sipTrunkId !== undefined && current.sipTrunkId !== sipTrunkId) throw new MediaOpsError("CONFLICT", "SIP trunk cannot change after request creation");
    const updated = { ...current, sipTrunkId, updatedAt: this.clock.now().toISOString() };
    this.calls.set(callId, updated);
    return updated;
  }

  completeSipCall(callId: string): SipCallV1 {
    const current = this.getSipCall(callId);
    if (current.status === "completed") return current;
    const completed = this.transition<SipCallV1>("call", callId, "completed");
    const updated = { ...completed, endedAt: this.clock.now().toISOString(), terminalReasonCode: "local_hangup" };
    this.calls.set(callId, updated);
    return updated;
  }

  fail(kind: "ingress" | "egress" | "call", resourceId: string): void {
    const failed = this.transition(kind, resourceId, "failed");
    if (kind === "call") this.calls.set(resourceId, { ...(failed as SipCallV1), endedAt: this.clock.now().toISOString(), terminalReasonCode: "provider_activation_failed" });
  }

  applyProviderStatus(kind: "ingress" | "egress" | "call", resourceId: string, update: MediaProviderStatusUpdateV1): SipCallV1 | IngressJobV1 | EgressJobV1 {
    if (update.providerId !== undefined) requireText(update.providerId, "providerId");
    if (update.objectUri !== undefined) requireStableUri(update.objectUri, "objectUri");
    if (update.retentionExpiresAt !== undefined) requireDateText(update.retentionExpiresAt, "retentionExpiresAt");
    if (update.reasonCode !== undefined) requireText(update.reasonCode, "reasonCode");
    if (update.participantIdentity !== undefined) requireText(update.participantIdentity, "participantIdentity");
    if (update.providerName !== undefined && !/^[a-z][a-z0-9_-]{1,63}$/u.test(update.providerName)) throw new MediaOpsError("CONFLICT", "providerName is invalid");
    if (update.providerSequence !== undefined && (!Number.isSafeInteger(update.providerSequence) || update.providerSequence < 0)) throw new MediaOpsError("CONFLICT", "providerSequence must be a non-negative safe integer");
    if (update.occurredAt !== undefined) requireDateText(update.occurredAt, "occurredAt");
    if (update.attestationDigest !== undefined && !/^sha256:[0-9a-f]{64}$/u.test(update.attestationDigest)) throw new MediaOpsError("CONFLICT", "attestationDigest is invalid");
    const current = kind === "call"
      ? this.getSipCall(resourceId)
      : kind === "ingress"
        ? this.getIngress(resourceId)
        : this.getEgress(resourceId);
    const currentProviderId = kind === "call"
      ? (current as SipCallV1).providerCallId
      : kind === "ingress"
        ? (current as IngressJobV1).providerIngressId
        : (current as EgressJobV1).providerEgressId;
    if ((update.status === "starting" || update.status === "active") && update.providerId === undefined && currentProviderId === undefined) {
      throw new MediaOpsError("CONFLICT", "providerId is required when activating a media resource");
    }
    const currentSequence = current.providerSequence;
    if (currentSequence !== undefined && update.providerSequence !== undefined && update.providerSequence <= currentSequence) return current;
    if (kind === "call" && (current as SipCallV1).direction === "inbound" && current.status === "requested" && (update.status === "starting" || update.status === "active") && update.attestationDigest === undefined) {
      throw new MediaOpsError("CONFLICT", "inbound SIP adoption requires a verified edge attestation");
    }
    const transitioned = current.status === update.status
      ? current
      : current.status === "requested" && update.status === "active"
        ? (this.transition(kind, resourceId, "starting"), this.transition(kind, resourceId, "active"))
        : this.transition(kind, resourceId, update.status);
    const callTerminal = ["completed", "failed", "cancelled"].includes(update.status);
    const enriched = kind === "call"
      ? { ...transitioned, ...(update.providerId === undefined ? {} : { providerCallId: update.providerId }), ...(update.participantIdentity === undefined ? {} : { participantIdentity: update.participantIdentity }), ...(update.status === "active" && (transitioned as SipCallV1).answeredAt === undefined ? { answeredAt: this.clock.now().toISOString() } : {}), ...(callTerminal ? { endedAt: this.clock.now().toISOString(), terminalReasonCode: update.reasonCode ?? update.status } : {}) }
      : kind === "ingress"
        ? { ...transitioned, ...(update.providerId === undefined ? {} : { providerIngressId: update.providerId }) }
        : {
            ...transitioned,
            ...(update.providerId === undefined ? {} : { providerEgressId: update.providerId }),
            ...(update.objectUri === undefined ? {} : { objectUri: update.objectUri }),
            ...(update.retentionExpiresAt === undefined ? {} : { retentionExpiresAt: update.retentionExpiresAt }),
          };
    const withReceipt = {
      ...enriched,
      ...(update.providerSequence === undefined ? {} : { providerSequence: update.providerSequence }),
      ...(update.occurredAt === undefined ? {} : { providerUpdatedAt: update.occurredAt }),
      ...(update.attestationDigest === undefined ? {} : { edgeAttestationDigest: update.attestationDigest }),
      ...(update.providerName === undefined ? {} : { providerName: update.providerName }),
    };
    if (kind === "call") this.calls.set(resourceId, withReceipt as SipCallV1);
    else if (kind === "ingress") this.ingress.set(resourceId, withReceipt as IngressJobV1);
    else this.egress.set(resourceId, withReceipt as EgressJobV1);
    return withReceipt as SipCallV1 | IngressJobV1 | EgressJobV1;
  }

  listIngress(environmentId: string): IngressJobV1[] { return [...this.ingress.values()].filter((job) => job.environmentId === environmentId); }

  listEgress(environmentId: string): EgressJobV1[] { return [...this.egress.values()].filter((job) => job.environmentId === environmentId); }

  listExpiredEgress(now = this.clock.now()): EgressJobV1[] {
    const nowMs = now.getTime();
    if (!Number.isFinite(nowMs)) throw new MediaOpsError("CONFLICT", "retention clock is invalid");
    return [...this.egress.values()].filter((job) =>
      job.objectUri !== undefined &&
      job.retentionExpiresAt !== undefined &&
      job.deletedAt === undefined &&
      ["completed", "failed", "cancelled"].includes(job.status) &&
      Date.parse(job.retentionExpiresAt) <= nowMs,
    );
  }

  markEgressDeleted(egressId: string, evidenceUri: string): EgressJobV1 {
    requireStableUri(evidenceUri, "deletionEvidenceUri");
    const current = this.getEgress(egressId);
    if (current.objectUri === undefined) throw new MediaOpsError("CONFLICT", "egress has no object to delete");
    if (current.deletedAt !== undefined) return current;
    if (!["completed", "failed", "cancelled"].includes(current.status)) throw new MediaOpsError("CONFLICT", "egress is not terminal");
    const now = this.clock.now().toISOString();
    const updated: EgressJobV1 = { ...current, deletedAt: now, deletionEvidenceUri: evidenceUri, updatedAt: now };
    this.egress.set(egressId, updated);
    return updated;
  }

  listSipCalls(environmentId: string): SipCallV1[] { return [...this.calls.values()].filter((call) => call.environmentId === environmentId); }

  private enforceActiveLimit<T extends { status: string }>(map: Map<string, T>, limit: number | undefined, kind: string) {
    if (limit === undefined) return;
    const active = [...map.values()].filter((value) => ["requested", "starting", "active"].includes(value.status)).length;
    if (active >= limit) throw new MediaOpsError("QUOTA_EXCEEDED", `${kind} quota exceeded`);
  }
}
