import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { TokenVerifier, RoomServiceClient } from "livekit-server-sdk";
import { createPlatformServer } from "../../services/platform-api/dist/index.js";

const loopbackRtc = /^(ws|wss):\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/u.test(
  process.env.YUJIAN_RTC_PRIMARY_URL ?? "",
);
if (loopbackRtc) {
  for (const name of [
    "ALL_PROXY",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "all_proxy",
    "http_proxy",
    "https_proxy",
  ]) {
    delete process.env[name];
  }
}

const {
  AudioFrame,
  AudioSource,
  AudioStream,
  dispose,
  LocalAudioTrack,
  Room,
  RoomEvent,
  TrackPublishOptions,
  TrackSource,
} = await import("@livekit/rtc-node");

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set for the LiveKit integration test`);
  }
  return value;
}

function waitForEvent(emitter, event, timeoutMessage) {
  let listener;
  let timeout;
  const promise = new Promise((resolve, reject) => {
    listener = (...args) => {
      clearTimeout(timeout);
      resolve(args);
    };
    emitter.once(event, listener);
    timeout = setTimeout(() => reject(new Error(timeoutMessage)), 5_000);
  });
  return {
    promise,
    cancel() {
      clearTimeout(timeout);
      emitter.off(event, listener);
    },
  };
}

test("platform API and media stay compatible across two pinned LiveKit nodes", async () => {
  const wsUrl = requiredEnvironment("YUJIAN_RTC_PRIMARY_URL");
  const secondaryWsUrl = requiredEnvironment("YUJIAN_RTC_SECONDARY_URL");
  const apiKey = requiredEnvironment("LIVEKIT_API_KEY");
  const apiSecret = requiredEnvironment("LIVEKIT_API_SECRET");
  const platformCredential = requiredEnvironment(
    "YUJIAN_PLATFORM_TEST_CREDENTIAL",
  );
  const platformScope = {
    tenantId: "tenant-integration",
    projectId: "project-rtc",
    environmentId: "environment-beelink",
  };
  const httpUrl = wsUrl.replace(/^ws:/u, "http:").replace(/^wss:/u, "https:");
  const secondaryHttpUrl = secondaryWsUrl
    .replace(/^ws:/u, "http:")
    .replace(/^wss:/u, "https:");
  const roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
  const secondaryRoomService = new RoomServiceClient(
    secondaryHttpUrl,
    apiKey,
    apiSecret,
  );
  const roomName = `integration-${randomUUID()}`;
  const firstParticipant = new Room();
  const secondParticipant = new Room();
  const platformServer = createPlatformServer(
    {
      host: "127.0.0.1",
      port: 0,
      platformCredentials: [{ ...platformScope, credential: platformCredential }],
      rtcNodes: [
        { id: "primary", wsUrl, apiKey, apiSecret },
        { id: "secondary", wsUrl: secondaryWsUrl, apiKey, apiSecret },
      ],
    },
    { logger: () => {} },
  );

  try {
    await roomService.createRoom({
      name: roomName,
      emptyTimeout: 60,
      maxParticipants: 2,
    });
    const rooms = await roomService.listRooms([roomName]);
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0].name, roomName);
    const roomsFromSecondary = await secondaryRoomService.listRooms([roomName]);
    assert.equal(roomsFromSecondary.length, 1);
    assert.equal(roomsFromSecondary[0].name, roomName);

    await new Promise((resolve, reject) => {
      platformServer.once("error", reject);
      platformServer.listen(0, "127.0.0.1", resolve);
    });
    const address = platformServer.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const readiness = await fetch(`${baseUrl}/readyz`);
    assert.equal(readiness.status, 200);
    const readinessBody = await readiness.json();
    assert.deepEqual(
      readinessBody.nodes.map(({ id, healthy }) => ({ id, healthy })),
      [
        { id: "primary", healthy: true },
        { id: "secondary", healthy: true },
      ],
    );

    async function issueToken(participantIdentity) {
      const tokenResponse = await fetch(`${baseUrl}/platform/v1/rtc/token`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${platformCredential}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...platformScope,
          roomName,
          participantIdentity,
          ttlSeconds: 60,
        }),
      });
      assert.equal(tokenResponse.status, 201);
      return (await tokenResponse.json()).data;
    }

    const firstToken = await issueToken("integration-first");
    const secondToken = await issueToken("integration-second");
    assert.equal(firstToken.nodeId, "primary");
    assert.equal(secondToken.nodeId, "secondary");
    const claims = await new TokenVerifier(apiKey, apiSecret).verify(firstToken.token);
    assert.equal(claims.sub, "integration-first");
    assert.equal(claims.video.room, roomName);
    assert.equal(claims.attributes["yujian.environment_id"], platformScope.environmentId);
    assert.equal(claims.attributes["yujian.project_id"], platformScope.projectId);
    assert.equal(claims.attributes["yujian.tenant_id"], platformScope.tenantId);

    await firstParticipant.connect(firstToken.url, firstToken.token);
    const participantConnected = waitForEvent(
      firstParticipant,
      RoomEvent.ParticipantConnected,
      "second participant did not join in time",
    );
    let remoteParticipant;
    try {
      await secondParticipant.connect(secondToken.url, secondToken.token);
      [remoteParticipant] = await participantConnected.promise;
    } finally {
      participantConnected.cancel();
    }
    assert.equal(remoteParticipant.identity, "integration-second");

    const dataReceived = waitForEvent(
      secondParticipant,
      RoomEvent.DataReceived,
      "reliable data packet was not received in time",
    );
    let received;
    try {
      await firstParticipant.localParticipant.publishData(
        new TextEncoder().encode("yujian-livekit-compatibility"),
        { reliable: true, topic: "yujian.compatibility" },
      );
      const [payload, participant, _kind, topic] = await dataReceived.promise;
      received = { payload, participant, topic };
    } finally {
      dataReceived.cancel();
    }
    assert.equal(
      new TextDecoder().decode(received.payload),
      "yujian-livekit-compatibility",
    );
    assert.equal(received.participant.identity, "integration-first");
    assert.equal(received.topic, "yujian.compatibility");

    secondParticipant.localParticipant.registerRpcMethod(
      "yujian.compatibility.echo",
      async ({ payload }) => `echo:${payload}`,
    );
    const rpcResponse = await firstParticipant.localParticipant.performRpc({
      destinationIdentity: "integration-second",
      method: "yujian.compatibility.echo",
      payload: "rpc-ready",
      responseTimeout: 3_000,
    });
    assert.equal(rpcResponse, "echo:rpc-ready");

    const trackSubscribed = waitForEvent(
      secondParticipant,
      RoomEvent.TrackSubscribed,
      "audio track was not subscribed in time",
    );
    const sampleRate = 48_000;
    const samplesPerFrame = 480;
    const source = new AudioSource(sampleRate, 1);
    const localTrack = LocalAudioTrack.createAudioTrack("compatibility-tone", source);
    const publishOptions = new TrackPublishOptions();
    publishOptions.source = TrackSource.SOURCE_MICROPHONE;
    let reader;
    try {
      await firstParticipant.localParticipant.publishTrack(localTrack, publishOptions);
      const [remoteTrack, publication, publisher] = await trackSubscribed.promise;
      assert.equal(publication.source, TrackSource.SOURCE_MICROPHONE);
      assert.equal(publisher.identity, "integration-first");

      reader = new AudioStream(remoteTrack, {
        sampleRate,
        numChannels: 1,
      }).getReader();
      const framesToRead = 40;
      const receiveAudio = (async () => {
        let frames = 0;
        let squaredSampleSum = 0;
        let sampleCount = 0;
        while (frames < framesToRead) {
          const { done, value } = await reader.read();
          if (done) break;
          assert.equal(value.sampleRate, sampleRate);
          assert.equal(value.channels, 1);
          for (const sample of value.data) {
            squaredSampleSum += sample * sample;
            sampleCount += 1;
          }
          frames += 1;
        }
        assert.equal(frames, framesToRead);
        assert.ok(sampleCount > 0);
        return Math.sqrt(squaredSampleSum / sampleCount);
      })();

      let sampleIndex = 0;
      for (let frameIndex = 0; frameIndex < framesToRead + 20; frameIndex += 1) {
        const frame = AudioFrame.create(sampleRate, 1, samplesPerFrame);
        for (let index = 0; index < samplesPerFrame; index += 1) {
          frame.data[index] = Math.round(
            20_000 * Math.sin((2 * Math.PI * 440 * sampleIndex) / sampleRate),
          );
          sampleIndex += 1;
        }
        await source.captureFrame(frame);
      }
      await source.waitForPlayout();
      const rootMeanSquare = await receiveAudio;
      assert.ok(rootMeanSquare > 1_000, `received audio RMS was ${rootMeanSquare}`);
    } finally {
      trackSubscribed.cancel();
      await reader?.cancel().catch(() => {});
      await localTrack.close().catch(() => {});
    }
  } finally {
    await Promise.allSettled([
      firstParticipant.disconnect(),
      secondParticipant.disconnect(),
    ]);
    await dispose();
    if (platformServer.listening) {
      await new Promise((resolve, reject) => {
        platformServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await roomService.deleteRoom(roomName).catch(() => {});
  }
});
