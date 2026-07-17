export interface WorkerRegistration {
  workerId: string;
  environmentId: string;
  runtime: "node" | "python";
  capabilities: readonly string[];
}

export interface ClaimedDispatch {
  dispatchId: string;
  environmentId: string;
  deploymentId: string;
  roomName: string;
  status: "running";
  deadlineAt: string;
  traceId: string;
  createdAt: string;
}

export interface WorkerControlClientOptions {
  baseUrl: string;
  credential: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class WorkerControlError extends Error {
  constructor(message: string, readonly statusCode?: number) {
    super(message);
    this.name = "WorkerControlError";
  }
}

/** Internal worker lifecycle client; the credential is never sent in a JSON body. */
export class WorkerControlClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: WorkerControlClientOptions) {
    const url = new URL(options.baseUrl);
    if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new TypeError("worker control URL must use HTTPS outside loopback");
    this.baseUrl = options.baseUrl.replace(/\/$/u, "");
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (options.credential.length < 32) throw new TypeError("worker control credential is too short");
  }

  register(input: WorkerRegistration): Promise<unknown> {
    return this.post("/internal/v1/agent-workers/register", input);
  }

  heartbeat(workerId: string, activeDispatchIds: readonly string[]): Promise<unknown> {
    return this.post("/internal/v1/agent-workers/heartbeat", { workerId, activeDispatchIds });
  }

  start(workerId: string, dispatchId: string): Promise<unknown> {
    return this.post("/internal/v1/agent-workers/start", { workerId, dispatchId });
  }

  complete(workerId: string, dispatchId: string): Promise<unknown> {
    return this.post("/internal/v1/agent-workers/complete", { workerId, dispatchId });
  }

  fail(workerId: string, dispatchId: string, reason: string): Promise<unknown> {
    return this.post("/internal/v1/agent-workers/fail", { workerId, dispatchId, reason });
  }

  cancel(workerId: string, dispatchId: string): Promise<unknown> {
    return this.post("/internal/v1/agent-workers/cancel", { workerId, dispatchId });
  }

  async claim(workerId: string): Promise<ClaimedDispatch | undefined> {
    const response = await this.post("/internal/v1/agent-workers/claim", { workerId });
    if (typeof response !== "object" || response === null || !("data" in response)) throw new WorkerControlError("worker control claim response is invalid");
    const data = response.data;
    return data === null ? undefined : data as ClaimedDispatch;
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-yujian-worker-token": this.options.credential,
      },
    }).catch((error) => {
      throw new WorkerControlError(error instanceof Error ? error.message : "worker control request failed");
    });
    const text = await response.text();
    let parsed: unknown;
    try { parsed = text.length === 0 ? undefined : JSON.parse(text); } catch { throw new WorkerControlError("worker control response is not JSON", response.status); }
    if (!response.ok) throw new WorkerControlError(`worker control returned HTTP ${response.status}`, response.status);
    return parsed;
  }
}
