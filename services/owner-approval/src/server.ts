import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { resolve } from "node:path";
import type { OwnerApprovalConfig } from "./config.js";
import { OwnerApprovalValidationError } from "./contracts.js";
import { OwnerApprovalConflictError } from "./evidence-store.js";
import { OwnerApprovalNotFoundError, OwnerApprovalService } from "./approval-service.js";
import { OwnerSignerError } from "./openbao-signer.js";

const apiVersion = "yujian.owner-approval/v1";
const maximumBodyBytes = 16 * 1024;
const mutationPath = /^\/api\/v1\/owner-approvals\/(p1-m0-04-[a-z0-9-]{3,80}):(decide|supersede)$/u;
const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/u;
const staticFiles: Readonly<Record<string, { name: string; contentType: string }>> = {
  "/": { name: "index.html", contentType: "text/html; charset=utf-8" },
  "/index.html": { name: "index.html", contentType: "text/html; charset=utf-8" },
  "/app.js": { name: "app.js", contentType: "text/javascript; charset=utf-8" },
  "/styles.css": { name: "styles.css", contentType: "text/css; charset=utf-8" },
  "/favicon.svg": { name: "favicon.svg", contentType: "image/svg+xml" },
};

export interface OwnerApprovalLogEvent {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  decisionId?: string;
  errorName?: string;
}

export interface OwnerApprovalServerOptions {
  logger?: (event: OwnerApprovalLogEvent) => void;
  now?: () => number;
}

class BodyError extends Error {
  constructor(message: string, readonly statusCode: 400 | 413) {
    super(message);
    this.name = "BodyError";
  }
}

class DecisionRateLimiter {
  private readonly entries = new Map<string, { startedAt: number; count: number }>();
  constructor(private readonly now: () => number) {}

  allow(key: string): boolean {
    const current = this.now();
    const entry = this.entries.get(key);
    if (entry === undefined || current - entry.startedAt >= 60_000) {
      this.entries.set(key, { startedAt: current, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= 5;
  }
}

function securityHeaders(contentType?: string): Record<string, string> {
  return {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    ...(contentType === undefined ? {} : { "content-type": contentType }),
  };
}

function json(response: ServerResponse, statusCode: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  response.writeHead(statusCode, {
    ...securityHeaders("application/json; charset=utf-8"),
    "content-length": String(payload.length),
  });
  response.end(payload);
}

function requestId(request: IncomingMessage): string {
  const supplied = request.headers["x-request-id"];
  return typeof supplied === "string" && requestIdPattern.test(supplied) ? supplied : randomUUID();
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    throw new BodyError("Content-Type 必须是 application/json", 400);
  }
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maximumBodyBytes) throw new BodyError("请求体超过 16 KiB", 413);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBodyBytes) throw new BodyError("请求体超过 16 KiB", 413);
    chunks.push(buffer);
  }
  if (size === 0) throw new BodyError("请求体不能为空", 400);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new BodyError("请求体必须是有效 JSON", 400);
  }
}

export function createOwnerApprovalServer(
  config: Pick<OwnerApprovalConfig, "assetRoot" | "tls">,
  service: OwnerApprovalService,
  options: OwnerApprovalServerOptions = {},
) {
  const logger = options.logger ?? ((event: OwnerApprovalLogEvent) => console.log(JSON.stringify(event)));
  const limiter = new DecisionRateLimiter(options.now ?? Date.now);
  const handler = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const id = requestId(request);
    const method = request.method ?? "UNKNOWN";
    const url = new URL(request.url ?? "/", "http://owner-approval.local");
    const match = method === "POST" ? url.pathname.match(mutationPath) : null;
    let statusCode = 500;
    let errorName: string | undefined;
    try {
      if (method === "GET" && staticFiles[url.pathname] !== undefined) {
        const asset = staticFiles[url.pathname]!;
        const payload = await readFile(resolve(config.assetRoot, asset.name));
        statusCode = 200;
        response.writeHead(statusCode, { ...securityHeaders(asset.contentType), "content-length": String(payload.length) });
        response.end(payload);
        return;
      }
      if (method === "GET" && url.pathname === "/healthz") {
        statusCode = 200;
        json(response, statusCode, { status: "ok", service: "@yujian/owner-approval" });
        return;
      }
      if (method === "GET" && url.pathname === "/api/v1/owner-approvals") {
        const owner = url.searchParams.get("owner") ?? undefined;
        const tasks = await service.list(owner);
        statusCode = 200;
        json(response, statusCode, { apiVersion, requestId: id, data: { tasks, productionReleaseAuthorized: false } });
        return;
      }
      if (match !== null) {
        if (!limiter.allow(request.socket.remoteAddress ?? "unknown")) {
          statusCode = 429;
          json(response, statusCode, { apiVersion, requestId: id, error: { code: "RATE_LIMITED", message: "审批提交过于频繁" } });
          return;
        }
        const body = await readBody(request);
        const receipt = match[2] === "supersede"
          ? await service.supersede(match[1]!, body)
          : await service.decide(match[1]!, body);
        statusCode = 201;
        json(response, statusCode, { apiVersion, requestId: id, data: { receipt } });
        return;
      }
      statusCode = 404;
      json(response, statusCode, { apiVersion, requestId: id, error: { code: "NOT_FOUND", message: "资源不存在" } });
    } catch (error) {
      errorName = error instanceof Error ? error.name : "UnknownError";
      statusCode = error instanceof BodyError ? error.statusCode
        : error instanceof OwnerApprovalValidationError ? 400
          : error instanceof OwnerApprovalNotFoundError ? 404
            : error instanceof OwnerApprovalConflictError ? 409
              : error instanceof OwnerSignerError ? error.statusCode
                : 500;
      const code = statusCode === 400 ? "VALIDATION_FAILED"
        : statusCode === 401 ? "AUTHENTICATION_FAILED"
          : statusCode === 403 ? "AUTHORIZATION_FAILED"
            : statusCode === 404 ? "NOT_FOUND"
              : statusCode === 409 ? "CONFLICT"
                : statusCode === 413 ? "PAYLOAD_TOO_LARGE"
                  : statusCode === 502 ? "SIGNER_UNAVAILABLE" : "INTERNAL_ERROR";
      const message = statusCode >= 500 ? "审批服务暂时无法完成请求" : error instanceof Error ? error.message : "请求失败";
      json(response, statusCode, { apiVersion, requestId: id, error: { code, message } });
    } finally {
      logger({
        requestId: id,
        method,
        path: url.pathname,
        statusCode,
        ...(match?.[1] === undefined ? {} : { decisionId: match[1] }),
        ...(errorName === undefined ? {} : { errorName }),
      });
    }
  };
  return config.tls === undefined
    ? createHttpServer((request, response) => void handler(request, response))
    : createHttpsServer(config.tls, (request, response) => void handler(request, response));
}
