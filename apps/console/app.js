const state = { credential: "" };
const byId = (id) => document.getElementById(id);
const apiUrl = byId("api-url");
const credential = byId("credential");
const output = byId("output");
const status = byId("status");

apiUrl.value = window.location.origin;

function setStatus(value, stateName = "idle") {
  status.textContent = value;
  status.dataset.state = stateName;
}

function readValue(id) {
  const value = byId(id).value.trim();
  if (value.length === 0) throw new Error(`${id} 不能为空`);
  return value;
}

function safeResponse(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(safeResponse);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const normalized = key.toLowerCase();
    if (normalized.endsWith("token") || normalized.includes("secret") || normalized.includes("credential") || normalized === "authorization" || normalized === "cookie") return [key, "[redacted]"];
    return [key, safeResponse(item)];
  }));
}

function render(value) {
  output.textContent = typeof value === "string" ? value : JSON.stringify(safeResponse(value), null, 2);
}

async function request(path, options = {}) {
  const base = readValue("api-url").replace(/\/$/u, "");
  const headers = { accept: "application/json", ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...(options.headers ?? {}) };
  if (state.credential.length > 0) headers.authorization = `Bearer ${state.credential}`;
  setStatus("请求中", "running");
  const response = await fetch(`${base}${path}`, { ...options, headers });
  const text = await response.text();
  let body;
  try { body = text.length === 0 ? undefined : JSON.parse(text); }
  catch { body = text; }
  if (!response.ok) {
    render(body);
    setStatus(`失败 ${response.status}`, "failed");
    throw new Error(`HTTP ${response.status}`);
  }
  render(body);
  setStatus(`成功 ${response.status}`, "passed");
  return body;
}

async function run(action) {
  try { await action(); }
  catch (error) {
    if (!(error instanceof Error && error.message.startsWith("HTTP "))) {
      render(error instanceof Error ? error.message : String(error));
      setStatus("请求未完成", "failed");
    }
  }
}

credential.addEventListener("input", () => { state.credential = credential.value; });
byId("health").addEventListener("click", () => run(() => request("/healthz")));
byId("ready").addEventListener("click", () => run(() => request("/readyz")));
byId("issue-token").addEventListener("click", () => run(async () => {
  const ttl = Number(byId("ttl").value);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 300) throw new Error("TTL 必须是 60-300 秒");
  await request("/platform/v1/rtc/token", {
    method: "POST",
    body: JSON.stringify({
      tenantId: readValue("tenant-id"),
      projectId: readValue("project-id"),
      environmentId: readValue("environment-id"),
      roomName: readValue("room-name"),
      participantIdentity: readValue("identity"),
      ttlSeconds: ttl,
    }),
  });
}));

function webhookPath() {
  const environmentId = readValue("webhook-environment-id");
  const destinationId = readValue("webhook-id");
  return `/platform/v1/environments/${encodeURIComponent(environmentId)}/webhooks/${encodeURIComponent(destinationId)}`;
}

byId("list-webhooks").addEventListener("click", () => run(() => request(`/platform/v1/environments/${encodeURIComponent(readValue("webhook-environment-id"))}/webhooks`)));
byId("save-webhook").addEventListener("click", () => run(() => request(webhookPath(), {
  method: "PUT",
  body: JSON.stringify({
    url: readValue("webhook-url"),
    secretRef: readValue("webhook-secret-ref"),
    eventTypes: readValue("webhook-events").split(",").map((value) => value.trim()).filter(Boolean),
  }),
})));
byId("disable-webhook").addEventListener("click", () => run(() => request(webhookPath(), { method: "DELETE" })));

function environmentPath(suffix) {
  return `/platform/v1/environments/${encodeURIComponent(readValue("environment-id"))}${suffix}`;
}

byId("show-entitlement").addEventListener("click", () => run(() => request(environmentPath("/entitlement"))));
byId("show-quota").addEventListener("click", () => run(() => request(environmentPath("/quotas"))));
byId("show-usage").addEventListener("click", () => run(() => request(environmentPath("/usage"))));
byId("list-support-tickets").addEventListener("click", () => run(() => request(environmentPath("/support/tickets"))));
byId("create-support-ticket").addEventListener("click", () => run(() => request(environmentPath("/support/tickets"), {
  method: "POST",
  headers: { "idempotency-key": crypto.randomUUID() },
  body: JSON.stringify({
    severity: readValue("support-severity"),
    category: readValue("support-category"),
    summary: readValue("support-summary"),
  }),
})));

byId("list-ingress").addEventListener("click", () => run(() => request(environmentPath("/media/ingress"))));
byId("list-egress").addEventListener("click", () => run(() => request(environmentPath("/media/egress"))));
byId("list-sip-calls").addEventListener("click", () => run(() => request(environmentPath("/media/sip/calls"))));

const mediaFormats = {
  ingress: [["rtmp", "RTMP"], ["whip", "WHIP"], ["url", "URL"]],
  egress: [["mp4", "MP4"], ["hls", "HLS"], ["rtmp", "RTMP"]],
};
function syncMediaFormats() {
  const kind = byId("media-kind").value;
  byId("media-format").replaceChildren(...mediaFormats[kind].map(([value, label]) => new Option(label, value)));
}
byId("media-kind").addEventListener("change", syncMediaFormats);
syncMediaFormats();

byId("create-media-job").addEventListener("click", () => run(async () => {
  const kind = readValue("media-kind");
  const format = readValue("media-format");
  const target = byId("media-target").value.trim();
  const body = kind === "ingress"
    ? { roomName: readValue("media-room"), inputType: format, ...(target.length === 0 ? {} : { url: target }) }
    : { roomName: readValue("media-room"), outputType: format, ...(target.length === 0 ? {} : { outputTarget: target }) };
  await request(environmentPath(`/media/${kind}`), {
    method: "POST",
    headers: { "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}));

byId("create-sip-call").addEventListener("click", () => run(async () => {
  if (!byId("sip-confirm").checked) throw new Error("请先确认本次外呼已取得必要授权");
  const remoteNumber = readValue("sip-remote-number");
  const sipTrunkId = byId("sip-trunk-id").value.trim();
  const participantIdentity = byId("sip-participant-identity").value.trim();
  const dtmf = byId("sip-dtmf").value.trim();
  try {
    await request(environmentPath("/media/sip/calls"), {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({
        direction: "outbound",
        roomName: readValue("sip-room"),
        remoteNumber,
        ...(sipTrunkId.length === 0 ? {} : { sipTrunkId }),
        ...(participantIdentity.length === 0 ? {} : { participantIdentity }),
        ...(dtmf.length === 0 ? {} : { dtmf }),
      }),
    });
  } finally {
    byId("sip-remote-number").value = "";
    byId("sip-dtmf").value = "";
    byId("sip-confirm").checked = false;
  }
}));
