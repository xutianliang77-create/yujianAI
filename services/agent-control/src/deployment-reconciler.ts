import type { AgentArtifactV1, AgentDeploymentV1 } from "@yujian/platform-contracts";
import { AgentControlPlane } from "./controller.js";
import type { AgentControlPersistence } from "./persistence.js";

export interface AgentDeploymentRuntimeRequest {
  deploymentId: string;
  environmentId: string;
  generation: number;
  exactImageRef: string;
  runtime: AgentArtifactV1["runtime"];
  entrypoint: string;
  desiredReplicas: number;
  canaryPercent: number;
  verificationReceiptDigest: string;
}

export interface AgentDeploymentRuntimeStatus {
  observedGeneration: number;
  readyReplicas: number;
  canaryHealthy: boolean;
  terminalFailure: boolean;
}

export interface AgentDeploymentRuntime {
  apply(request: AgentDeploymentRuntimeRequest): Promise<void>;
  status(deploymentId: string): Promise<AgentDeploymentRuntimeStatus>;
  rollback(deploymentId: string, failedGeneration: number): Promise<void>;
}

export type AgentReconcileOutcome = "waiting" | "canary" | "promoted" | "active" | "rolled_back";

/** Drives one idempotent canary/rolling step; scheduling remains in the deployment runtime. */
export class AgentDeploymentReconciler {
  constructor(
    private readonly control: AgentControlPlane,
    private readonly runtime: AgentDeploymentRuntime,
    private readonly persistence?: AgentControlPersistence,
  ) {}

  async reconcile(deploymentId: string): Promise<AgentReconcileOutcome> {
    const deployment = this.control.deployments.get(deploymentId);
    if (deployment === undefined) throw new Error("deployment not found");
    if (["failed", "rolled_back"].includes(deployment.status)) return deployment.status === "rolled_back" ? "rolled_back" : "waiting";
    const artifact = this.control.artifacts.get(deployment.artifactId);
    if (artifact === undefined) throw new Error("deployment artifact not found");
    await this.runtime.apply(this.request(deployment, artifact));
    const observed = await this.runtime.status(deploymentId);
    if (observed.observedGeneration > deployment.generation) throw new Error("runtime observed an unknown deployment generation");
    if (observed.terminalFailure && observed.observedGeneration === deployment.generation) {
      this.control.failDeployment(deploymentId);
      await this.persist();
      await this.runtime.rollback(deploymentId, deployment.generation);
      this.control.rollback(deploymentId);
      await this.persist();
      return "rolled_back";
    }
    if (observed.observedGeneration < deployment.generation) return "waiting";
    this.control.reconcile(deploymentId, observed.readyReplicas);
    if (deployment.status === "canary") {
      if (!observed.canaryHealthy || observed.readyReplicas < 1) { await this.persist(); return "canary"; }
      this.control.promote(deploymentId);
      await this.persist();
      return "promoted";
    }
    await this.persist();
    return observed.readyReplicas === deployment.desiredReplicas ? "active" : "waiting";
  }

  private request(deployment: AgentDeploymentV1, artifact: AgentArtifactV1): AgentDeploymentRuntimeRequest {
    return {
      deploymentId: deployment.deploymentId,
      environmentId: deployment.environmentId,
      generation: deployment.generation,
      exactImageRef: `${artifact.image}@${artifact.digest}`,
      runtime: artifact.runtime,
      entrypoint: artifact.entrypoint,
      desiredReplicas: deployment.desiredReplicas,
      canaryPercent: deployment.canaryPercent,
      verificationReceiptDigest: artifact.verification.receiptDigest,
    };
  }

  private async persist(): Promise<void> { await this.persistence?.save(this.control.snapshot()); }
}
