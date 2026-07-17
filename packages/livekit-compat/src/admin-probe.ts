import { RoomServiceClient } from "livekit-server-sdk";
import {
  validateLiveKitConnectionConfig,
  type LiveKitConnectionConfig,
} from "./config.js";
import { toLiveKitHttpUrl } from "./endpoints.js";

export interface LiveKitProbeResult {
  latencyMs: number;
  activeRoomCount: number;
}

export class LiveKitAdminProbe {
  private readonly client: RoomServiceClient;

  constructor(config: LiveKitConnectionConfig, requestTimeoutSeconds = 3) {
    if (
      !Number.isInteger(requestTimeoutSeconds) ||
      requestTimeoutSeconds < 1 ||
      requestTimeoutSeconds > 10
    ) {
      throw new TypeError("LiveKit probe timeout must be from 1 to 10 seconds");
    }
    const validated = validateLiveKitConnectionConfig(config);
    this.client = new RoomServiceClient(
      toLiveKitHttpUrl(validated.wsUrl),
      validated.apiKey,
      validated.apiSecret,
      {
        requestTimeout: requestTimeoutSeconds,
        failover: false,
      },
    );
  }

  async check(): Promise<LiveKitProbeResult> {
    const startedAt = performance.now();
    const rooms = await this.client.listRooms();
    return {
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      activeRoomCount: rooms.length,
    };
  }
}
