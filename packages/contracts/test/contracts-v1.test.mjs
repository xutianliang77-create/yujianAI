import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  EPHEMERAL_EVENT_TYPES,
  RELIABLE_EVENT_TYPES,
  RUNTIME_BY_COMMUNICATION_MODE,
  isReliableEventType,
} from "../dist/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaDirectory = join(packageRoot, "schemas", "v1");
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

for (const filename of readdirSync(schemaDirectory).filter((name) =>
  name.endsWith(".schema.json"),
)) {
  const schema = JSON.parse(
    readFileSync(join(schemaDirectory, filename), "utf8"),
  );
  ajv.addSchema(schema);
}

const validateSession = ajv.getSchema(
  "https://schemas.yujian.ai/contracts/v1/communication-session.schema.json",
);
const validateParticipant = ajv.getSchema(
  "https://schemas.yujian.ai/contracts/v1/session-participant.schema.json",
);
const validateMediaLeg = ajv.getSchema(
  "https://schemas.yujian.ai/contracts/v1/media-leg.schema.json",
);
const validateReliableEvent = ajv.getSchema(
  "https://schemas.yujian.ai/contracts/v1/reliable-event-envelope.schema.json",
);

assert.ok(validateSession);
assert.ok(validateParticipant);
assert.ok(validateMediaLeg);
assert.ok(validateReliableEvent);

const communicationSessionId = "00000000-0000-4000-8000-000000000001";
const participantId = "00000000-0000-4000-8000-000000000002";
const legId = "00000000-0000-4000-8000-000000000003";

const activeSession = {
  contractVersion: 1,
  communicationSessionId,
  mode: "call_link",
  state: "active",
  createdBySubjectId: "user:test-owner",
  languagePolicy: {
    sourceLanguageTag: "zh-CN",
    targetLanguageTags: ["en-US"],
  },
  createdAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T08:00:02.000Z",
  revision: 3,
};

test("communication session v1 accepts the canonical aggregate", () => {
  assert.equal(validateSession(activeSession), true, ajv.errorsText(validateSession.errors));
});

test("communication session v1 rejects the legacy sessionId alias", () => {
  const { communicationSessionId: _, ...withoutCanonicalId } = activeSession;
  const invalidSession = {
    ...withoutCanonicalId,
    sessionId: communicationSessionId,
  };

  assert.equal(validateSession(invalidSession), false);
});

test("terminal session states require endedAt", () => {
  const invalidSession = {
    ...activeSession,
    state: "ended",
  };

  assert.equal(validateSession(invalidSession), false);
  assert.equal(
    validateSession({
      ...invalidSession,
      endedAt: "2026-07-17T09:00:00.000Z",
    }),
    true,
    ajv.errorsText(validateSession.errors),
  );
});

test("participant and media leg retain the same communicationSessionId", () => {
  const participant = {
    contractVersion: 1,
    communicationSessionId,
    participantId,
    kind: "human",
    role: "owner",
    state: "active",
    joinedAt: "2026-07-17T08:00:01.000Z",
    revision: 2,
  };
  const mediaLeg = {
    contractVersion: 1,
    communicationSessionId,
    participantId,
    legId,
    transport: "webrtc",
    direction: "sendrecv",
    state: "connected",
    connectedAt: "2026-07-17T08:00:02.000Z",
    revision: 2,
  };

  assert.equal(
    validateParticipant(participant),
    true,
    ajv.errorsText(validateParticipant.errors),
  );
  assert.equal(
    validateMediaLeg(mediaLeg),
    true,
    ajv.errorsText(validateMediaLeg.errors),
  );
});

test("reliable envelope accepts final events and rejects ephemeral events", () => {
  const finalEvent = {
    eventId: "00000000-0000-4000-8000-000000000004",
    eventType: "speech.transcript.final",
    eventVersion: 1,
    communicationSessionId,
    aggregateType: "transcript_segment",
    aggregateId: "00000000-0000-4000-8000-000000000005",
    aggregateVersion: 1,
    sequence: 12,
    occurredAt: "2026-07-17T08:00:03.000Z",
    producer: "realtime-runtime",
    traceId: "0123456789abcdef0123456789abcdef",
    idempotencyKey: "speech:segment:5:revision:1",
    payload: {
      segmentId: "00000000-0000-4000-8000-000000000005",
      revision: 1,
    },
  };

  assert.equal(
    validateReliableEvent(finalEvent),
    true,
    ajv.errorsText(validateReliableEvent.errors),
  );
  assert.equal(
    validateReliableEvent({
      ...finalEvent,
      eventType: "speech.transcript.partial",
    }),
    false,
  );
});

test("TypeScript and JSON Schema event catalogues stay aligned", () => {
  const eventSchema = JSON.parse(
    readFileSync(
      join(schemaDirectory, "reliable-event-envelope.schema.json"),
      "utf8",
    ),
  );

  assert.deepEqual(eventSchema.properties.eventType.enum, RELIABLE_EVENT_TYPES);
  assert.equal(RELIABLE_EVENT_TYPES.every(isReliableEventType), true);
  assert.equal(EPHEMERAL_EVENT_TYPES.some(isReliableEventType), false);
});

test("each communication mode maps to one explicit runtime profile", () => {
  assert.deepEqual(RUNTIME_BY_COMMUNICATION_MODE, {
    face_to_face: "translation",
    listen: "translation",
    call_link: "translation",
    pstn_translation: "translation",
    agent_assist: "translation_agent",
    agent_call: "agent",
    meeting: "speaker_translation",
  });
});
