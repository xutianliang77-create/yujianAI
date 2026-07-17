const baseUrl = process.env.YUJIAN_PLATFORM_URL ?? "http://127.0.0.1:8090";
const paths = ["/healthz", "/readyz"];
const results = [];
for (const path of paths) {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(5_000) });
    results.push({ path, status: response.status, latencyMs: Math.round(performance.now() - started), ok: response.ok });
  } catch (error) {
    results.push({ path, ok: false, error: error instanceof Error ? error.message : "probe failed" });
  }
}
process.stdout.write(`${JSON.stringify({ baseUrl, observedAt: new Date().toISOString(), results }, null, 2)}\n`);
if (results.some((result) => !result.ok)) process.exitCode = 1;
