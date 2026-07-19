export type MediaOperationStatusV1 = "requested" | "starting" | "active" | "draining" | "completed" | "failed" | "cancelled";

export interface SipCallV1 {
  callId: string;
  environmentId: string;
  /** The control-plane trunk selected for this call; never contains credentials. */
  sipTrunkId?: string;
  /** LiveKit SIP participant identity used for transfer/hangup operations. */
  participantIdentity?: string;
  direction: "inbound" | "outbound";
  roomName: string;
  remoteNumberHash: string;
  dtmfSequenceHash?: string;
  status: MediaOperationStatusV1;
  providerCallId?: string;
  providerName?: string;
  answeredAt?: string;
  endedAt?: string;
  terminalReasonCode?: string;
  providerSequence?: number;
  providerUpdatedAt?: string;
  edgeAttestationDigest?: string;
  idempotencyKeyHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaProviderUsageV1 {
  providerRecordId: string;
  providerId: string;
  environmentId: string;
  resourceKind: "sip_call" | "ingress" | "egress";
  providerResourceId: string;
  usageType: "duration_ms" | "recording_ms" | "transcoded_ms" | "bytes" | "operation";
  quantity: number;
  unit: "ms" | "byte" | "count";
  amountMicros: number;
  currency: "CNY" | "USD";
  periodStartedAt: string;
  periodEndedAt: string;
  sourceDigest: string;
}

export interface MediaUsageReconciliationV1 {
  reconciliationId: string;
  environmentId: string;
  resourceKind: MediaProviderUsageV1["resourceKind"];
  providerResourceId: string;
  providerQuantity: number;
  platformQuantity: number;
  variance: number;
  status: "matched" | "variance" | "resolved";
  resolutionDigest?: string;
  createdAt: string;
}

export interface SipQualitySummaryV1 {
  environmentId: string;
  callId: string;
  providerId: string;
  postDialDelayMs: number;
  connectedDurationMs: number;
  answered: boolean;
  dtmfAttempted: boolean;
  terminalReasonCode: string;
  observedAt: string;
}

export interface MediaProviderStatusUpdateV1 {
  status: MediaOperationStatusV1;
  providerId?: string;
  providerName?: string;
  objectUri?: string;
  retentionExpiresAt?: string;
  reasonCode?: string;
  participantIdentity?: string;
  providerSequence?: number;
  occurredAt?: string;
  attestationDigest?: string;
}

export interface IngressJobV1 {
  ingressId: string;
  environmentId: string;
  roomName: string;
  inputType: "rtmp" | "whip" | "url";
  status: MediaOperationStatusV1;
  providerIngressId?: string;
  providerName?: string;
  providerSequence?: number;
  providerUpdatedAt?: string;
  edgeAttestationDigest?: string;
  idempotencyKeyHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface EgressJobV1 {
  egressId: string;
  environmentId: string;
  roomName: string;
  outputType: "mp4" | "hls" | "rtmp";
  status: MediaOperationStatusV1;
  providerEgressId?: string;
  providerName?: string;
  providerSequence?: number;
  providerUpdatedAt?: string;
  edgeAttestationDigest?: string;
  objectUri?: string;
  retentionExpiresAt?: string;
  deletedAt?: string;
  deletionEvidenceUri?: string;
  idempotencyKeyHash: string;
  createdAt: string;
  updatedAt: string;
}
