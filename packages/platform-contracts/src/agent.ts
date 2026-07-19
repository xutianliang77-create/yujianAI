export type AgentWorkerRuntimeV1 = "node" | "python";
export type AgentDeploymentStatusV1 = "draft" | "canary" | "active" | "draining" | "failed" | "rolled_back";
export type AgentToolRiskV1 = "L0" | "L1" | "L2" | "L3";

export interface AgentArtifactVerificationV1 {
  verifierId: string;
  policyDigest: string;
  receiptDigest: string;
  verifiedAt: string;
}

export interface AgentArtifactV1 {
  artifactId: string;
  tenantId: string;
  projectId: string;
  image: string;
  digest: string;
  runtime: AgentWorkerRuntimeV1;
  entrypoint: string;
  sbomUri?: string;
  signatureRef: string;
  verification: AgentArtifactVerificationV1;
  createdAt: string;
}

export interface AgentDeploymentV1 {
  deploymentId: string;
  environmentId: string;
  artifactId: string;
  desiredReplicas: number;
  observedReplicas: number;
  generation: number;
  status: AgentDeploymentStatusV1;
  canaryPercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentDispatchRuleV1 {
  ruleId: string;
  environmentId: string;
  trigger: "room_joined" | "track_published" | "data_received" | "scheduled";
  agentArtifactId: string;
  maxConcurrent: number;
  timeoutMs: number;
  enabled: boolean;
}

export interface ProviderCapabilityV1 {
  providerId: string;
  capability: "realtime" | "llm" | "asr" | "tts" | "vlm" | "moderation";
  regions: readonly string[];
  supportsStreaming: boolean;
  status: "healthy" | "degraded" | "disabled";
}

export interface ProviderUsageV1 {
  inputTextUnits: number;
  outputTextUnits: number;
  inputAudioMs: number;
  outputAudioMs: number;
  imageUnits: number;
}

export interface ProviderCostAttributionV1 {
  currency: "CNY" | "USD";
  amountMicros: number;
  pricingVersion: string;
}

export interface AgentSecretBindingV1 {
  bindingId: string;
  environmentId: string;
  providerId: string;
  secretRef: string;
  workloadAudience: string;
  maxTtlSeconds: number;
}

export interface AgentToolPolicyV1 {
  toolId: string;
  name: string;
  risk: AgentToolRiskV1;
  requiresExplicitApproval: boolean;
  allowedRoles: readonly string[];
  idempotencyRequired: boolean;
  timeoutMs: number;
}

export interface AgentDispatchV1 {
  dispatchId: string;
  environmentId: string;
  deploymentId: string;
  roomName: string;
  status: "queued" | "starting" | "running" | "draining" | "completed" | "failed" | "cancelled";
  deadlineAt: string;
  traceId: string;
  createdAt: string;
}
