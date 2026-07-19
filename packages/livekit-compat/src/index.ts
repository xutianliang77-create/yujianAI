export {
  LiveKitAdminProbe,
} from "./admin-probe.js";
export type {
  LiveKitProbeResult,
} from "./admin-probe.js";

export {
  validateLiveKitConnectionConfig,
  validateLiveKitConnectionConfig as validateYujianRtcConnectionConfig,
} from "./config.js";
export type {
  LiveKitConnectionConfig,
  LiveKitConnectionConfig as YujianRtcConnectionConfig,
} from "./config.js";

export {
  normalizeLiveKitWsUrl,
  normalizeLiveKitWsUrl as normalizeYujianRtcWsUrl,
  toLiveKitHttpUrl,
  toLiveKitHttpUrl as toYujianRtcHttpUrl,
} from "./endpoints.js";

export {
  RoomTokenIssuer,
} from "./token-issuer.js";
export type {
  Clock,
  Clock as YujianRtcClock,
} from "./token-issuer.js";

export {
  YujianRtcNodePool,
} from "./node-pool.js";
export { YujianRtcCapacityController } from "./capacity-controller.js";
export type {
  RtcCapacityDecisionV1,
  RtcCapacityRequestV1,
  RtcCapacityUsageV1,
} from "./capacity-controller.js";
export { parseRtcCapacityReport } from "./capacity-report.js";
export type { RtcCapacityReportV1 } from "./capacity-report.js";
export type {
  YujianRtcNodeConfig,
  YujianRtcNodeStatus,
  YujianRtcReadiness,
} from "./node-pool.js";

export { YujianRoomServiceAdapter } from "./room-service.js";
export { YujianRegionRouter } from "./region-router.js";
export type { YujianRegionDecision } from "./region-router.js";
export { YujianRegionHealthRegistry, YujianRegionHealthRouter } from "./region-health.js";
export type { YujianHealthRegionDecision, YujianHealthRoutingPolicy, YujianRegionHealthObservation, YujianRegionHealthState } from "./region-health.js";
export { YujianMediaServiceAdapter } from "./media-services.js";
export { YujianWebhookReplayError, YujianWebhookVerifier } from "./webhook.js";
export { TurnCredentialIssuer } from "./turn-credentials.js";

// Public Yujian names for the adapter. LiveKit names remain exported above
// because they describe the official upstream compatibility boundary.
export {
  LiveKitAdminProbe as YujianRtcAdminProbe,
} from "./admin-probe.js";
export type {
  LiveKitProbeResult as YujianRtcProbeResult,
} from "./admin-probe.js";
export {
  RoomTokenIssuer as YujianRoomTokenIssuer,
} from "./token-issuer.js";
