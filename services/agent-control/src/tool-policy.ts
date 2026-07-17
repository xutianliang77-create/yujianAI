import type { AgentToolPolicyV1, PlatformRoleV1 } from "@yujian/platform-contracts";

export interface ToolInvocationContext {
  subject: string;
  roles: readonly PlatformRoleV1[];
  explicitApproval: boolean;
  idempotencyKey: string;
  traceId: string;
}

export interface ToolResultRecord { found: boolean; result: unknown; }
export interface ToolResultStore {
  get(key: string): Promise<ToolResultRecord>;
  put(key: string, result: unknown): Promise<void>;
}
export interface ToolAuditSink {
  append(event: { toolId: string; key: string; traceId: string; subject: string; outcome: "denied" | "executed" | "replayed"; occurredAt: string }): Promise<void>;
}
export interface ToolPolicyEngineOptions {
  resultStore?: ToolResultStore;
  audit?: ToolAuditSink;
  now?: () => Date;
}

export class ToolPolicyDeniedError extends Error {
  constructor(message: string) { super(message); this.name = "ToolPolicyDeniedError"; }
}

export class ToolPolicyEngine {
  private readonly completed = new Map<string, unknown>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly options: ToolPolicyEngineOptions = {}) {}

  authorize<T>(
    policy: AgentToolPolicyV1,
    context: ToolInvocationContext,
    execute: () => Promise<T>,
  ): Promise<T> {
    const now = () => (this.options.now ?? (() => new Date()))().toISOString();
    const denied = async (message: string): Promise<never> => {
      await this.options.audit?.append({ toolId: policy.toolId, key: context.idempotencyKey, traceId: context.traceId, subject: context.subject, outcome: "denied", occurredAt: now() });
      throw new ToolPolicyDeniedError(message);
    };
    if (policy.idempotencyRequired && context.idempotencyKey.length === 0) return denied("tool idempotency key is required");
    if (context.idempotencyKey.length > 128 || context.traceId.length === 0 || context.traceId.length > 256) return denied("tool invocation context is invalid");
    if (policy.requiresExplicitApproval && !context.explicitApproval) return denied("explicit approval is required for this tool");
    if (!context.roles.some((role) => policy.allowedRoles.includes(role))) return denied("subject role is not allowed for this tool");
    const key = `${policy.toolId}:${context.idempotencyKey}`;
    const inFlight = this.inFlight.get(key);
    if (inFlight !== undefined) return inFlight as Promise<T>;
    const run = (async () => {
      if (this.completed.has(key)) {
        await this.options.audit?.append({ toolId: policy.toolId, key, traceId: context.traceId, subject: context.subject, outcome: "replayed", occurredAt: now() });
        return this.completed.get(key) as T;
      }
      const stored = await this.options.resultStore?.get(key);
      if (stored?.found === true) {
        this.completed.set(key, stored.result);
        await this.options.audit?.append({ toolId: policy.toolId, key, traceId: context.traceId, subject: context.subject, outcome: "replayed", occurredAt: now() });
        return stored.result as T;
      }
      const result = await execute();
      this.completed.set(key, result);
      await this.options.resultStore?.put(key, result);
      await this.options.audit?.append({ toolId: policy.toolId, key, traceId: context.traceId, subject: context.subject, outcome: "executed", occurredAt: now() });
      return result;
    })();
    this.inFlight.set(key, run);
    void run.finally(() => this.inFlight.delete(key)).catch(() => undefined);
    return run;
  }
}
