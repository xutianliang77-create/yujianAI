import type {
  CommunicationMode,
  CommunicationSessionState,
  ReliableEventType,
} from "./catalog.js";

export type ContractVersionV1 = 1;
export type Uuid = string;
export type IsoDateTime = string;
export type LanguageTag = string;

export interface LanguagePolicyV1 {
  sourceLanguageTag: LanguageTag;
  targetLanguageTags: readonly LanguageTag[];
}

export interface CommunicationSessionV1 {
  contractVersion: ContractVersionV1;
  communicationSessionId: Uuid;
  mode: CommunicationMode;
  state: CommunicationSessionState;
  createdBySubjectId: string;
  languagePolicy: LanguagePolicyV1;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  endedAt?: IsoDateTime;
  revision: number;
}

export type ParticipantKind = "human" | "agent";

export type ParticipantRole =
  | "owner"
  | "guest"
  | "callee"
  | "assistant"
  | "observer";

export type ParticipantState =
  | "invited"
  | "joining"
  | "active"
  | "left"
  | "failed";

export interface SessionParticipantV1 {
  contractVersion: ContractVersionV1;
  communicationSessionId: Uuid;
  participantId: Uuid;
  kind: ParticipantKind;
  role: ParticipantRole;
  state: ParticipantState;
  joinedAt?: IsoDateTime;
  leftAt?: IsoDateTime;
  revision: number;
}

export type MediaTransport = "local" | "webrtc" | "sip";
export type MediaDirection = "sendrecv" | "sendonly" | "recvonly";
export type MediaLegState =
  | "created"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed";

export interface MediaLegV1 {
  contractVersion: ContractVersionV1;
  communicationSessionId: Uuid;
  participantId: Uuid;
  legId: Uuid;
  transport: MediaTransport;
  direction: MediaDirection;
  state: MediaLegState;
  connectedAt?: IsoDateTime;
  disconnectedAt?: IsoDateTime;
  revision: number;
}

export type AggregateType =
  | "communication_session"
  | "session_participant"
  | "media_leg"
  | "speech_turn"
  | "transcript_segment"
  | "translation"
  | "tts_playback"
  | "agent_task"
  | "agent_run"
  | "tool_execution"
  | "billing_ledger";

export type EventProducer =
  | "control-api"
  | "realtime-runtime"
  | "voice-agent-runtime"
  | "model-gateway";

export interface ReliableEventEnvelopeV1<
  TType extends ReliableEventType = ReliableEventType,
  TPayload extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, unknown>
  >,
> {
  eventId: Uuid;
  eventType: TType;
  eventVersion: ContractVersionV1;
  communicationSessionId: Uuid;
  aggregateType: AggregateType;
  aggregateId: Uuid;
  aggregateVersion: number;
  sequence: number;
  occurredAt: IsoDateTime;
  producer: EventProducer;
  traceId: string;
  idempotencyKey: string;
  payload: TPayload;
}
