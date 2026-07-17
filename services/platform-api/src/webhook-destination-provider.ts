import type { OutboxEventV1, PlatformScopeV1 } from "@yujian/platform-contracts";
import type { WebhookDestination, WebhookDestinationProvider } from "./outbox-publisher.js";
import type { WebhookDestinationPersistence } from "./webhook-destinations.js";

/** Deployment-side resolver; implementations must not persist or log the returned bytes. */
export interface WebhookSecretResolver {
  resolve(secretRef: string): Promise<Uint8Array>;
}

function eventScope(event: OutboxEventV1): PlatformScopeV1 | undefined {
  if (event.tenantId === undefined || event.projectId === undefined || event.environmentId === undefined) return undefined;
  return { tenantId: event.tenantId, projectId: event.projectId, environmentId: event.environmentId };
}

/** Bridges scoped SQL records to the publisher while keeping secret material in the KMS/runtime boundary. */
export class PersistentWebhookDestinationProvider implements WebhookDestinationProvider {
  constructor(
    private readonly persistence: WebhookDestinationPersistence,
    private readonly secretResolver: WebhookSecretResolver,
  ) {}

  async forEvent(event: OutboxEventV1): Promise<readonly WebhookDestination[]> {
    const scope = eventScope(event);
    if (scope === undefined) return [];
    const records = await this.persistence.list(scope);
    const destinations: WebhookDestination[] = [];
    for (const record of records) {
      if (record.status !== "active" || !record.eventTypes.includes(event.eventType)) continue;
      const secret = await this.secretResolver.resolve(record.secretRef);
      if (!(secret instanceof Uint8Array) || secret.byteLength < 32) throw new Error(`webhook secret resolver returned invalid material for ${record.destinationId}`);
      destinations.push({
        destinationId: record.destinationId,
        url: record.url,
        secret: new Uint8Array(secret),
        eventTypes: record.eventTypes,
      });
    }
    return destinations;
  }
}
