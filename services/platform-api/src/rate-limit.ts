export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: string;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitDecision | Promise<RateLimitDecision>;
}

interface WindowState { startedAt: number; count: number }

/** Local guard for the single-process slice; production uses Redis/distributed limiting. */
export class PlatformRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(private readonly limit = 120, private readonly windowMs = 60_000) {
    if (!Number.isInteger(limit) || limit < 1) throw new TypeError("rate limit must be positive");
    if (!Number.isInteger(windowMs) || windowMs < 1_000) throw new TypeError("rate limit window is invalid");
  }

  check(key: string, now = Date.now()): RateLimitDecision {
    const current = this.windows.get(key);
    const state = current === undefined || now - current.startedAt >= this.windowMs
      ? { startedAt: now, count: 0 }
      : current;
    state.count += 1;
    this.windows.set(key, state);
    const allowed = state.count <= this.limit;
    return {
      allowed,
      limit: this.limit,
      remaining: Math.max(0, this.limit - state.count),
      resetAt: new Date(state.startedAt + this.windowMs).toISOString(),
    };
  }
}
