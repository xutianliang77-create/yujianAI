import { YujianMediaServiceAdapter } from "@yujian/livekit-compat";
import { EncodedFileType, IngressInput, SegmentedFileProtocol, StreamProtocol } from "@livekit/protocol";
import type { EgressJobV1, IngressJobV1, SipCallV1 } from "@yujian/platform-contracts";
import type { MediaOpsProvider } from "./control.js";

export class MediaProviderDisabledError extends Error {
  constructor(capability: string) { super(`${capability} is disabled until its compliance gate is approved`); }
}

/** Keeps provider calls behind the media-ops state machine and feature gates. */
export class MediaOpsLiveKitAdapter {
  constructor(
    private readonly client: YujianMediaServiceAdapter,
    private readonly features: { ingress: boolean; egress: boolean; sip: boolean },
  ) {}

  createIngress(...args: Parameters<YujianMediaServiceAdapter["createIngress"]>) {
    if (!this.features.ingress) throw new MediaProviderDisabledError("Ingress");
    return this.client.createIngress(...args);
  }

  startRoomCompositeEgress(...args: Parameters<YujianMediaServiceAdapter["startRoomCompositeEgress"]>) {
    if (!this.features.egress) throw new MediaProviderDisabledError("Egress");
    return this.client.startRoomCompositeEgress(...args);
  }

  dialSipParticipant(...args: Parameters<YujianMediaServiceAdapter["dialSipParticipant"]>) {
    if (!this.features.sip) throw new MediaProviderDisabledError("SIP");
    return this.client.dialSipParticipant(...args);
  }
}

/** Provider bridge: state/idempotency stays in media-ops, upstream calls stay official. */
export class MediaOpsLiveKitProvider implements MediaOpsProvider {
  constructor(
    private readonly client: YujianMediaServiceAdapter,
    private readonly features: { ingress: boolean; egress: boolean; sip: boolean },
    private readonly defaultSipTrunkId?: string,
  ) {}

  async createIngress(input: { ingressId: string; environmentId: string; roomName: string; inputType: IngressJobV1["inputType"]; sourceUrl?: string }): Promise<{ providerIngressId: string }> {
    if (!this.features.ingress) throw new MediaProviderDisabledError("Ingress");
    const inputType = input.inputType === "rtmp" ? "RTMP_INPUT" : input.inputType === "whip" ? "WHIP_INPUT" : "URL_INPUT";
    if (input.inputType === "url" && input.sourceUrl === undefined) throw new Error("sourceUrl is required for URL ingress");
    if (input.sourceUrl !== undefined) {
      let parsed: URL;
      try { parsed = new URL(input.sourceUrl); } catch { throw new Error("sourceUrl must be a valid URL"); }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("sourceUrl must use HTTPS or HTTP");
      if (parsed.username !== "" || parsed.password !== "") throw new Error("sourceUrl must not contain credentials");
    }
    const result = await this.client.createIngress(IngressInput[inputType], {
      name: `yujian-${input.ingressId}`,
      roomName: input.roomName,
      participantIdentity: `yujian-ingress-${input.ingressId}`,
      ...(input.sourceUrl === undefined ? {} : { url: input.sourceUrl }),
    });
    return { providerIngressId: String((result as { ingressId?: string }).ingressId ?? "") };
  }

  async createEgress(input: { egressId: string; environmentId: string; roomName: string; outputType: EgressJobV1["outputType"]; outputTarget?: string }): Promise<{ providerEgressId: string; objectUri?: string; retentionExpiresAt?: string }> {
    if (!this.features.egress) throw new MediaProviderDisabledError("Egress");
    if (input.outputTarget === undefined || input.outputTarget.length === 0) throw new Error("outputTarget is required for egress provider activation");
    if (/[\u0000-\u001f\u007f]/u.test(input.outputTarget) || input.outputTarget.trim() !== input.outputTarget) throw new Error("outputTarget must be a trimmed control-free target");
    if (input.outputType === "rtmp" && !/^rtmps?:\/\//u.test(input.outputTarget)) throw new Error("RTMP outputTarget must use rtmp:// or rtmps://");
    const output = input.outputType === "mp4"
      ? { file: { fileType: EncodedFileType.MP4, filepath: input.outputTarget } }
      : input.outputType === "hls"
        ? { segments: { protocol: SegmentedFileProtocol.HLS_PROTOCOL, filenamePrefix: input.outputTarget } }
        : { stream: { protocol: StreamProtocol.RTMP, urls: [input.outputTarget] } };
    const result = await this.client.startRoomCompositeEgress(input.roomName, output);
    return { providerEgressId: String((result as { egressId?: string }).egressId ?? "") };
  }

  async requestSipCall(input: { callId: string; environmentId: string; roomName: string; sipTrunkId?: string; participantIdentity?: string; dtmf?: string; direction: SipCallV1["direction"]; remoteNumber: string; idempotencyKey: string }): Promise<{ providerCallId: string; participantIdentity?: string }> {
    if (!this.features.sip) throw new MediaProviderDisabledError("SIP");
    const trunkId = input.sipTrunkId ?? this.defaultSipTrunkId;
    if (trunkId === undefined || trunkId.length === 0) throw new Error("SIP trunk selection is required");
    const result = await this.client.dialSipParticipant(trunkId, input.remoteNumber, input.roomName, input.participantIdentity === undefined && input.dtmf === undefined ? undefined : {
      ...(input.participantIdentity === undefined ? {} : { participantIdentity: input.participantIdentity }),
      ...(input.dtmf === undefined ? {} : { dtmf: input.dtmf }),
    });
    return {
      providerCallId: String((result as { callId?: string }).callId ?? ""),
      ...(input.participantIdentity === undefined ? {} : { participantIdentity: input.participantIdentity }),
    };
  }

  async transferSipCall(input: { callId: string; roomName: string; participantIdentity: string; transferTo: string; idempotencyKey: string }): Promise<void> {
    if (!this.features.sip) throw new MediaProviderDisabledError("SIP");
    await this.client.transferSipParticipant(input.roomName, input.participantIdentity, input.transferTo);
  }

  async hangupSipCall(input: { callId: string; roomName: string; participantIdentity: string; idempotencyKey: string }): Promise<void> {
    if (!this.features.sip) throw new MediaProviderDisabledError("SIP");
    await this.client.hangupSipParticipant(input.roomName, input.participantIdentity);
  }
}
