import { randomUUID } from "node:crypto";
import type {
  AgentArtifactV1,
  AgentDeploymentV1,
  AgentDispatchRuleV1,
  AgentDispatchV1,
  AgentToolPolicyV1,
  AgentWorkerRuntimeV1,
} from "@yujian/platform-contracts";

export class AgentControlError extends Error {
  constructor(readonly code: "NOT_FOUND" | "CONFLICT" | "QUOTA_EXCEEDED" | "POLICY_DENIED", message: string) {
    super(message);
    this.name = "AgentControlError";
  }
}

export interface AgentControlClock { now(): Date }

export interface AgentArtifactVerificationInput {
  image: string;
  digest: string;
  signatureRef: string;
  sbomUri?: string;
}

export interface AgentControlOptions {
  verifyArtifact?: (input: AgentArtifactVerificationInput) => boolean;
}

function requiredText(value: string, field: string): string {
  if (value.length === 0 || value.length > 256 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) throw new AgentControlError("CONFLICT", `${field} is invalid`);
  return value;
}

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

function mapFromSnapshot<T extends object>(values: readonly T[], field: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const id = (value as Record<string, unknown>)[field];
    if (typeof id !== "string" || id.length === 0 || result.has(id)) throw new Error(`invalid agent snapshot ${field}`);
    result.set(id, value);
  }
  return result;
}

export class AgentControlPlane {
  readonly artifacts = new Map<string, AgentArtifactV1>();
  readonly deployments = new Map<string, AgentDeploymentV1>();
  readonly rules = new Map<string, AgentDispatchRuleV1>();
  readonly dispatches = new Map<string, AgentDispatchV1>();
  readonly tools = new Map<string, AgentToolPolicyV1>();
  readonly workers = new Map<string, AgentWorkerStateV1>();
  private readonly clock: AgentControlClock;
  private readonly options: AgentControlOptions;

  constructor(clock: AgentControlClock = { now: () => new Date() }, options: AgentControlOptions = {}) { this.clock = clock; this.options = options; }

  snapshot(): AgentControlSnapshot {
    return {
      artifacts: [...this.artifacts.values()],
      deployments: [...this.deployments.values()],
      rules: [...this.rules.values()],
      dispatches: [...this.dispatches.values()],
      tools: [...this.tools.values()],
      workers: [...this.workers.values()],
    };
  }

  restore(snapshot: AgentControlSnapshot): void {
    if (typeof snapshot !== "object" || snapshot === null) throw new Error("agent control snapshot must be an object");
    const collections = [
      [snapshot.artifacts, "artifactId"],
      [snapshot.deployments, "deploymentId"],
      [snapshot.rules, "ruleId"],
      [snapshot.dispatches, "dispatchId"],
      [snapshot.tools, "toolId"],
      [snapshot.workers, "workerId"],
    ] as const;
    const maps = collections.map(([values, field]) => {
      if (!Array.isArray(values)) throw new Error(`agent control snapshot ${field} must be an array`);
      return mapFromSnapshot(values, field);
    });
    for (const artifact of maps[0]!.values() as Iterable<AgentArtifactV1>) {
      if (!/^sha256:[0-9a-f]{64}$/u.test(artifact.digest) || typeof artifact.signatureRef !== "string" || artifact.signatureRef.length === 0) throw new Error("invalid artifact snapshot");
    }
    this.artifacts.clear();
    this.deployments.clear();
    this.rules.clear();
    this.dispatches.clear();
    this.tools.clear();
    this.workers.clear();
    for (const [id, value] of maps[0]!) this.artifacts.set(id, value as AgentArtifactV1);
    for (const [id, value] of maps[1]!) this.deployments.set(id, value as AgentDeploymentV1);
    for (const [id, value] of maps[2]!) this.rules.set(id, value as AgentDispatchRuleV1);
    for (const [id, value] of maps[3]!) this.dispatches.set(id, value as AgentDispatchV1);
    for (const [id, value] of maps[4]!) this.tools.set(id, value as AgentToolPolicyV1);
    for (const [id, value] of maps[5]!) this.workers.set(id, value as AgentWorkerStateV1);
  }

  registerArtifact(input: Omit<AgentArtifactV1, "artifactId" | "createdAt">): AgentArtifactV1 {
    requiredText(input.tenantId, "tenantId");
    requiredText(input.projectId, "projectId");
    requiredText(input.image, "image");
    requiredText(input.entrypoint, "entrypoint");
    if (!/^sha256:[0-9a-f]{64}$/u.test(input.digest)) throw new AgentControlError("POLICY_DENIED", "artifact digest must be a sha256 hex digest");
    if (typeof input.signatureRef !== "string" || input.signatureRef.length === 0 || input.signatureRef.length > 512 || input.signatureRef.trim() !== input.signatureRef || /[\u0000-\u001f\u007f]/u.test(input.signatureRef)) throw new AgentControlError("POLICY_DENIED", "signed artifact reference is invalid");
    if (input.sbomUri !== undefined && (input.sbomUri.length === 0 || input.sbomUri.length > 2048 || input.sbomUri.trim() !== input.sbomUri || /[\u0000-\u001f\u007f]/u.test(input.sbomUri))) throw new AgentControlError("POLICY_DENIED", "artifact SBOM reference is invalid");
    if (this.options.verifyArtifact !== undefined && !this.options.verifyArtifact({ image: input.image, digest: input.digest, signatureRef: input.signatureRef, ...(input.sbomUri === undefined ? {} : { sbomUri: input.sbomUri }) })) throw new AgentControlError("POLICY_DENIED", "artifact signature verification failed");
    const artifact: AgentArtifactV1 = { ...input, artifactId: `artifact-${randomUUID()}`, createdAt: this.clock.now().toISOString() };
    this.artifacts.set(artifact.artifactId, artifact);
    return artifact;
  }

  deploy(environmentId: string, artifactId: string, desiredReplicas: number, canaryPercent = 10): AgentDeploymentV1 {
    requiredText(environmentId, "environmentId");
    if (!this.artifacts.has(artifactId)) throw new AgentControlError("NOT_FOUND", "artifact not found");
    if (!Number.isInteger(desiredReplicas) || desiredReplicas < 1 || desiredReplicas > 100) throw new AgentControlError("QUOTA_EXCEEDED", "desired replicas out of range");
    if (!Number.isInteger(canaryPercent) || canaryPercent < 0 || canaryPercent > 100) throw new AgentControlError("POLICY_DENIED", "canary percent out of range");
    const deployment: AgentDeploymentV1 = {
      deploymentId: `deployment-${randomUUID()}`,
      environmentId,
      artifactId,
      desiredReplicas,
      observedReplicas: 0,
      generation: 1,
      status: canaryPercent === 100 ? "active" : "canary",
      canaryPercent,
      createdAt: this.clock.now().toISOString(),
      updatedAt: this.clock.now().toISOString(),
    };
    this.deployments.set(deployment.deploymentId, deployment);
    return deployment;
  }

  reconcile(deploymentId: string, observedReplicas: number): AgentDeploymentV1 {
    const current = this.requireDeployment(deploymentId);
    if (!Number.isInteger(observedReplicas) || observedReplicas < 0 || observedReplicas > 100) throw new AgentControlError("QUOTA_EXCEEDED", "observed replicas out of range");
    const updated: AgentDeploymentV1 = {
      ...current,
      observedReplicas,
      status: observedReplicas === current.desiredReplicas ? "active" : current.status,
      updatedAt: this.clock.now().toISOString(),
    };
    this.deployments.set(deploymentId, updated);
    return updated;
  }

  rollback(deploymentId: string): AgentDeploymentV1 {
    const current = this.requireDeployment(deploymentId);
    const updated = { ...current, status: "rolled_back" as const, generation: current.generation + 1, updatedAt: this.clock.now().toISOString() };
    this.deployments.set(deploymentId, updated);
    return updated;
  }

  dispatch(environmentId: string, deploymentId: string, roomName: string, deadlineAt: string): AgentDispatchV1 {
    const deployment = this.requireDeployment(deploymentId);
    requiredText(environmentId, "environmentId");
    requiredText(roomName, "roomName");
    if (deployment.environmentId !== environmentId || deployment.status === "failed" || deployment.status === "rolled_back") throw new AgentControlError("POLICY_DENIED", "deployment cannot receive dispatch");
    if (!Number.isFinite(Date.parse(deadlineAt)) || Date.parse(deadlineAt) <= this.clock.now().getTime()) throw new AgentControlError("CONFLICT", "dispatch deadline is invalid or elapsed");
    const dispatch: AgentDispatchV1 = {
      dispatchId: `dispatch-${randomUUID()}`,
      environmentId,
      deploymentId,
      roomName,
      status: "queued",
      deadlineAt,
      traceId: `trace-${randomUUID()}`,
      createdAt: this.clock.now().toISOString(),
    };
    this.dispatches.set(dispatch.dispatchId, dispatch);
    return dispatch;
  }

  cancelDispatch(dispatchId: string, workerId?: string): AgentDispatchV1 {
    const current = this.dispatches.get(dispatchId);
    if (current === undefined) throw new AgentControlError("NOT_FOUND", "dispatch not found");
    if (["completed", "failed", "cancelled"].includes(current.status)) throw new AgentControlError("CONFLICT", "dispatch is already terminal");
    if (workerId !== undefined) {
      const worker = this.workers.get(workerId);
      if (worker === undefined) throw new AgentControlError("NOT_FOUND", "worker not found");
      if (worker.environmentId !== current.environmentId || !worker.activeDispatchIds.includes(dispatchId)) throw new AgentControlError("POLICY_DENIED", "worker does not own this dispatch");
    }
    const updated = { ...current, status: "cancelled" as const };
    this.dispatches.set(dispatchId, updated);
    for (const [workerId, worker] of this.workers.entries()) {
      if (!worker.activeDispatchIds.includes(dispatchId)) continue;
      this.workers.set(workerId, { ...worker, activeDispatchIds: worker.activeDispatchIds.filter((id) => id !== dispatchId), lastHeartbeatAt: this.clock.now().toISOString() });
    }
    return updated;
  }

  registerWorker(input: AgentWorkerRegistrationV1): AgentWorkerStateV1 {
    requiredText(input.workerId, "workerId");
    requiredText(input.environmentId, "environmentId");
    if (input.runtime !== "node" && input.runtime !== "python") throw new AgentControlError("CONFLICT", "worker runtime is invalid");
    if (input.capabilities.length > 64 || input.capabilities.some((capability) => typeof capability !== "string" || capability.length === 0 || capability.length > 128 || capability.trim() !== capability || /[\u0000-\u001f\u007f]/u.test(capability))) throw new AgentControlError("CONFLICT", "worker capabilities are invalid");
    const now = this.clock.now().toISOString();
    const current = this.workers.get(input.workerId);
    if (current !== undefined && current.environmentId !== input.environmentId) throw new AgentControlError("POLICY_DENIED", "worker cannot change environment");
    const worker: AgentWorkerStateV1 = {
      ...input,
      status: "ready",
      activeDispatchIds: current?.activeDispatchIds ?? [],
      lastHeartbeatAt: now,
    };
    this.workers.set(worker.workerId, worker);
    return worker;
  }

  heartbeatWorker(workerId: string, activeDispatchIds: readonly string[]): AgentWorkerStateV1 {
    requiredText(workerId, "workerId");
    if (activeDispatchIds.length > 100 || activeDispatchIds.some((dispatchId) => typeof dispatchId !== "string" || dispatchId.length === 0 || dispatchId.length > 256 || /[\u0000-\u001f\u007f]/u.test(dispatchId))) throw new AgentControlError("CONFLICT", "active dispatch list is invalid");
    const current = this.workers.get(workerId);
    if (current === undefined) throw new AgentControlError("NOT_FOUND", "worker not found");
    const dispatchIds = [...new Set(activeDispatchIds)];
    for (const dispatchId of dispatchIds) {
      const dispatch = this.dispatches.get(dispatchId);
      if (dispatch === undefined || dispatch.environmentId !== current.environmentId || !["starting", "running", "draining"].includes(dispatch.status)) throw new AgentControlError("POLICY_DENIED", "worker heartbeat contains an unowned dispatch");
    }
    const worker = { ...current, status: "ready" as const, activeDispatchIds: dispatchIds, lastHeartbeatAt: this.clock.now().toISOString() };
    this.workers.set(workerId, worker);
    return worker;
  }

  claimNextDispatch(workerId: string): AgentDispatchV1 | undefined {
    const worker = this.workers.get(workerId);
    if (worker === undefined) throw new AgentControlError("NOT_FOUND", "worker not found");
    if (worker.status !== "ready") throw new AgentControlError("POLICY_DENIED", "worker is not ready");
    const candidates = [...this.dispatches.values()]
      .filter((dispatch) => dispatch.environmentId === worker.environmentId && dispatch.status === "queued")
      .sort((left, right) => Date.parse(left.deadlineAt) - Date.parse(right.deadlineAt));
    for (const dispatch of candidates) {
      if (Date.parse(dispatch.deadlineAt) <= this.clock.now().getTime()) {
        this.dispatches.set(dispatch.dispatchId, { ...dispatch, status: "failed" });
        continue;
      }
      return this.startDispatch(workerId, dispatch.dispatchId);
    }
    return undefined;
  }

  registerRule(input: Omit<AgentDispatchRuleV1, "ruleId">): AgentDispatchRuleV1 {
    requiredText(input.environmentId, "environmentId");
    requiredText(input.agentArtifactId, "agentArtifactId");
    if (!this.artifacts.has(input.agentArtifactId)) throw new AgentControlError("NOT_FOUND", "rule artifact not found");
    if (!Number.isInteger(input.maxConcurrent) || input.maxConcurrent < 1 || input.maxConcurrent > 1000) throw new AgentControlError("QUOTA_EXCEEDED", "rule maxConcurrent is invalid");
    if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 100 || input.timeoutMs > 86_400_000) throw new AgentControlError("CONFLICT", "rule timeoutMs is invalid");
    if (!["room_joined", "track_published", "data_received", "scheduled"].includes(input.trigger)) throw new AgentControlError("CONFLICT", "rule trigger is invalid");
    const rule: AgentDispatchRuleV1 = { ...input, ruleId: `rule-${randomUUID()}` };
    this.rules.set(rule.ruleId, rule);
    return rule;
  }

  triggerDispatch(environmentId: string, trigger: AgentDispatchRuleV1["trigger"], roomName: string, deadlineAt?: string): AgentDispatchV1 {
    requiredText(environmentId, "environmentId");
    requiredText(roomName, "roomName");
    const rule = [...this.rules.values()].find((candidate) => candidate.environmentId === environmentId && candidate.trigger === trigger && candidate.enabled);
    if (rule === undefined) throw new AgentControlError("NOT_FOUND", "no enabled dispatch rule matches trigger");
    const deployment = [...this.deployments.values()].find((candidate) => candidate.environmentId === environmentId && candidate.artifactId === rule.agentArtifactId && ["canary", "active"].includes(candidate.status));
    if (deployment === undefined) throw new AgentControlError("POLICY_DENIED", "rule deployment is not active");
    const activeCount = [...this.dispatches.values()].filter((candidate) => candidate.deploymentId === deployment.deploymentId && ["queued", "starting", "running", "draining"].includes(candidate.status)).length;
    if (activeCount >= rule.maxConcurrent) throw new AgentControlError("QUOTA_EXCEEDED", "dispatch rule concurrency exceeded");
    const deadline = deadlineAt ?? new Date(this.clock.now().getTime() + rule.timeoutMs).toISOString();
    return this.dispatch(environmentId, deployment.deploymentId, roomName, deadline);
  }

  startDispatch(workerId: string, dispatchId: string): AgentDispatchV1 {
    const worker = this.workers.get(workerId);
    if (worker === undefined) throw new AgentControlError("NOT_FOUND", "worker not found");
    if (worker.status !== "ready") throw new AgentControlError("POLICY_DENIED", "worker is not ready");
    const current = this.dispatches.get(dispatchId);
    if (current === undefined) throw new AgentControlError("NOT_FOUND", "dispatch not found");
    if (current.status !== "queued") throw new AgentControlError("CONFLICT", "dispatch is not queued");
    if (current.environmentId !== worker.environmentId) throw new AgentControlError("POLICY_DENIED", "worker cannot accept another environment's dispatch");
    if (Date.parse(current.deadlineAt) <= this.clock.now().getTime()) throw new AgentControlError("CONFLICT", "dispatch deadline elapsed");
    const updated = { ...current, status: "running" as const };
    this.dispatches.set(dispatchId, updated);
    this.workers.set(workerId, {
      ...worker,
      activeDispatchIds: [...new Set([...worker.activeDispatchIds, dispatchId])],
      lastHeartbeatAt: this.clock.now().toISOString(),
    });
    return updated;
  }

  completeDispatch(workerId: string, dispatchId: string): AgentDispatchV1 {
    return this.finishDispatch(workerId, dispatchId, "completed");
  }

  failDispatch(workerId: string, dispatchId: string, reason: string): AgentDispatchV1 {
    if (reason.length === 0 || reason.length > 256) throw new AgentControlError("CONFLICT", "dispatch failure reason is invalid");
    return this.finishDispatch(workerId, dispatchId, "failed");
  }

  private finishDispatch(workerId: string, dispatchId: string, status: "completed" | "failed"): AgentDispatchV1 {
    const worker = this.workers.get(workerId);
    if (worker === undefined) throw new AgentControlError("NOT_FOUND", "worker not found");
    const current = this.dispatches.get(dispatchId);
    if (current === undefined) throw new AgentControlError("NOT_FOUND", "dispatch not found");
    if (!["starting", "running", "draining"].includes(current.status)) throw new AgentControlError("CONFLICT", "dispatch is not active");
    if (current.environmentId !== worker.environmentId || !worker.activeDispatchIds.includes(dispatchId)) throw new AgentControlError("POLICY_DENIED", "worker does not own this dispatch");
    const updated = { ...current, status } as AgentDispatchV1;
    this.dispatches.set(dispatchId, updated);
    this.workers.set(workerId, {
      ...worker,
      activeDispatchIds: worker.activeDispatchIds.filter((id) => id !== dispatchId),
      lastHeartbeatAt: this.clock.now().toISOString(),
    });
    return updated;
  }

  private requireDeployment(deploymentId: string): AgentDeploymentV1 {
    const deployment = this.deployments.get(deploymentId);
    if (deployment === undefined) throw new AgentControlError("NOT_FOUND", "deployment not found");
    return deployment;
  }
}
