#!/usr/bin/env node

const apiUrl = (process.env.YUJIAN_API_URL ?? "http://127.0.0.1:8090").replace(/\/$/u, "");
const credential = process.env.YUJIAN_PLATFORM_CREDENTIAL;

function usage() {
  process.stderr.write(`语见 CLI\n\n命令:\n  health\n  ready\n  token --tenant <id> --project <id> --environment <id> --room <name> --identity <id>\n  webhook-list --environment <id>\n  webhook-save --environment <id> --id <id> --url <https-url> --secret-ref <kms-ref> --events <a,b>\n  webhook-disable --environment <id> --id <id>\n\n环境变量:\n  YUJIAN_API_URL                 控制面地址（默认 http://127.0.0.1:8090）\n  YUJIAN_PLATFORM_CREDENTIAL     环境级 Bearer credential\n`);
}

function required(name) {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} must be set`);
  return value;
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || args[index + 1] === undefined || args[index + 1].startsWith("--")) {
    throw new Error(`${name} is required`);
  }
  return args[index + 1];
}

async function request(path, init = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(credential === undefined ? {} : { authorization: `Bearer ${credential}` }),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body;
  try { body = text.length === 0 ? { status: response.status } : JSON.parse(text); } catch { body = { raw: text }; }
  if (!response.ok) {
    const message = body?.error?.message ?? body?.error ?? `HTTP ${response.status}`;
    throw new Error(String(message));
  }
  return body;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "health" || command === "ready") {
    process.stdout.write(`${JSON.stringify(await request(`/${command}z`), null, 2)}\n`);
    return;
  }
  if (command === "token") {
    const body = {
      tenantId: option(args, "--tenant"),
      projectId: option(args, "--project"),
      environmentId: option(args, "--environment"),
      roomName: option(args, "--room"),
      participantIdentity: option(args, "--identity"),
      permissions: { canPublish: true, canSubscribe: true, canPublishData: true },
      ttlSeconds: Number(process.env.YUJIAN_TOKEN_TTL_SECONDS ?? 300),
    };
    process.stdout.write(`${JSON.stringify(await request("/platform/v1/rtc/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }), null, 2)}\n`);
    return;
  }
  if (command === "webhook-list") {
    const environment = encodeURIComponent(option(args, "--environment"));
    process.stdout.write(`${JSON.stringify(await request(`/platform/v1/environments/${environment}/webhooks`), null, 2)}\n`);
    return;
  }
  if (command === "webhook-save") {
    const environment = encodeURIComponent(option(args, "--environment"));
    const destinationId = encodeURIComponent(option(args, "--id"));
    const events = option(args, "--events").split(",").map((value) => value.trim()).filter(Boolean);
    if (events.length === 0) throw new Error("--events must contain at least one event type");
    const status = args.includes("--disabled") ? "disabled" : "active";
    process.stdout.write(`${JSON.stringify(await request(`/platform/v1/environments/${environment}/webhooks/${destinationId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: option(args, "--url"), secretRef: option(args, "--secret-ref"), eventTypes: events, status }),
    }), null, 2)}\n`);
    return;
  }
  if (command === "webhook-disable") {
    const environment = encodeURIComponent(option(args, "--environment"));
    const destinationId = encodeURIComponent(option(args, "--id"));
    process.stdout.write(`${JSON.stringify(await request(`/platform/v1/environments/${environment}/webhooks/${destinationId}`, { method: "DELETE" }), null, 2)}\n`);
    return;
  }
  usage();
  process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`yujian: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
