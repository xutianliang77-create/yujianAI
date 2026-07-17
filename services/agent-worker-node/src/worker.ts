import { randomUUID } from "node:crypto";

export type WorkerState = "starting" | "ready" | "draining" | "stopped";

export interface AgentJob {
  dispatchId: string;
  roomName: string;
  deadlineAt: string;
  traceId: string;
}

export class AgentWorker {
  readonly workerId = `worker-${randomUUID()}`;
  state: WorkerState = "starting";
  private readonly active = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();

  start(): void {
    if (this.state !== "starting") throw new Error("worker can only start once");
    this.state = "ready";
    this.log("worker.ready");
  }

  async accept(job: AgentJob, run: (job: AgentJob, signal: AbortSignal) => Promise<void>): Promise<void> {
    if (this.state !== "ready") throw new Error("worker is not accepting jobs");
    const deadlineMs = Date.parse(job.deadlineAt);
    if (!Number.isFinite(deadlineMs) || deadlineMs <= Date.now()) throw new Error("job deadline is invalid or elapsed");
    if (this.active.has(job.dispatchId)) throw new Error("duplicate dispatch");
    this.active.add(job.dispatchId);
    const controller = new AbortController();
    this.controllers.set(job.dispatchId, controller);
    const timeout = setTimeout(() => controller.abort("deadline"), Math.max(1, deadlineMs - Date.now()));
    try {
      await run(job, controller.signal);
    } finally {
      clearTimeout(timeout);
      this.active.delete(job.dispatchId);
      this.controllers.delete(job.dispatchId);
    }
  }

  cancel(dispatchId: string, reason = "cancelled"): boolean {
    const controller = this.controllers.get(dispatchId);
    if (controller === undefined) return false;
    controller.abort(reason);
    return true;
  }

  activeDispatchIds(): readonly string[] {
    return [...this.active];
  }

  async drain(timeoutMs = 30_000): Promise<void> {
    if (this.state === "stopped") return;
    this.state = "draining";
    const deadline = Date.now() + timeoutMs;
    while (this.active.size > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    for (const dispatchId of this.active) this.cancel(dispatchId, "drain-timeout");
    this.state = "stopped";
    this.log("worker.stopped");
  }

  private log(event: string): void {
    process.stdout.write(`${JSON.stringify({ event, workerId: this.workerId, activeJobs: this.active.size, at: new Date().toISOString() })}\n`);
  }
}
