import { WebhookReceiver, type WebhookEvent } from "livekit-server-sdk";

export class YujianWebhookReplayError extends Error {
  constructor() {
    super("webhook event has already been accepted");
    this.name = "YujianWebhookReplayError";
  }
}

/** Verifies official LiveKit webhook signatures and adds bounded replay protection. */
export class YujianWebhookVerifier {
  private readonly receiver: WebhookReceiver;
  private readonly accepted = new Map<string, number>();

  constructor(
    apiKey: string,
    apiSecret: string,
    private readonly replayWindowMs = 10 * 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.receiver = new WebhookReceiver(apiKey, apiSecret);
    if (!Number.isInteger(replayWindowMs) || replayWindowMs < 30_000) {
      throw new TypeError("webhook replay window is too short");
    }
  }

  async receive(body: string, authorization: string): Promise<WebhookEvent> {
    const event = await this.receiver.receive(body, authorization);
    const eventId = event.id;
    if (eventId.length === 0) throw new Error("webhook event id is required");
    const now = this.now();
    for (const [id, acceptedAt] of this.accepted) {
      if (now - acceptedAt > this.replayWindowMs) this.accepted.delete(id);
    }
    if (this.accepted.has(eventId)) throw new YujianWebhookReplayError();
    this.accepted.set(eventId, now);
    return event;
  }
}
