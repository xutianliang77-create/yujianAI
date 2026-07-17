import type { IncomingMessage, ServerResponse } from "node:http";

const MAX_REQUEST_BODY_BYTES = 16 * 1024;

export class RequestBodyError extends Error {
  readonly statusCode: number;
  readonly code: "VALIDATION_FAILED" | "PAYLOAD_TOO_LARGE";

  constructor(
    message: string,
    statusCode: number,
    code: "VALIDATION_FAILED" | "PAYLOAD_TOO_LARGE",
  ) {
    super(message);
    this.name = "RequestBodyError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentLength = Number(request.headers["content-length"]);
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_REQUEST_BODY_BYTES
  ) {
    throw new RequestBodyError(
      "Request payload exceeds the platform limit",
      413,
      "PAYLOAD_TOO_LARGE",
    );
  }

  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;
    if (receivedBytes > MAX_REQUEST_BODY_BYTES) {
      throw new RequestBodyError(
        "Request payload exceeds the platform limit",
        413,
        "PAYLOAD_TOO_LARGE",
      );
    }
    chunks.push(buffer);
  }

  if (receivedBytes === 0) {
    throw new RequestBodyError(
      "Request body must be a JSON object",
      400,
      "VALIDATION_FAILED",
    );
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestBodyError(
      "Request body must contain valid JSON",
      400,
      "VALIDATION_FAILED",
    );
  }
}

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  additionalHeaders: Record<string, string> = {},
) {
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-length": String(payload.length),
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    ...additionalHeaders,
  });
  response.end(payload);
}
