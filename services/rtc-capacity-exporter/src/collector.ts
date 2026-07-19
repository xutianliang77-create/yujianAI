import { RoomServiceClient } from "livekit-server-sdk";
import type { RtcCapacityUsageV1 } from "@yujian/livekit-compat";

interface ParticipantShape { tracks?: readonly unknown[] }
interface RoomShape { name?: string }

function httpUrl(value: string): string {
  return value.replace(/^ws:/u, "http:").replace(/^wss:/u, "https:");
}

function safeProduct(left: number, right: number): number {
  const value = left * right;
  if (!Number.isSafeInteger(value)) throw new RangeError("RTC subscription upper bound exceeds safe integer range");
  return value;
}

export class LiveKitCapacityCollector {
  private readonly client: RoomServiceClient;

  constructor(url: string, apiKey: string, apiSecret: string, timeoutSeconds = 3) {
    this.client = new RoomServiceClient(httpUrl(url), apiKey, apiSecret, { requestTimeout: timeoutSeconds, failover: false });
  }

  async collect(): Promise<RtcCapacityUsageV1> {
    const rooms = await this.client.listRooms() as readonly RoomShape[];
    let activeParticipants = 0;
    let activePublishers = 0;
    let activeTracks = 0;
    let activeSubscriptions = 0;
    for (const room of rooms) {
      if (typeof room.name !== "string" || room.name.length === 0) throw new Error("LiveKit RoomService returned a room without a name");
      const participants = await this.client.listParticipants(room.name) as readonly ParticipantShape[];
      let roomTracks = 0;
      for (const participant of participants) {
        const tracks = Array.isArray(participant.tracks) ? participant.tracks.length : 0;
        roomTracks += tracks;
        if (tracks > 0) activePublishers += 1;
      }
      activeParticipants += participants.length;
      activeTracks += roomTracks;
      activeSubscriptions += safeProduct(participants.length, roomTracks);
    }
    return { activeRooms: rooms.length, activeParticipants, activePublishers, activeSubscriptions, activeTracks };
  }
}
