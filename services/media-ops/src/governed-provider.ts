import { createHash } from "node:crypto";
import type { MediaOpsProvider } from "./control.js";
import type { MediaBudgetCoordinator, MediaBudgetLease } from "./media-budget.js";
import type { SipAdmissionCoordinator } from "./sip-admission.js";
import type { MediaCapacityCoordinator, MediaCapacityLimitProvider } from "./media-capacity.js";

export interface MediaComplianceReceipt {
  approved: boolean;
  receiptDigest: string;
  expiresAt: string;
}

export interface MediaComplianceVerifier {
  verify(input: { environmentId: string; operation: "ingress" | "egress_recording" | "sip_call" | "sip_transfer" | "sip_hangup" }): Promise<MediaComplianceReceipt>;
}

export interface SipRiskDecisionProvider {
  authorize(input: { environmentId: string; operation: "call" | "transfer"; direction?: "inbound" | "outbound"; destination: string; trunkId?: string }): Promise<{ allowed: boolean; decisionCode: string; trunkId?: string; maxConcurrentCalls?: number; maxCallsPerMinute?: number; maxDailyCostMicros?: number }>;
}

export interface MediaOperationAdmission {
  assertProductionReady(features: { ingress: boolean; egress: boolean; sip: boolean }): void | Promise<void>;
  authorizeIngress(input: Parameters<MediaOpsProvider["createIngress"]>[0]): Promise<MediaBudgetLease>;
  authorizeEgress(input: Parameters<MediaOpsProvider["createEgress"]>[0]): Promise<MediaBudgetLease>;
  authorizeSipCall(input: Parameters<MediaOpsProvider["requestSipCall"]>[0]): Promise<MediaBudgetLease>;
  authorizeSipTransfer(input: Parameters<MediaOpsProvider["transferSipCall"]>[0]): Promise<MediaBudgetLease>;
  authorizeSipHangup(input: Parameters<MediaOpsProvider["hangupSipCall"]>[0]): Promise<MediaBudgetLease>;
  completeSipCall?(input: { environmentId: string; callId: string; sipTrunkId?: string }): Promise<void>;
  completeMediaResource?(input: { environmentId: string; kind: "ingress" | "egress"; resourceId: string }): Promise<void>;
}

export class MediaOperationAdmissionError extends Error {
  constructor(readonly code: "COMPLIANCE" | "RISK" | "BUDGET", message: string) { super(message); this.name = "MediaOperationAdmissionError"; }
}

const NOOP_LEASE: MediaBudgetLease = { commit: async () => undefined, release: async () => undefined };

function receipt(value: MediaComplianceReceipt): void {
  if (!value.approved || !/^sha256:[0-9a-f]{64}$/u.test(value.receiptDigest) || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) {
    throw new MediaOperationAdmissionError("COMPLIANCE", "media compliance receipt is missing, rejected or expired");
  }
}

/** Enforces signed compliance, destination risk and an atomic maximum-cost reservation. */
export class PolicyMediaOperationAdmission implements MediaOperationAdmission {
  constructor(
    private readonly compliance: MediaComplianceVerifier,
    private readonly risk: SipRiskDecisionProvider,
    private readonly budget: MediaBudgetCoordinator,
    private readonly policy: { dailyLimitMicros: number; outboundReservationMicros: number; leaseTtlMs?: number },
    private readonly sipAdmission?: SipAdmissionCoordinator,
    private readonly mediaCapacity?: MediaCapacityCoordinator,
    private readonly mediaLimits?: MediaCapacityLimitProvider,
  ) {
    if (!Number.isSafeInteger(policy.dailyLimitMicros) || policy.dailyLimitMicros < 1 || !Number.isSafeInteger(policy.outboundReservationMicros) || policy.outboundReservationMicros < 1 || policy.outboundReservationMicros > policy.dailyLimitMicros) throw new RangeError("media budget policy is invalid");
    if (policy.leaseTtlMs !== undefined && (!Number.isInteger(policy.leaseTtlMs) || policy.leaseTtlMs < 5_000 || policy.leaseTtlMs > 300_000)) throw new RangeError("media budget lease TTL is invalid");
  }

  assertProductionReady(features: { ingress: boolean; egress: boolean; sip: boolean }): void {
    if ((features.ingress || features.egress) && (this.mediaCapacity === undefined || this.mediaLimits === undefined)) throw new Error("production Ingress/Egress requires distributed capacity admission");
    if (features.sip && this.sipAdmission === undefined) throw new Error("production SIP requires distributed concurrency and frequency admission");
  }

  async authorizeIngress(input: Parameters<MediaOpsProvider["createIngress"]>[0]): Promise<MediaBudgetLease> {
    receipt(await this.compliance.verify({ environmentId: input.environmentId, operation: "ingress" }));
    return this.authorizeMediaCapacity(input.environmentId, "ingress", input.ingressId);
  }

  async authorizeEgress(input: Parameters<MediaOpsProvider["createEgress"]>[0]): Promise<MediaBudgetLease> {
    receipt(await this.compliance.verify({ environmentId: input.environmentId, operation: "egress_recording" }));
    return this.authorizeMediaCapacity(input.environmentId, "egress", input.egressId);
  }

  private async authorizeMediaCapacity(environmentId: string, kind: "ingress" | "egress", resourceId: string): Promise<MediaBudgetLease> {
    if (this.mediaCapacity === undefined && this.mediaLimits === undefined) return NOOP_LEASE;
    if (this.mediaCapacity === undefined || this.mediaLimits === undefined) throw new MediaOperationAdmissionError("BUDGET", "media capacity admission is incomplete");
    const limit = await this.mediaLimits.limit(environmentId, kind);
    const lease = await this.mediaCapacity.reserve({ environmentId, kind, resourceId, limit, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    if (lease === undefined) throw new MediaOperationAdmissionError("BUDGET", `${kind} capacity is exhausted`);
    return lease;
  }

  async authorizeSipCall(input: Parameters<MediaOpsProvider["requestSipCall"]>[0]): Promise<MediaBudgetLease> {
    receipt(await this.compliance.verify({ environmentId: input.environmentId, operation: "sip_call" }));
    const decision = await this.risk.authorize({ environmentId: input.environmentId, operation: "call", direction: input.direction, destination: input.remoteNumber, ...(input.sipTrunkId === undefined ? {} : { trunkId: input.sipTrunkId }) });
    if (!decision.allowed || decision.decisionCode.length === 0 || decision.decisionCode.length > 128) throw new MediaOperationAdmissionError("RISK", "SIP destination was rejected by risk policy");
    if (input.direction !== "outbound") return NOOP_LEASE;
    const ttl = this.policy.leaseTtlMs ?? 60_000;
    const reservationId = createHash("sha256").update(`${input.environmentId}\u0000${input.callId}\u0000${input.idempotencyKey}`).digest("hex");
    const trunkLimit = decision.maxDailyCostMicros;
    if (trunkLimit !== undefined && (!Number.isSafeInteger(trunkLimit) || trunkLimit < 1)) throw new MediaOperationAdmissionError("RISK", "SIP trunk cost limit is invalid");
    const lease = await this.budget.reserve({ environmentId: input.environmentId, reservationId, amountMicros: this.policy.outboundReservationMicros, limitMicros: Math.min(this.policy.dailyLimitMicros, trunkLimit ?? this.policy.dailyLimitMicros), expiresAt: new Date(Date.now() + ttl).toISOString() });
    if (lease === undefined) throw new MediaOperationAdmissionError("BUDGET", "SIP budget is exhausted");
    const trunkId = decision.trunkId ?? input.sipTrunkId;
    if (this.sipAdmission === undefined) return { commit: () => lease.commit(), release: () => lease.release(), resolvedSipTrunkId: trunkId };
    if (trunkId === undefined || decision.maxConcurrentCalls === undefined || decision.maxCallsPerMinute === undefined) {
      await lease.release();
      throw new MediaOperationAdmissionError("RISK", "SIP trunk limits are unavailable");
    }
    const active = await this.sipAdmission.reserve({
      environmentId: input.environmentId,
      trunkId,
      callId: input.callId,
      maxConcurrentCalls: decision.maxConcurrentCalls,
      maxCallsPerMinute: decision.maxCallsPerMinute,
      expiresAt: new Date(Date.now() + 14_400_000).toISOString(),
    });
    if (active === undefined) {
      await lease.release();
      throw new MediaOperationAdmissionError("BUDGET", "SIP concurrency or frequency limit is exhausted");
    }
    return {
      commit: async () => { await lease.commit(); await active.commit(); },
      release: async () => { await Promise.allSettled([lease.release(), active.release()]); },
      complete: async () => { await active.complete?.(); },
      resolvedSipTrunkId: trunkId,
    };
  }

  async authorizeSipTransfer(input: Parameters<MediaOpsProvider["transferSipCall"]>[0]): Promise<MediaBudgetLease> {
    receipt(await this.compliance.verify({ environmentId: input.environmentId, operation: "sip_transfer" }));
    const decision = await this.risk.authorize({ environmentId: input.environmentId, operation: "transfer", destination: input.transferTo, ...(input.sipTrunkId === undefined ? {} : { trunkId: input.sipTrunkId }) });
    if (!decision.allowed) throw new MediaOperationAdmissionError("RISK", "SIP transfer destination was rejected by risk policy");
    return NOOP_LEASE;
  }

  async authorizeSipHangup(input: Parameters<MediaOpsProvider["hangupSipCall"]>[0]): Promise<MediaBudgetLease> {
    receipt(await this.compliance.verify({ environmentId: input.environmentId, operation: "sip_hangup" }));
    return NOOP_LEASE;
  }

  async completeSipCall(input: { environmentId: string; callId: string; sipTrunkId?: string }): Promise<void> {
    if (this.sipAdmission !== undefined && input.sipTrunkId !== undefined) await this.sipAdmission.complete({ environmentId: input.environmentId, trunkId: input.sipTrunkId, callId: input.callId });
  }

  async completeMediaResource(input: { environmentId: string; kind: "ingress" | "egress"; resourceId: string }): Promise<void> {
    await this.mediaCapacity?.complete(input);
  }
}

/** Applies governance before any official LiveKit/provider SIP side effect. */
export class GovernedMediaOpsProvider implements MediaOpsProvider {
  private readonly activeCallLeases = new Map<string, MediaBudgetLease>();
  private readonly activeMediaLeases = new Map<string, MediaBudgetLease>();
  constructor(private readonly provider: MediaOpsProvider, private readonly admission: MediaOperationAdmission) {}
  async createIngress(input: Parameters<MediaOpsProvider["createIngress"]>[0]) {
    const lease = await this.admission.authorizeIngress(input);
    try { const result = await this.provider.createIngress(input); await lease.commit(); if (lease.complete !== undefined) this.activeMediaLeases.set(`ingress:${input.ingressId}`, lease); return result; }
    catch (error) { await lease.release().catch(() => undefined); throw error; }
  }
  async createEgress(input: Parameters<MediaOpsProvider["createEgress"]>[0]) {
    const lease = await this.admission.authorizeEgress(input);
    try { const result = await this.provider.createEgress(input); await lease.commit(); if (lease.complete !== undefined) this.activeMediaLeases.set(`egress:${input.egressId}`, lease); return result; }
    catch (error) { await lease.release().catch(() => undefined); throw error; }
  }

  async requestSipCall(input: Parameters<MediaOpsProvider["requestSipCall"]>[0]) {
    const lease = await this.admission.authorizeSipCall(input);
    try {
      const providerInput = lease.resolvedSipTrunkId === undefined ? input : { ...input, sipTrunkId: lease.resolvedSipTrunkId };
      const result = await this.provider.requestSipCall(providerInput);
      await lease.commit();
      if (lease.complete !== undefined) this.activeCallLeases.set(input.callId, lease);
      return { ...result, ...(lease.resolvedSipTrunkId === undefined ? {} : { sipTrunkId: lease.resolvedSipTrunkId }) };
    }
    catch (error) { await lease.release().catch(() => undefined); throw error; }
  }
  async transferSipCall(input: Parameters<MediaOpsProvider["transferSipCall"]>[0]) {
    const lease = await this.admission.authorizeSipTransfer(input);
    try { const result = await this.provider.transferSipCall(input); await lease.commit(); return result; }
    catch (error) { await lease.release().catch(() => undefined); throw error; }
  }
  async hangupSipCall(input: Parameters<MediaOpsProvider["hangupSipCall"]>[0]) {
    const lease = await this.admission.authorizeSipHangup(input);
    try { const result = await this.provider.hangupSipCall(input); await lease.commit(); await this.completeSipCall(input); return result; }
    catch (error) { await lease.release().catch(() => undefined); throw error; }
  }

  async completeSipCall(input: { callId: string; environmentId: string; sipTrunkId?: string }): Promise<void> {
    if (this.admission.completeSipCall !== undefined) {
      await this.admission.completeSipCall(input);
      this.activeCallLeases.delete(input.callId);
      return;
    }
    const lease = this.activeCallLeases.get(input.callId);
    if (lease === undefined) return;
    this.activeCallLeases.delete(input.callId);
    await lease.complete?.();
  }

  async completeMediaResource(input: { kind: "ingress" | "egress"; resourceId: string; environmentId: string }): Promise<void> {
    if (this.admission.completeMediaResource !== undefined) {
      await this.admission.completeMediaResource(input);
      this.activeMediaLeases.delete(`${input.kind}:${input.resourceId}`);
      return;
    }
    const key = `${input.kind}:${input.resourceId}`;
    const lease = this.activeMediaLeases.get(key);
    if (lease === undefined) return;
    this.activeMediaLeases.delete(key);
    await lease.complete?.();
  }
}
