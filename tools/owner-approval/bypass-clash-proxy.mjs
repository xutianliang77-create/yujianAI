import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";

const listenHost = "127.0.0.1";
const listenPort = Number(process.env.YUJIAN_OWNER_APPROVAL_LOCAL_PORT ?? 8094);
const targetHost = process.env.YUJIAN_OWNER_APPROVAL_TARGET_IP ?? "100.110.127.117";
const targetPort = Number(process.env.YUJIAN_OWNER_APPROVAL_TARGET_PORT ?? 8093);
const targetServerName = process.env.YUJIAN_OWNER_APPROVAL_TARGET_NAME ?? "beelink.tail1e9cec.ts.net";
const maximumBodyBytes = 16 * 1024;
const decisionPath = /^\/api\/v1\/owner-approvals\/p1-m0-04-[a-z0-9-]{3,80}:(?:decide|supersede)$/u;
const staticPaths = new Set(["/", "/index.html", "/app.js", "/styles.css", "/favicon.svg", "/healthz"]);

if (!Number.isInteger(listenPort) || listenPort < 1024 || listenPort > 65535) throw new Error("local port must be 1024-65535");
if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) throw new Error("target port is invalid");
if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/u.test(targetHost)) throw new Error("target must be a direct IP address");
if (!/^[a-z0-9.-]{3,253}$/u.test(targetServerName)) throw new Error("target TLS server name is invalid");

function allowed(method, url) {
  if (method === "GET" && staticPaths.has(url.pathname)) return true;
  if (method === "GET" && url.pathname === "/api/v1/owner-approvals") {
    return [...url.searchParams.keys()].every((key) => key === "owner");
  }
  return method === "POST" && decisionPath.test(url.pathname) && url.search === "";
}

async function requestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBodyBytes) throw new Error("PAYLOAD_TOO_LARGE");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function sendJson(response, statusCode, value) {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-length": String(payload.length),
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(payload);
}

function forwardHeaders(request, body) {
  const headers = {
    accept: typeof request.headers.accept === "string" ? request.headers.accept : "application/json",
    connection: "close",
    host: `${targetServerName}:${targetPort}`,
    "x-request-id": typeof request.headers["x-request-id"] === "string"
      ? request.headers["x-request-id"]
      : randomUUID(),
  };
  if (body.length > 0) {
    headers["content-length"] = String(body.length);
    headers["content-type"] = "application/json";
  }
  return headers;
}

function responseHeaders(headers) {
  const allowed = [
    "cache-control", "content-length", "content-security-policy", "content-type",
    "cross-origin-resource-policy", "referrer-policy", "x-content-type-options", "x-frame-options",
  ];
  return Object.fromEntries(allowed.flatMap((name) => {
    const value = headers[name];
    return value === undefined ? [] : [[name, value]];
  }));
}

const server = createServer(async (request, response) => {
  const method = request.method ?? "UNKNOWN";
  const url = new URL(request.url ?? "/", "http://owner-approval.local");
  if (!allowed(method, url)) {
    sendJson(response, 404, { error: { code: "NOT_FOUND", message: "本地审批桥接不允许该路径" } });
    return;
  }
  let body;
  try {
    body = await requestBody(request);
  } catch {
    sendJson(response, 413, { error: { code: "PAYLOAD_TOO_LARGE", message: "请求体超过 16 KiB" } });
    return;
  }
  const upstream = httpsRequest({
    host: targetHost,
    port: targetPort,
    servername: targetServerName,
    method,
    path: `${url.pathname}${url.search}`,
    headers: forwardHeaders(request, body),
    rejectUnauthorized: true,
    timeout: 8_000,
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders(upstreamResponse.headers));
    upstreamResponse.pipe(response);
  });
  upstream.once("timeout", () => upstream.destroy(new Error("upstream timeout")));
  upstream.once("error", () => {
    if (!response.headersSent) sendJson(response, 502, { error: { code: "UPSTREAM_UNAVAILABLE", message: "无法直连 Beelink 审批服务" } });
    else response.destroy();
  });
  upstream.end(body);
});

server.requestTimeout = 10_000;
server.headersTimeout = 5_000;
server.keepAliveTimeout = 5_000;
server.listen(listenPort, listenHost, () => {
  console.log(JSON.stringify({
    status: "listening",
    url: `http://${listenHost}:${listenPort}/`,
    target: `${targetHost}:${targetPort}`,
    tlsServerName: targetServerName,
    clashBypassed: true,
  }));
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
