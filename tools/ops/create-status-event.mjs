import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [inputArg, outputArg] = process.argv.slice(2);
if (inputArg === undefined || outputArg === undefined) throw new Error("usage: create-status-event <event.json> <new-public-event.json>");
const input = JSON.parse(readFileSync(resolve(inputArg), "utf8"));
const ID = /^[a-z][a-z0-9-]{2,127}$/u;
const REF = /^(?:evidence|https):\/\/[^\s?#]+$/u;
const text = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
const instant = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const publicMessage = input?.publicMessage;
const forbidden = /(?:tenant|participant|room[_ -]?id|token|secret|api[_ -]?key|\b(?:10|127|169\.254|172\.(?:1[6-9]|2[0-9]|3[01])|192\.168)\.[0-9.]+\b|wss?:\/\/|@[a-z0-9.-]+\.[a-z]{2,})/iu;
if (input?.schemaVersion !== 1 || !ID.test(input.eventId) || !["p0", "p1", "p2"].includes(input.severity) || !["investigating", "identified", "monitoring", "resolved"].includes(input.status) || !Array.isArray(input.affectedCapabilities) || input.affectedCapabilities.length === 0 || input.affectedCapabilities.some((value) => !ID.test(value)) || !Array.isArray(input.affectedRegions) || input.affectedRegions.some((value) => !ID.test(value)) || !text(publicMessage, 1000) || forbidden.test(publicMessage) || !instant(input.startedAt)) throw new Error("public status event is invalid or contains sensitive detail");
if ((input.severity === "p0" || input.severity === "p1") && !ID.test(input.incidentId ?? "")) throw new Error("P0/P1 public status event requires an incident ID");
if (input.status === "resolved") {
  if (!instant(input.resolvedAt) || input.nextUpdateAt !== null || !REF.test(input.postmortemRef ?? "")) throw new Error("resolved event requires resolvedAt and public postmortem reference");
} else if (!instant(input.nextUpdateAt) || input.resolvedAt !== null || input.postmortemRef !== null) throw new Error("active event timestamps are invalid");
const output = resolve(outputArg);
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
writeFileSync(output, `${JSON.stringify(input, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ output, eventId: input.eventId, status: input.status })}\n`);
