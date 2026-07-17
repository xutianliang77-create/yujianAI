import { EgressClient } from "livekit-server-sdk";
import { IngressClient } from "livekit-server-sdk";
import { SipClient } from "livekit-server-sdk";
import { RoomServiceClient } from "livekit-server-sdk";
import type { YujianRtcNodeConfig } from "./node-pool.js";
import { toLiveKitHttpUrl } from "./endpoints.js";

/** Thin typed adapters over the official LiveKit Ingress/Egress/SIP clients. */
export class YujianMediaServiceAdapter {
  private readonly clients: ReadonlyMap<string, {
    ingress: IngressClient;
    egress: EgressClient;
    sip: SipClient;
    room: RoomServiceClient;
  }>;
  private readonly nodes: readonly YujianRtcNodeConfig[];

  constructor(nodes: readonly YujianRtcNodeConfig[], requestTimeoutSeconds = 10) {
    if (nodes.length === 0) throw new TypeError("at least one RTC node is required");
    this.nodes = nodes;
    this.clients = new Map(nodes.map((node) => {
      const host = toLiveKitHttpUrl(node.wsUrl);
      const options = { requestTimeout: requestTimeoutSeconds, failover: false };
      return [node.id, {
        ingress: new IngressClient(host, node.apiKey, node.apiSecret, options),
        egress: new EgressClient(host, node.apiKey, node.apiSecret, options),
        sip: new SipClient(host, node.apiKey, node.apiSecret, options),
        room: new RoomServiceClient(host, node.apiKey, node.apiSecret, options),
      }] as const;
    }));
  }

  createIngress(
    inputType: Parameters<IngressClient["createIngress"]>[0],
    options: Parameters<IngressClient["createIngress"]>[1],
    nodeId?: string,
  ): ReturnType<IngressClient["createIngress"]> {
    return this.client(nodeId).ingress.createIngress(inputType, options);
  }

  listIngress(nodeId?: string): ReturnType<IngressClient["listIngress"]> {
    return this.client(nodeId).ingress.listIngress();
  }

  deleteIngress(ingressId: string, nodeId?: string): ReturnType<IngressClient["deleteIngress"]> {
    return this.client(nodeId).ingress.deleteIngress(ingressId);
  }

  startRoomCompositeEgress(
    roomName: string,
    output: unknown,
    options?: unknown,
    nodeId?: string,
  ): ReturnType<EgressClient["startRoomCompositeEgress"]> {
    return this.client(nodeId).egress.startRoomCompositeEgress(roomName, output as never, options as never);
  }

  stopEgress(egressId: string, nodeId?: string): ReturnType<EgressClient["stopEgress"]> {
    return this.client(nodeId).egress.stopEgress(egressId);
  }

  listEgress(options?: Parameters<EgressClient["listEgress"]>[0], nodeId?: string): ReturnType<EgressClient["listEgress"]> {
    return this.client(nodeId).egress.listEgress(options);
  }

  dialSipParticipant(
    sipTrunkId: string,
    phoneNumber: string,
    roomName: string,
    options?: Parameters<SipClient["createSipParticipant"]>[3],
    nodeId?: string,
  ): ReturnType<SipClient["createSipParticipant"]> {
    return this.client(nodeId).sip.createSipParticipant(sipTrunkId, phoneNumber, roomName, options);
  }

  transferSipParticipant(
    roomName: string,
    participantIdentity: string,
    transferTo: string,
    options?: Parameters<SipClient["transferSipParticipant"]>[3],
    nodeId?: string,
  ): ReturnType<SipClient["transferSipParticipant"]> {
    return this.client(nodeId).sip.transferSipParticipant(roomName, participantIdentity, transferTo, options);
  }

  hangupSipParticipant(roomName: string, participantIdentity: string, nodeId?: string): ReturnType<RoomServiceClient["removeParticipant"]> {
    return this.client(nodeId).room.removeParticipant(roomName, participantIdentity);
  }

  private client(nodeId?: string) {
    const selected = nodeId ?? this.nodes[0]?.id;
    const client = selected === undefined ? undefined : this.clients.get(selected);
    if (client === undefined) throw new Error(`unknown YUJIAN RTC node: ${selected}`);
    return client;
  }
}
