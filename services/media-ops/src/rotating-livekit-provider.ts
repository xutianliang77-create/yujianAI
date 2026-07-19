import { YujianMediaServiceAdapter } from "@yujian/livekit-compat";
import type { MediaOpsProvider } from "./control.js";
import { MediaOpsLiveKitProvider } from "./livekit-adapter.js";

export interface MediaServiceCredentialLease {
  client: YujianMediaServiceAdapter;
  expiresAt: string;
  defaultSipTrunkId?: string;
  release?: () => void | Promise<void>;
}

export interface MediaServiceCredentialProvider {
  resolve(environmentId: string): Promise<MediaServiceCredentialLease>;
}

/** Creates the official LiveKit adapter per operation so API secrets can rotate without process restart. */
export class RotatingMediaOpsLiveKitProvider implements MediaOpsProvider {
  constructor(
    private readonly credentials: MediaServiceCredentialProvider,
    private readonly features: { ingress: boolean; egress: boolean; sip: boolean },
  ) {}

  createIngress(input: Parameters<MediaOpsProvider["createIngress"]>[0]) { return this.invoke(input.environmentId, (provider) => provider.createIngress(input)); }
  createEgress(input: Parameters<MediaOpsProvider["createEgress"]>[0]) { return this.invoke(input.environmentId, (provider) => provider.createEgress(input)); }
  requestSipCall(input: Parameters<MediaOpsProvider["requestSipCall"]>[0]) { return this.invoke(input.environmentId, (provider) => provider.requestSipCall(input)); }
  transferSipCall(input: Parameters<MediaOpsProvider["transferSipCall"]>[0]) { return this.invoke(input.environmentId, (provider) => provider.transferSipCall(input)); }
  hangupSipCall(input: Parameters<MediaOpsProvider["hangupSipCall"]>[0]) { return this.invoke(input.environmentId, (provider) => provider.hangupSipCall(input)); }

  private async invoke<T>(environmentId: string, operation: (provider: MediaOpsLiveKitProvider) => Promise<T>): Promise<T> {
    const lease = await this.credentials.resolve(environmentId);
    if (!Number.isFinite(Date.parse(lease.expiresAt)) || Date.parse(lease.expiresAt) <= Date.now() + 5_000) throw new Error("media service credential is expired or too close to expiry");
    try { return await operation(new MediaOpsLiveKitProvider(lease.client, this.features, lease.defaultSipTrunkId)); }
    finally { try { await lease.release?.(); } catch { /* Credential cleanup cannot alter provider outcome. */ } }
  }
}
