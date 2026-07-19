export interface YujianPlatformSpec {
  releaseName: string;
  chartRef: string;
  chartVersion: string;
  chartDigest: string;
  valuesSecretRef: string;
  targetSchemaVersion: number;
  currentSchemaVersion?: number;
  previousImageDigest?: string;
  executorImage: string;
  timeoutSeconds?: number;
  rollbackToRevision?: number;
  approvalReceiptRef?: string;
  suspended?: boolean;
}

export interface ObjectMeta {
  name: string;
  namespace: string;
  uid: string;
  generation: number;
}

export interface OperatorCondition {
  type: "Ready" | "Progressing" | "Degraded" | "Suspended";
  status: "True" | "False";
  reason: string;
  message: string;
  observedGeneration: number;
  lastTransitionTime: string;
}

export interface YujianPlatformStatus {
  observedGeneration: number;
  phase: "Pending" | "Reconciling" | "Ready" | "Failed" | "Suspended";
  activeJobName?: string;
  appliedChartDigest?: string;
  appliedSchemaVersion?: number;
  conditions: readonly OperatorCondition[];
}

export interface YujianPlatformResource {
  apiVersion: "platform.yujian.ai/v1alpha1";
  kind: "YujianPlatform";
  metadata: ObjectMeta;
  spec: YujianPlatformSpec;
  status?: YujianPlatformStatus;
}

export interface KubernetesJob {
  metadata?: { name?: string };
  status?: { succeeded?: number; failed?: number; conditions?: readonly { type?: string; status?: string; reason?: string; message?: string }[] };
}

export interface OperatorApi {
  listPlatforms(): Promise<readonly YujianPlatformResource[]>;
  getJob(name: string): Promise<KubernetesJob | undefined>;
  createJob(document: Record<string, unknown>): Promise<void>;
  replaceStatus(resource: YujianPlatformResource, status: YujianPlatformStatus): Promise<void>;
}
