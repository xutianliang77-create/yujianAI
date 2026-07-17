import {
  LocalAudioTrack,
  LocalVideoTrack,
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

async function waitForRemoteVideoStats(remoteTrack) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const stats = await remoteTrack.getReceiverStats();
    if (stats?.bytesReceived > 0) return stats;
  }
  return undefined;
}

function createSyntheticVideoTrack(label, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const context = canvas.getContext("2d");
  if (!context || typeof canvas.captureStream !== "function") {
    throw new Error(`${label} synthetic video is not supported`);
  }
  let frame = 0;
  const draw = () => {
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "white";
    context.font = "24px sans-serif";
    context.fillText(`${label} ${frame}`, 16, 36);
    frame += 1;
  };
  draw();
  const timer = setInterval(draw, 100);
  const mediaTrack = canvas.captureStream(10).getVideoTracks()[0];
  const track = new LocalVideoTrack(mediaTrack);
  return {
    track,
    stop() {
      clearInterval(timer);
      track.stop();
    },
  };
}

function waitForRemoteTrack(room, source, message) {
  return withTimeout(
    new Promise((resolve) => room.on(RoomEvent.TrackSubscribed, function listener(track, publication, participant) {
      if (publication.source !== source) return;
      room.off(RoomEvent.TrackSubscribed, listener);
      resolve([track, publication, participant]);
    })),
    message,
  );
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
  const syntheticVideoTracks = [];

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

    const cameraSubscribed = waitForRemoteTrack(
      secondaryRoom,
      Track.Source.Camera,
      "camera Track was not subscribed",
    );
    const screenSubscribed = waitForRemoteTrack(
      secondaryRoom,
      Track.Source.ScreenShare,
      "screen-share Track was not subscribed",
    );
    const camera = createSyntheticVideoTrack("camera", "#164e63");
    const screen = createSyntheticVideoTrack("screen", "#7c2d12");
    syntheticVideoTracks.push(camera, screen);
    await primaryRoom.localParticipant.publishTrack(camera.track, {
      source: Track.Source.Camera,
    });
    await primaryRoom.localParticipant.publishTrack(screen.track, {
      source: Track.Source.ScreenShare,
    });
    const [cameraTrack, cameraPublication, cameraPublisher] = await cameraSubscribed;
    const [screenTrack, screenPublication, screenPublisher] = await screenSubscribed;
    if (cameraPublisher.identity !== "web-primary" || cameraPublication.source !== Track.Source.Camera) {
      throw new Error("camera Track publisher or source mismatch");
    }
    if (screenPublisher.identity !== "web-primary" || screenPublication.source !== Track.Source.ScreenShare) {
      throw new Error("screen-share Track publisher or source mismatch");
    }
    const cameraStats = await waitForRemoteVideoStats(cameraTrack);
    const screenStats = await waitForRemoteVideoStats(screenTrack);
    if (!cameraStats || !screenStats) throw new Error("remote video Track did not receive RTP bytes");

    setStatus(
      "passed",
      `通过：双节点连接、Data、RPC、音视频/屏幕 Track（audio=${audioStats.bytesReceived}, camera=${cameraStats.bytesReceived}, screen=${screenStats.bytesReceived} bytes）`,
    );
  } finally {
    oscillator?.stop();
    localAudioTrack?.stop();
    syntheticVideoTracks.forEach(({ stop }) => stop());
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
