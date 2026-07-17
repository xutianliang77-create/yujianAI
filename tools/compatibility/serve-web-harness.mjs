import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { AccessToken } from "livekit-server-sdk";

const webRoot = new URL("../../tests/compatibility/web/", import.meta.url);
const flutterRoot = new URL(
  "../../tests/compatibility/flutter/build/web/",
  import.meta.url,
);
const host = "127.0.0.1";
const port = Number.parseInt(process.env.YUJIAN_WEB_COMPAT_PORT ?? "4173", 10);
const primaryUrl = requiredEnvironment("YUJIAN_RTC_PRIMARY_URL");
const secondaryUrl = requiredEnvironment("YUJIAN_RTC_SECONDARY_URL");
const apiKey = requiredEnvironment("YUJIAN_RTC_API_KEY");
const apiSecret = requiredEnvironment("YUJIAN_RTC_API_SECRET");
const roomName = `web-compat-${randomUUID()}`;

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function contentType(pathname) {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".wasm")) return "application/wasm";
  if (pathname.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4_096) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function issueToken(node, identity) {
  if (!["primary", "secondary"].includes(node)) throw new Error("invalid node");
  if (
    ![
      "web-primary",
      "web-secondary",
      "flutter-primary",
      "flutter-secondary",
    ].includes(identity)
  ) {
    throw new Error("invalid identity");
  }
  const accessToken = new AccessToken(apiKey, apiSecret, {
    identity,
    ttl: 60,
  });
  accessToken.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return {
    url: node === "primary" ? primaryUrl : secondaryUrl,
    token: await accessToken.toJwt(),
  };
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/") {
      const body = await readFile(new URL("index.html", webRoot));
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(body);
      return;
    }
    if (request.method === "GET" && request.url === "/main.js") {
      const body = await readFile(new URL("dist/main.js", webRoot));
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(body);
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/flutter/")) {
      const pathname = new URL(request.url, `http://${host}:${port}`).pathname;
      const relativePath = pathname === "/flutter/"
        ? "index.html"
        : decodeURIComponent(pathname.slice("/flutter/".length));
      if (!relativePath || relativePath.includes("..")) {
        throw new Error("invalid Flutter asset path");
      }
      const body = await readFile(new URL(relativePath, flutterRoot));
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": contentType(relativePath),
      });
      response.end(body);
      return;
    }
    if (request.method === "GET" && request.url === "/healthz") {
      sendJson(response, 200, { status: "ok" });
      return;
    }
    if (request.method === "GET" && request.url === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method === "POST" && request.url === "/token") {
      const { node, identity } = await readJson(request);
      sendJson(response, 201, await issueToken(node, identity));
      return;
    }
    sendJson(response, 404, { error: "not_found" });
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : "invalid_request",
    });
  }
});

server.listen(port, host, () => {
  process.stdout.write(`WEB_COMPAT_URL=http://${host}:${port}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
