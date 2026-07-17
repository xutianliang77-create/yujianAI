export const PLATFORM_API_VERSION = "platform.yujian.ai/v1" as const;

/**
 * Stable control-plane error taxonomy.  LiveKit-compatible APIs keep their
 * upstream error behavior; these values are reserved for /platform/v1.
 */
export type PlatformErrorCodeV1 =
  | "AUTHENTICATION_FAILED"
  | "AUTHORIZATION_FAILED"
  | "PERMISSION_DENIED"
  | "VALIDATION_FAILED"
  | "PAYLOAD_TOO_LARGE"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_CONFLICT"
  | "METHOD_NOT_ALLOWED"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "REGION_UNAVAILABLE"
  | "UPSTREAM_UNAVAILABLE"
  | "PROVIDER_UNAVAILABLE"
  | "COMPLIANCE_RESTRICTED"
  | "OPERATION_TIMEOUT"
  | "INTERNAL_ERROR";

export const PLATFORM_REQUEST_ID_HEADER = "x-request-id" as const;
export const IDEMPOTENCY_KEY_HEADER = "idempotency-key" as const;

export interface RoomPermissionsV1 {
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
}

export interface PlatformScopeV1 {
  tenantId: string;
  projectId: string;
  environmentId: string;
}

export interface IssueRoomTokenRequestV1 extends PlatformScopeV1 {
  roomName: string;
  participantIdentity: string;
  participantName?: string;
  metadata?: string;
  attributes?: Record<string, string>;
  permissions?: RoomPermissionsV1;
  ttlSeconds?: number;
}

export interface NormalizedRoomPermissionsV1 {
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
}

export interface NormalizedIssueRoomTokenRequestV1 extends PlatformScopeV1 {
  roomName: string;
  participantIdentity: string;
  participantName?: string;
  metadata?: string;
  attributes: Record<string, string>;
  permissions: NormalizedRoomPermissionsV1;
  ttlSeconds: number;
}

export interface IssuedRoomTokenV1 {
  url: string;
  token: string;
  expiresAt: string;
  /** Yujian control-plane routing decision; omitted by direct adapter callers. */
  nodeId?: string;
}

export interface PlatformSuccessResponseV1<T> {
  apiVersion: typeof PLATFORM_API_VERSION;
  requestId: string;
  data: T;
}

export interface PlatformErrorDetailV1 {
  field?: string;
  reason: string;
}

export interface PlatformErrorV1 {
  code: PlatformErrorCodeV1;
  message: string;
  retryable: boolean;
  details?: PlatformErrorDetailV1[];
}

export interface PlatformErrorResponseV1 {
  apiVersion: typeof PLATFORM_API_VERSION;
  requestId: string;
  error: PlatformErrorV1;
}
