import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = requiredEnvironment("YUJIAN_WEB_COMPAT_URL").replace(/\/$/u, "");
const chromeBinary = findChrome();
const debugPort = await freePort();
const userDataDirectory = await mkdtemp(join(tmpdir(), "yujian-chrome-"));
const chrome = spawn(
  chromeBinary,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-proxy-server",
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDirectory}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "inherit"] },
);

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

function findChrome() {
  const candidates = [
    process.env.YUJIAN_CHROME_BIN,
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (result.status === 0) return candidate;
  }
  throw new Error("Chrome or Chromium executable was not found");
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("could not allocate a Chrome debug port");
  }
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function waitForChrome(port) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("Chrome DevTools endpoint did not become ready");
}

async function newPage(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
    method: "PUT",
  });
  if (!response.ok) throw new Error("could not create a Chrome test page");
  const target = await response.json();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  return client;
}

async function navigate(client, url) {
  await client.send("Page.navigate", { url });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const state = await evaluate(client, "document.readyState");
    if (state === "complete") return;
    await delay(100);
  }
  throw new Error(`page did not load: ${url}`);
}

async function runWebAcceptance(port) {
  const client = await newPage(port);
  try {
    await navigate(client, `${baseUrl}/`);
    await evaluate(client, 'document.querySelector("#run").click()');
    const result = await poll(client, `(() => {
      const status = document.querySelector("#status");
      return { state: status?.dataset.state, text: status?.textContent };
    })()`, (value) => ["passed", "failed"].includes(value?.state));
    if (result.state !== "passed") throw new Error(`Web SDK: ${result.text}`);
    process.stdout.write(`${result.text}\n`);
  } finally {
    client.close();
  }
}

async function runFlutterAcceptance(port) {
  const client = await newPage(port);
  let outcome;
  client.on("Runtime.consoleAPICalled", (event) => {
    const message = event.params.args.map((argument) => argument.value ?? "").join(" ");
    if (message.includes("YUJIAN_FLUTTER_COMPAT_PASSED")) outcome = "passed";
    if (message.includes("YUJIAN_FLUTTER_COMPAT_FAILED")) outcome = message;
  });
  try {
    await navigate(client, `${baseUrl}/flutter/?autorun=1`);
    const deadline = Date.now() + 30_000;
    while (outcome === undefined && Date.now() < deadline) await delay(100);
    if (outcome !== "passed") {
      throw new Error(
        typeof outcome === "string" ? outcome : "Flutter Web timed out",
      );
    }
  } finally {
    client.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error("browser expression failed");
  return result.result.value;
}

async function poll(client, expression, complete) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const value = await evaluate(client, expression);
    if (complete(value)) return value;
    await delay(100);
  }
  throw new Error("browser acceptance timed out");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => this.handle(event));
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  handle(event) {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending?.reject(new Error(message.error.message));
      else pending?.resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message);
  }

  close() {
    this.socket.close();
  }
}

try {
  await waitForChrome(debugPort);
  await runWebAcceptance(debugPort);
  await runFlutterAcceptance(debugPort);
  process.stdout.write("Browser acceptance passed (Web and Flutter Web)\n");
} finally {
  if (chrome.exitCode === null) {
    chrome.kill("SIGTERM");
    await new Promise((resolve) => chrome.once("exit", resolve));
  }
  await rm(userDataDirectory, { recursive: true, force: true });
}
