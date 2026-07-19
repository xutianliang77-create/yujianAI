import type { EgressJobV1, IngressJobV1, SipCallV1 } from "@yujian/platform-contracts";

export interface MediaOpsClock { now(): Date }

export interface MediaOpsProvider {
  createIngress(input: { ingressId: string; environmentId: string; roomName: string; inputType: IngressJobV1["inputType"]; sourceUrl?: string }): Promise<{ providerIngressId: string }>;
  createEgress(input: { egressId: string; environmentId: string; roomName: string; outputType: EgressJobV1["outputType"]; outputTarget?: string }): Promise<{ providerEgressId: string; objectUri?: string; retentionExpiresAt?: string }>;
  requestSipCall(input: { callId: string; environmentId: string; roomName: string; sipTrunkId?: string; participantIdentity?: string; dtmf?: string; direction: SipCallV1["direction"]; remoteNumber: string; idempotencyKey: string }): Promise<{ providerCallId: string; participantIdentity?: string; sipTrunkId?: string }>;
  transferSipCall(input: { callId: string; environmentId: string; roomName: string; participantIdentity: string; transferTo: string; sipTrunkId?: string; idempotencyKey: string }): Promise<void>;
  hangupSipCall(input: { callId: string; environmentId: string; roomName: string; participantIdentity: string; sipTrunkId?: string; idempotencyKey: string }): Promise<void>;
  completeSipCall?(input: { callId: string; environmentId: string; sipTrunkId?: string }): Promise<void>;
  completeMediaResource?(input: { kind: "ingress" | "egress"; resourceId: string; environmentId: string }): Promise<void>;
}
