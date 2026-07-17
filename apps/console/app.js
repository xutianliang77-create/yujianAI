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
    if (key === "token" || key.toLowerCase().includes("secret")) return [key, "[redacted]"];
    return [key, safeResponse(item)];
  }));
}

function render(value) {
  output.textContent = typeof value === "string" ? value : JSON.stringify(safeResponse(value), null, 2);
}

async function request(path, options = {}) {
  const base = readValue("api-url").replace(/\/$/u, "");
  const headers = { accept: "application/json", ...(options.body === undefined ? {} : { "content-type": "application/json" }) };
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
