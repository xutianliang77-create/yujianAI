import { LiveKitCapacityCollector } from "./collector.js";
import { loadRtcCapacityExporterConfig } from "./config.js";
import { RtcCapacityExporter } from "./exporter.js";

const config = loadRtcCapacityExporterConfig();
const exporter = new RtcCapacityExporter(config, new LiveKitCapacityCollector(config.livekitUrl, config.apiKey, config.apiSecret));
let stopping = false;
let timer: NodeJS.Timeout | undefined;

async function tick(): Promise<void> {
  try {
    const report = await exporter.publish();
    console.log(JSON.stringify({ level: "info", message: "RTC capacity published", nodeId: report.nodeId, sequence: report.sequence, draining: report.draining }));
  } catch (error) {
    console.error(JSON.stringify({ level: "error", message: "RTC capacity publish failed", error: error instanceof Error ? error.message : "unknown" }));
  }
  if (!stopping) timer = setTimeout(() => void tick(), config.intervalMs);
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (timer !== undefined) clearTimeout(timer);
  exporter.setDraining();
  try { await exporter.publish(); } catch (error) {
    console.error(JSON.stringify({ level: "error", message: "RTC drain report failed", signal, error: error instanceof Error ? error.message : "unknown" }));
    process.exitCode = 1;
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
void tick();
