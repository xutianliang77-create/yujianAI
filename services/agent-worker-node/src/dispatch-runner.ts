import type { ClaimedDispatch, WorkerControlClient } from "./control-client.js";
import { AgentWorker, type AgentJob } from "./worker.js";

export type AgentDispatchHandler = (dispatch: ClaimedDispatch, signal: AbortSignal) => Promise<void>;

export interface AgentDispatchObservation {
  event: "claimed" | "completed" | "failed" | "poll_failed";
  dispatchId?: string;
  traceId?: string;
  durationMs?: number;
  error?: string;
}

export interface AgentDispatchObserver {
  observe(observation: AgentDispatchObservation): void | Promise<void>;
}

export interface AgentDispatchControl {
  claim(workerId: string): Promise<ClaimedDispatch | undefined>;
  complete(workerId: string, dispatchId: string): Promise<unknown>;
  fail(workerId: string, dispatchId: string, reason: string): Promise<unknown>;
}

function jobFrom(dispatch: ClaimedDispatch): AgentJob {
  return {
    dispatchId: dispatch.dispatchId,
    roomName: dispatch.roomName,
    deadlineAt: dispatch.deadlineAt,
    traceId: dispatch.traceId,
  };
}

/** Claim/start/execute/complete-fail loop; the handler owns provider and Room work. */
export class AgentDispatchRunner {
  private loopPromise: Promise<void> | undefined;
  private stopping = false;

  constructor(
    private readonly worker: AgentWorker,
    private readonly control: AgentDispatchControl | WorkerControlClient,
    private readonly handler: AgentDispatchHandler,
    private readonly observer?: AgentDispatchObserver,
  ) {}

  async runOnce(): Promise<boolean> {
    if (this.worker.state !== "ready") return false;
    const dispatch = await this.control.claim(this.worker.workerId);
    if (dispatch === undefined) return false;
    const startedAt = Date.now();
    this.observe({ event: "claimed", dispatchId: dispatch.dispatchId, traceId: dispatch.traceId });
    const job = jobFrom(dispatch);
    try {
      await this.worker.accept(job, (_job, signal) => this.handler(dispatch, signal));
      await this.control.complete(this.worker.workerId, job.dispatchId);
      this.observe({ event: "completed", dispatchId: job.dispatchId, traceId: job.traceId, durationMs: Date.now() - startedAt });
    } catch (error) {
      const reason = signalReason(error);
      await this.control.fail(this.worker.workerId, dispatch.dispatchId, reason).catch(() => undefined);
      this.observe({ event: "failed", dispatchId: job.dispatchId, traceId: job.traceId, durationMs: Date.now() - startedAt, error: reason });
    }
    return true;
  }

  start(pollIntervalMs = 500): void {
    if (this.loopPromise !== undefined) throw new Error("agent dispatch runner is already started");
    if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 100 || pollIntervalMs > 30_000) throw new RangeError("poll interval must be 100-30000ms");
    this.stopping = false;
    this.loopPromise = this.loop(pollIntervalMs);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    await this.loopPromise;
    this.loopPromise = undefined;
  }

  private async loop(pollIntervalMs: number): Promise<void> {
    while (!this.stopping) {
      try { await this.runOnce(); }
      catch (error) {
        const reason = error instanceof Error ? error.message : "unknown";
        this.observe({ event: "poll_failed", error: reason });
        process.stderr.write(`${JSON.stringify({ event: "agent.dispatch_poll_failed", error: reason })}\n`);
      }
      if (!this.stopping) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  private observe(observation: AgentDispatchObservation): void {
    try {
      const result = this.observer?.observe(observation);
      if (result !== undefined) void Promise.resolve(result).catch(() => undefined);
    } catch {
      // Observation is best-effort; a metrics sink must never change dispatch state.
    }
  }
}

function signalReason(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "dispatch cancelled";
  return "dispatch handler failed";
}
