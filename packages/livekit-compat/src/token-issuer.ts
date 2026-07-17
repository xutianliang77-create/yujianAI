import type {
  IssuedRoomTokenV1,
  NormalizedIssueRoomTokenRequestV1,
} from "@yujian/platform-contracts";
import { AccessToken } from "livekit-server-sdk";
import {
  validateLiveKitConnectionConfig,
  type LiveKitConnectionConfig,
} from "./config.js";

export type Clock = () => Date;

export class RoomTokenIssuer {
  readonly config: LiveKitConnectionConfig;
  private readonly clock: Clock;

  constructor(config: LiveKitConnectionConfig, clock: Clock = () => new Date()) {
    this.config = validateLiveKitConnectionConfig(config);
    this.clock = clock;
  }

  async issue(
    request: NormalizedIssueRoomTokenRequestV1,
  ): Promise<IssuedRoomTokenV1> {
    const issuedAt = this.clock();
    const attributes = {
      ...request.attributes,
      "yujian.environment_id": request.environmentId,
      "yujian.project_id": request.projectId,
      "yujian.tenant_id": request.tenantId,
    };
    const token = new AccessToken(this.config.apiKey, this.config.apiSecret, {
      identity: request.participantIdentity,
      ttl: request.ttlSeconds,
      ...(request.participantName === undefined
        ? {}
        : { name: request.participantName }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      attributes,
    });

    token.addGrant({
      roomJoin: true,
      room: request.roomName,
      canPublish: request.permissions.canPublish,
      canSubscribe: request.permissions.canSubscribe,
      canPublishData: request.permissions.canPublishData,
      canUpdateOwnMetadata: false,
    });

    return {
      url: this.config.wsUrl,
      token: await token.toJwt(),
      expiresAt: new Date(
        issuedAt.getTime() + request.ttlSeconds * 1000,
      ).toISOString(),
    };
  }
}
