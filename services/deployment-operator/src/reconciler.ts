import { createHash } from "node:crypto";
import type { OperatorApi, OperatorCondition, YujianPlatformResource, YujianPlatformSpec, YujianPlatformStatus } from "./types.js";

const DNS = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const OCI = /^oci:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?\/[a-z0-9._/-]+$/u;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u;
const STABLE_REF = /^(?:evidence|https|s3|oss):\/\/[^\s?#]+$/u;

function validate(spec: YujianPlatformSpec): void {
  if (!DNS.test(spec.releaseName) || !DNS.test(spec.valuesSecretRef)) throw new Error("release or values secret name is invalid");
  if (!OCI.test(spec.chartRef) || !VERSION.test(spec.chartVersion) || !DIGEST.test(spec.chartDigest)) throw new Error("chart reference, version or digest is invalid");
  if (!Number.isInteger(spec.targetSchemaVersion) || spec.targetSchemaVersion < 1 || spec.targetSchemaVersion > 999) throw new Error("target schema version is invalid");
  if (!/^.+@sha256:[0-9a-f]{64}$/u.test(spec.executorImage)) throw new Error("deployment executor image digest is invalid");
  if (spec.currentSchemaVersion !== undefined && (!Number.isInteger(spec.currentSchemaVersion) || spec.currentSchemaVersion < 0 || spec.currentSchemaVersion > spec.targetSchemaVersion)) throw new Error("current schema version is invalid");
  if ((spec.currentSchemaVersion === undefined) !== (spec.previousImageDigest === undefined) || (spec.previousImageDigest !== undefined && !DIGEST.test(spec.previousImageDigest))) throw new Error("runtime upgrade requires current schema and previous image digest together");
  if (spec.rollbackToRevision !== undefined && spec.currentSchemaVersion === undefined) throw new Error("rollback requires an established runtime version");
  if (spec.timeoutSeconds !== undefined && (!Number.isInteger(spec.timeoutSeconds) || spec.timeoutSeconds < 60 || spec.timeoutSeconds > 3_600)) throw new Error("deployment timeout is invalid");
  if (spec.rollbackToRevision !== undefined && (!Number.isInteger(spec.rollbackToRevision) || spec.rollbackToRevision < 1)) throw new Error("rollback revision is invalid");
  if (spec.rollbackToRevision !== undefined && spec.approvalReceiptRef === undefined) throw new Error("rollback requires an approval receipt reference");
  if (spec.approvalReceiptRef !== undefined && !STABLE_REF.test(spec.approvalReceiptRef)) throw new Error("approval receipt reference is invalid");
}

function condition(resource: YujianPlatformResource, type: OperatorCondition["type"], status: OperatorCondition["status"], reason: string, message: string): OperatorCondition {
  return { type, status, reason, message: message.slice(0, 512), observedGeneration: resource.metadata.generation, lastTransitionTime: new Date().toISOString() };
}

function status(resource: YujianPlatformResource, phase: YujianPlatformStatus["phase"], next: Omit<YujianPlatformStatus, "observedGeneration" | "phase">): YujianPlatformStatus {
  return { observedGeneration: resource.metadata.generation, phase, ...next };
}

function jobName(resource: YujianPlatformResource): string {
  const intent = JSON.stringify({ generation: resource.metadata.generation, chart: resource.spec.chartDigest, rollback: resource.spec.rollbackToRevision });
  return `${resource.metadata.name}-${createHash("sha256").update(intent).digest("hex").slice(0, 10)}`.slice(0, 63);
}

function job(resource: YujianPlatformResource, name: string): Record<string, unknown> {
  const spec = resource.spec;
  const timeout = spec.timeoutSeconds ?? 900;
  const currentSchema = spec.currentSchemaVersion;
  const env: Array<{ name: string; value: string }> = [
    ["YUJIAN_RELEASE_NAME", spec.releaseName], ["YUJIAN_RELEASE_NAMESPACE", resource.metadata.namespace],
    ["YUJIAN_CHART_REF", spec.chartRef], ["YUJIAN_CHART_VERSION", spec.chartVersion], ["YUJIAN_CHART_DIGEST", spec.chartDigest],
    ...(currentSchema === undefined ? [] : [["YUJIAN_CURRENT_SCHEMA_VERSION", String(currentSchema)], ["YUJIAN_TARGET_SCHEMA_VERSION", String(spec.targetSchemaVersion)], ["YUJIAN_PREVIOUS_IMAGE_DIGEST", spec.previousImageDigest!]]),
    ...(spec.rollbackToRevision === undefined ? [] : [["YUJIAN_ROLLBACK_REVISION", String(spec.rollbackToRevision)]]),
    ...(spec.approvalReceiptRef === undefined ? [] : [["YUJIAN_APPROVAL_RECEIPT_REF", spec.approvalReceiptRef]]),
  ].map(([key, value]) => ({ name: key!, value: value! }));
  return {
    apiVersion: "batch/v1", kind: "Job",
    metadata: { name, namespace: resource.metadata.namespace, labels: { "app.kubernetes.io/name": "yujian-deployment", "platform.yujian.ai/owner": resource.metadata.name }, ownerReferences: [{ apiVersion: resource.apiVersion, kind: resource.kind, name: resource.metadata.name, uid: resource.metadata.uid, controller: true, blockOwnerDeletion: true }] },
    spec: { backoffLimit: 0, activeDeadlineSeconds: timeout + 120, ttlSecondsAfterFinished: 86_400, template: { metadata: { labels: { "app.kubernetes.io/name": "yujian-deployment" } }, spec: { restartPolicy: "Never", serviceAccountName: "yujian-deployment-executor", automountServiceAccountToken: true, securityContext: { runAsNonRoot: true, seccompProfile: { type: "RuntimeDefault" } }, containers: [{ name: "executor", image: spec.executorImage, imagePullPolicy: "IfNotPresent", command: ["node", "/app/tools/private-deployment/operator-executor.mjs"], env, securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] }, readOnlyRootFilesystem: true }, volumeMounts: [{ name: "values", mountPath: "/var/run/yujian-values", readOnly: true }, { name: "tmp", mountPath: "/tmp" }] }], volumes: [{ name: "values", secret: { secretName: spec.valuesSecretRef, items: [{ key: "values.yaml", path: "values.yaml" }] } }, { name: "tmp", emptyDir: {} }] } } } },
  };
}

export class DeploymentReconciler {
  constructor(private readonly api: OperatorApi) {}

  async reconcile(resource: YujianPlatformResource): Promise<void> {
    try { validate(resource.spec); } catch (error) {
      await this.api.replaceStatus(resource, status(resource, "Failed", { conditions: [condition(resource, "Degraded", "True", "InvalidSpec", error instanceof Error ? error.message : "invalid spec")] })); return;
    }
    if (resource.spec.suspended === true) {
      await this.api.replaceStatus(resource, status(resource, "Suspended", { conditions: [condition(resource, "Suspended", "True", "Requested", "reconciliation is suspended")] })); return;
    }
    const name = jobName(resource);
    const existing = await this.api.getJob(name);
    if (existing === undefined) {
      await this.api.createJob(job(resource, name));
      await this.api.replaceStatus(resource, status(resource, "Reconciling", { activeJobName: name, conditions: [condition(resource, "Progressing", "True", "JobCreated", "digest-verified deployment job created")] })); return;
    }
    if ((existing.status?.succeeded ?? 0) > 0) {
      await this.api.replaceStatus(resource, status(resource, "Ready", { activeJobName: name, appliedChartDigest: resource.spec.chartDigest, appliedSchemaVersion: resource.spec.targetSchemaVersion, conditions: [condition(resource, "Ready", "True", "ApplySucceeded", "deployment completed")]})); return;
    }
    if ((existing.status?.failed ?? 0) > 0) {
      const failed = existing.status?.conditions?.find((item) => item.type === "Failed");
      await this.api.replaceStatus(resource, status(resource, "Failed", { activeJobName: name, conditions: [condition(resource, "Degraded", "True", failed?.reason ?? "JobFailed", failed?.message ?? "deployment job failed")] })); return;
    }
    if (resource.status?.observedGeneration !== resource.metadata.generation || resource.status.phase !== "Reconciling") {
      await this.api.replaceStatus(resource, status(resource, "Reconciling", { activeJobName: name, conditions: [condition(resource, "Progressing", "True", "JobRunning", "deployment job is running")] }));
    }
  }
}
