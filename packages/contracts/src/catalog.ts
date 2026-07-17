export const COMMUNICATION_MODES = [
  "face_to_face",
  "listen",
  "call_link",
  "pstn_translation",
  "agent_assist",
  "agent_call",
  "meeting",
] as const;

export type CommunicationMode = (typeof COMMUNICATION_MODES)[number];

export const COMMUNICATION_SESSION_STATES = [
  "created",
  "admitting",
  "active",
  "ending",
  "ended",
  "failed",
] as const;

export type CommunicationSessionState =
  (typeof COMMUNICATION_SESSION_STATES)[number];

export const RUNTIME_BY_COMMUNICATION_MODE = {
  face_to_face: "translation",
  listen: "translation",
  call_link: "translation",
  pstn_translation: "translation",
  agent_assist: "translation_agent",
  agent_call: "agent",
  meeting: "speaker_translation",
} as const satisfies Record<CommunicationMode, RuntimeProfile>;

export type RuntimeProfile =
  | "translation"
  | "translation_agent"
  | "agent"
  | "speaker_translation";

export const RELIABLE_EVENT_TYPES = [
  "communication.session.created",
  "communication.session.state_changed",
  "communication.participant.joined",
  "communication.participant.left",
  "communication.media_leg.connected",
  "communication.media_leg.disconnected",
  "speech.turn.final",
  "speech.transcript.final",
  "speech.transcript.revised",
  "translation.final",
  "translation.revised",
  "playback.completed",
  "playback.cancelled",
  "playback.failed",
  "agent.task.authorized",
  "agent.task.cancelled",
  "agent.run.completed",
  "agent.run.failed",
  "agent.tool.completed",
  "agent.handoff.completed",
  "billing.usage.committed",
] as const;

export type ReliableEventType = (typeof RELIABLE_EVENT_TYPES)[number];

export const EPHEMERAL_EVENT_TYPES = [
  "speech.transcript.partial",
  "speech.audio.waveform",
  "speech.vad.probability",
  "playback.progress",
] as const;

export type EphemeralEventType = (typeof EPHEMERAL_EVENT_TYPES)[number];

export function isReliableEventType(value: string): value is ReliableEventType {
  return (RELIABLE_EVENT_TYPES as readonly string[]).includes(value);
}
