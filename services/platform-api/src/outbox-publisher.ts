import { createHmac } from "node:crypto";
import type { OutboxEventV1 } from "@yujian/platform-contracts";
import type { PlatformPersistenceAdapter } from "./persistence.js";

export interface WebhookDestination {
  destinationId: string;
  url: string;
  secret: Uint8Array;
  eventTypes: readonly string[];
}

export interface WebhookDestinationProvider {
  forEvent(event: OutboxEventV1): Promise<readonly WebhookDestination[]>;
}

export interface OutboxPublisherOptions {
  maxAttempts: number;
  timeoutMs: number;
  baseBackoffMs?: number;
}

export interface OutboxPublisherWorkerOptions {
  pollIntervalMs?: number;
  batchSize?: number;
  onError?: (error: unknown) => void;
}

export class OutboxPublisher {
  readonly deadLetters = new Map<string, { event: OutboxEventV1; error: string; attempts: number }>();

  constructor(
    private readonly persistence: PlatformPersistenceAdapter,
    private readonly destinations: readonly WebhookDestination[] | WebhookDestinationProvider,
    private readonly options: OutboxPublisherOptions = { maxAttempts: 5, timeoutMs: 5_000, baseBackoffMs: 1_000 },
  ) {
    if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1 || options.maxAttempts > 20) throw new RangeError("outbox maxAttempts must be 1-20");
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 120_000) throw new RangeError("outbox timeoutMs must be 100-120000ms");
    if (options.baseBackoffMs !== undefined && (!Number.isInteger(options.baseBackoffMs) || options.baseBackoffMs < 100 || options.baseBackoffMs > 300_000)) throw new RangeError("outbox baseBackoffMs is invalid");
    for (const destination of Array.isArray(destinations) ? destinations : []) {
      OutboxPublisher.validateDestination(destination);
    }
  }

  private static validateDestination(destination: WebhookDestination): void {
    if (destination.destinationId.length === 0 || destination.destinationId.length > 128 || /[\u0000-\u001f\u007f]/u.test(destination.destinationId)) throw new TypeError("webhook destination id is invalid");
    if (destination.secret.byteLength < 32) throw new TypeError("webhook secret must be at least 32 bytes");
    const url = new URL(destination.url);
    if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new TypeError("webhook destination must use HTTPS outside loopback");
    if (url.username !== "" || url.password !== "") throw new TypeError("webhook destination must not contain credentials");
    if (destination.eventTypes.length === 0) throw new TypeError("webhook destination must subscribe to an event type");
  }

  private async destinationsFor(event: OutboxEventV1): Promise<readonly WebhookDestination[]> {
    const destinations = Array.isArray(this.destinations)
      ? this.destinations
      : await (this.destinations as WebhookDestinationProvider).forEvent(event);
    for (const destination of destinations) OutboxPublisher.validateDestination(destination);
    return destinations;
  }

  async requeueDeadLetter(eventId: string): Promise<void> {
    if (eventId.length === 0 || eventId.length > 256 || /[\u0000-\u001f\u007f]/u.test(eventId)) throw new TypeError("outbox event id is invalid");
    if (this.persistence.requeueOutbox === undefined) throw new Error("outbox persistence does not support replay");
    await this.persistence.requeueOutbox(eventId);
    this.deadLetters.delete(eventId);
  }

  async publishBatch(limit = 100): Promise<{ published: number; failed: number }> {
    const events = await this.persistence.claimOutbox(limit);
    let published = 0;
    let failed = 0;
    for (const event of events) {
      try {
        const destinations = (await this.destinationsFor(event)).filter((destination) => destination.eventTypes.includes(event.eventType));
        for (const destination of destinations) {
          if (await this.persistence.isWebhookDelivered?.(event.eventId, destination.destinationId)) continue;
          await this.deliver(event, destination);
          await this.persistence.markWebhookDelivered?.(event.eventId, destination.destinationId, new Date().toISOString());
        }
        await this.persistence.markOutboxPublished(event.eventId, new Date().toISOString());
        published += 1;
      } catch (error) {
        failed += 1;
        const attempts = event.attemptCount + 1;
        const terminal = attempts >= this.options.maxAttempts;
        const nextAttemptAt = terminal ? undefined : new Date(Date.now() + Math.min((this.options.baseBackoffMs ?? 1_000) * 2 ** Math.max(0, attempts - 1), 300_000)).toISOString();
        const deliveryError = error instanceof Error ? error.message : "webhook delivery failed";
        try {
          await this.persistence.markOutboxFailed?.(event.eventId, deliveryError, nextAttemptAt, terminal ? new Date().toISOString() : undefined);
        } catch (persistenceError) {
          this.deadLetters.set(event.eventId, {
            event,
            attempts,
            error: `${deliveryError}; failure state persistence failed: ${persistenceError instanceof Error ? persistenceError.message : "unknown error"}`,
          });
          continue;
        }
        this.deadLetters.set(event.eventId, {
          event,
          attempts,
          error: deliveryError,
        });
      }
    }
    return { published, failed };
  }

  private async deliver(event: OutboxEventV1, destination: WebhookDestination): Promise<void> {
    const body = JSON.stringify(event);
    const signature = createHmac("sha256", destination.secret).update(body).digest("hex");
    const response = await fetch(destination.url, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(this.options.timeoutMs),
      headers: {
        "content-type": "application/json",
        "x-yujian-event-id": event.eventId,
        "x-yujian-signature": `sha256=${signature}`,
      },
    });
    if (!response.ok) throw new Error(`webhook returned HTTP ${response.status}`);
  }
}

/**
 * Process-local delivery loop.  The SQL adapter provides the cross-replica
 * claim lock; this class only owns scheduling and graceful shutdown.
 */
export class OutboxPublisherWorker {
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly onError: (error: unknown) => void;
  private running = false;
  private loopPromise: Promise<void> | undefined;
  private wake: (() => void) | undefined;

  constructor(
    private readonly publisher: OutboxPublisher,
    options: OutboxPublisherWorkerOptions = {},
  ) {
    const pollIntervalMs = options.pollIntervalMs ?? 1_000;
    const batchSize = options.batchSize ?? 100;
    if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 100 || pollIntervalMs > 60_000) {
      throw new RangeError("outbox worker pollIntervalMs must be 100-60000");
    }
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
      throw new RangeError("outbox worker batchSize must be 1-1000");
    }
    this.pollIntervalMs = pollIntervalMs;
    this.batchSize = batchSize;
    this.onError = options.onError ?? (() => undefined);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.wake?.();
    await this.loopPromise;
    this.loopPromise = undefined;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const result = await this.publisher.publishBatch(this.batchSize);
        if (!this.running) break;
        await this.delay(result.published === 0 && result.failed === 0 ? this.pollIntervalMs : 100);
      } catch (error) {
        try {
          this.onError(error);
        } catch {
          // Error reporting must never terminate delivery or the process.
        }
        if (this.running) await this.delay(this.pollIntervalMs);
      }
    }
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.wake = undefined;
        resolve();
      }, milliseconds);
      this.wake = () => {
        clearTimeout(timer);
        this.wake = undefined;
        resolve();
      };
    });
  }
}
