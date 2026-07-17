import { RoomServiceClient } from "livekit-server-sdk";
import type { YujianRtcNodeConfig } from "./node-pool.js";
import { toLiveKitHttpUrl } from "./endpoints.js";

/**
 * Platform-facing RoomService adapter. It deliberately exposes only the
 * operations needed by the control plane; the SDK remains the wire contract.
 */
export class YujianRoomServiceAdapter {
  private readonly clients: ReadonlyMap<string, RoomServiceClient>;
  private readonly nodes: readonly YujianRtcNodeConfig[];

  constructor(nodes: readonly YujianRtcNodeConfig[], requestTimeoutSeconds = 5) {
    if (nodes.length === 0) throw new TypeError("at least one RTC node is required");
    this.nodes = nodes;
    this.clients = new Map(
      nodes.map((node): [string, RoomServiceClient] => [
        node.id,
        new RoomServiceClient(
          toLiveKitHttpUrl(node.wsUrl),
          node.apiKey,
          node.apiSecret,
          { requestTimeout: requestTimeoutSeconds, failover: false },
        ),
      ]),
    );
  }

  async listRooms(nodeId?: string) {
    return this.client(nodeId).listRooms();
  }

  async createRoom(name: string, nodeId?: string) {
    return this.client(nodeId).createRoom({ name });
  }

  async listParticipants(room: string, nodeId?: string) {
    return this.client(nodeId).listParticipants(room);
  }

  async getParticipant(room: string, identity: string, nodeId?: string) {
    return this.client(nodeId).getParticipant(room, identity);
  }

  async removeParticipant(room: string, identity: string, nodeId?: string) {
    await this.client(nodeId).removeParticipant(room, identity);
  }

  async updateParticipant(
    room: string,
    identity: string,
    options: { metadata?: string; name?: string; attributes?: Record<string, string> },
    nodeId?: string,
  ) {
    return this.client(nodeId).updateParticipant(room, identity, options);
  }

  private client(nodeId?: string): RoomServiceClient {
    const selected = nodeId ?? this.nodes[0]?.id;
    const client = selected === undefined ? undefined : this.clients.get(selected);
    if (client === undefined) throw new Error(`unknown YUJIAN RTC node: ${selected}`);
    return client;
  }
}
