export interface RtcQualitySampleV1 {
  sampleId: string;
  tenantId: string;
  projectId: string;
  environmentId: string;
  nodeId: string;
  roomName: string;
  participantIdentity: string;
  capturedAt: string;
  rttMs?: number;
  jitterMs?: number;
  packetsLost?: number;
  packetsSent?: number;
  bitrateKbps?: number;
  audioLevel?: number;
}

export interface RtcQualitySummaryV1 {
  environmentId: string;
  windowStart: string;
  windowEnd: string;
  sampleCount: number;
  packetLossRate: number;
  p50RttMs?: number;
  p95RttMs?: number;
  p99RttMs?: number;
  p50JitterMs?: number;
  p95JitterMs?: number;
  p99JitterMs?: number;
  averageBitrateKbps?: number;
}
