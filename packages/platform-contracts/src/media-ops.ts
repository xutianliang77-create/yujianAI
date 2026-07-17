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
  status: MediaOperationStatusV1;
  providerCallId?: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaProviderStatusUpdateV1 {
  status: MediaOperationStatusV1;
  providerId?: string;
  objectUri?: string;
  retentionExpiresAt?: string;
}

export interface IngressJobV1 {
  ingressId: string;
  environmentId: string;
  roomName: string;
  inputType: "rtmp" | "whip" | "url";
  status: MediaOperationStatusV1;
  providerIngressId?: string;
  idempotencyKey: string;
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
  objectUri?: string;
  retentionExpiresAt?: string;
  deletedAt?: string;
  deletionEvidenceUri?: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}
