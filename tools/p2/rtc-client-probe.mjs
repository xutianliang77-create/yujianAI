#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

for (const name of ["ALL_PROXY", "HTTP_PROXY", "HTTPS_PROXY", "all_proxy", "http_proxy", "https_proxy"]) delete process.env[name];
const { dispose, Room } = await import("@livekit/rtc-node");
const [inputPath, resultPath] = process.argv.slice(2);
if (!inputPath || !resultPath) throw new Error("usage: rtc-client-probe.mjs INPUT RESULT");
const probe = JSON.parse(await readFile(inputPath, "utf8"));
const url = process.env.YUJIAN_P2_RTC_CLIENT_URL ?? probe.url;
const room = new Room();
let result;
try {
  await Promise.race([
    room.connect(url, probe.token),
    new Promise((_, reject) => setTimeout(() => reject(new Error("RTC client connect timeout")), 15_000)),
  ]);
  result = { status: "connected", participantIdentity: probe.participantIdentity, roomName: probe.roomName, connectedAt: new Date().toISOString() };
  await writeFile(resultPath, `${JSON.stringify(result)}\n`, { mode: 0o600 });
  await new Promise((resolve) => setTimeout(resolve, 15_000));
} catch (error) {
  result = { status: "failed", error: error instanceof Error ? error.message : "RTC client failed" };
  await writeFile(resultPath, `${JSON.stringify(result)}\n`, { mode: 0o600 });
  throw error;
} finally {
  await room.disconnect().catch(() => undefined);
  await dispose();
}
console.log(JSON.stringify({ status: result.status, participantIdentity: result.participantIdentity }));
