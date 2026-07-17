import {
  LocalAudioTrack,
  Room,
  RoomEvent,
  Track,
  isBrowserSupported,
} from "livekit-client";

const runButton = document.querySelector("#run");
const status = document.querySelector("#status");

function setStatus(state, message) {
  status.dataset.state = state;
  status.textContent = message;
}

function withTimeout(promise, message, timeoutMs = 10_000) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
}

function waitForEvent(room, event, message) {
  return withTimeout(
    new Promise((resolve) => room.once(event, (...args) => resolve(args))),
    message,
  );
}

async function requestToken(node, identity) {
  const response = await fetch("/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ node, identity }),
  });
  if (!response.ok) throw new Error(`token request failed: ${response.status}`);
  return response.json();
}

async function waitForRemoteAudioStats(remoteTrack) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const stats = await remoteTrack.getReceiverStats();
    if (stats?.bytesReceived > 0) return stats;
  }
  return undefined;
}

async function runCompatibilityTest() {
  if (!isBrowserSupported()) throw new Error("browser does not support WebRTC");
  runButton.disabled = true;
  setStatus("running", "连接两个语见 RTC 节点…");

  const audioContext = new AudioContext();
  await audioContext.resume();
  const primaryRoom = new Room();
  const secondaryRoom = new Room();
  let oscillator;
  let localAudioTrack;

  try {
    secondaryRoom.registerRpcMethod(
      "yujian.web.echo",
      async ({ payload }) => `web:${payload}`,
    );
    const [primary, secondary] = await Promise.all([
      requestToken("primary", "web-primary"),
      requestToken("secondary", "web-secondary"),
    ]);
    await primaryRoom.connect(primary.url, primary.token);
    await secondaryRoom.connect(secondary.url, secondary.token);

    const dataReceived = waitForEvent(
      secondaryRoom,
      RoomEvent.DataReceived,
      "reliable Data packet was not received",
    );
    await primaryRoom.localParticipant.publishData(
      new TextEncoder().encode("yujian-web-data"),
      { reliable: true, topic: "yujian.web.compatibility" },
    );
    const [payload, participant, , topic] = await dataReceived;
    if (new TextDecoder().decode(payload) !== "yujian-web-data") {
      throw new Error("Data payload mismatch");
    }
    if (participant?.identity !== "web-primary" || topic !== "yujian.web.compatibility") {
      throw new Error("Data sender or topic mismatch");
    }

    const rpcResponse = await primaryRoom.localParticipant.performRpc({
      destinationIdentity: "web-secondary",
      method: "yujian.web.echo",
      payload: "ready",
      responseTimeout: 5_000,
    });
    if (rpcResponse !== "web:ready") throw new Error("RPC response mismatch");

    const trackSubscribed = waitForEvent(
      secondaryRoom,
      RoomEvent.TrackSubscribed,
      "audio Track was not subscribed",
    );
    const destination = audioContext.createMediaStreamDestination();
    const gain = audioContext.createGain();
    gain.gain.value = 0.2;
    oscillator = audioContext.createOscillator();
    oscillator.frequency.value = 440;
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    localAudioTrack = new LocalAudioTrack(
      destination.stream.getAudioTracks()[0],
      undefined,
      true,
      audioContext,
    );
    await primaryRoom.localParticipant.publishTrack(localAudioTrack, {
      source: Track.Source.Microphone,
    });
    const [remoteTrack, publication, publisher] = await trackSubscribed;
    if (publication.source !== Track.Source.Microphone) {
      throw new Error("audio Track source mismatch");
    }
    if (publisher.identity !== "web-primary") {
      throw new Error("audio Track publisher mismatch");
    }
    const audioStats = await waitForRemoteAudioStats(remoteTrack);
    if (!audioStats) throw new Error("remote audio Track did not receive RTP bytes");

    setStatus(
      "passed",
      `通过：双节点连接、Data、RPC、音频 Track（${audioStats.bytesReceived} bytes）`,
    );
  } finally {
    oscillator?.stop();
    localAudioTrack?.stop();
    await Promise.allSettled([primaryRoom.disconnect(), secondaryRoom.disconnect()]);
    await audioContext.close();
    runButton.disabled = false;
  }
}

runButton.addEventListener("click", () => {
  runCompatibilityTest().catch((error) => {
    setStatus("failed", `失败：${error instanceof Error ? error.message : String(error)}`);
    runButton.disabled = false;
  });
});
