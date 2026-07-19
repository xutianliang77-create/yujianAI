import type {
  AgentArtifactV1,
  AgentDeploymentV1,
  AgentDispatchRuleV1,
  AgentDispatchV1,
  AgentToolPolicyV1,
  AgentWorkerRuntimeV1,
} from "@yujian/platform-contracts";

export interface AgentControlClock { now(): Date }

export interface AgentWorkerRegistrationV1 {
  workerId: string;
  environmentId: string;
  runtime: AgentWorkerRuntimeV1;
  capabilities: readonly string[];
}

export interface AgentWorkerStateV1 extends AgentWorkerRegistrationV1 {
  status: "ready" | "draining" | "offline";
  activeDispatchIds: readonly string[];
  lastHeartbeatAt: string;
}

export interface AgentControlSnapshot {
  artifacts: readonly AgentArtifactV1[];
  deployments: readonly AgentDeploymentV1[];
  rules: readonly AgentDispatchRuleV1[];
  dispatches: readonly AgentDispatchV1[];
  tools: readonly AgentToolPolicyV1[];
  workers: readonly AgentWorkerStateV1[];
}
