import { readFile } from "node:fs/promises";
import type { KubernetesJob, OperatorApi, YujianPlatformResource, YujianPlatformStatus } from "./types.js";

interface ListResponse<T> { items?: readonly T[]; }

export class KubernetesApiError extends Error {
  constructor(message: string, readonly statusCode: number) { super(message); this.name = "KubernetesApiError"; }
}

export class InClusterOperatorApi implements OperatorApi {
  constructor(private readonly apiServer: string, private readonly namespace: string, private readonly tokenFile: string, private readonly fetchImpl: typeof fetch = fetch) {}

  async listPlatforms(): Promise<readonly YujianPlatformResource[]> {
    const document = await this.request<ListResponse<YujianPlatformResource>>("GET", `/apis/platform.yujian.ai/v1alpha1/namespaces/${this.namespace}/yujianplatforms`);
    return Array.isArray(document.items) ? document.items : [];
  }

  async getJob(name: string): Promise<KubernetesJob | undefined> {
    try { return await this.request<KubernetesJob>("GET", `/apis/batch/v1/namespaces/${this.namespace}/jobs/${name}`); }
    catch (error) { if (error instanceof KubernetesApiError && error.statusCode === 404) return undefined; throw error; }
  }

  async createJob(document: Record<string, unknown>): Promise<void> {
    await this.request("POST", `/apis/batch/v1/namespaces/${this.namespace}/jobs`, document);
  }

  async replaceStatus(resource: YujianPlatformResource, status: YujianPlatformStatus): Promise<void> {
    await this.request("PUT", `/apis/platform.yujian.ai/v1alpha1/namespaces/${this.namespace}/yujianplatforms/${resource.metadata.name}/status`, {
      apiVersion: resource.apiVersion,
      kind: resource.kind,
      metadata: { name: resource.metadata.name, namespace: resource.metadata.namespace, resourceVersion: (resource.metadata as unknown as Record<string, unknown>).resourceVersion },
      spec: resource.spec,
      status,
    });
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const token = (await readFile(this.tokenFile, "utf8")).trim();
    if (token.length < 32) throw new Error("Kubernetes service-account token is invalid");
    const response = await this.fetchImpl(`${this.apiServer}${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      headers: { accept: "application/json", authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    });
    const text = await response.text();
    if (!response.ok) throw new KubernetesApiError(`Kubernetes API ${method} ${path} returned ${response.status}: ${text.slice(0, 512)}`, response.status);
    if (text.length === 0) return undefined as T;
    return JSON.parse(text) as T;
  }
}
