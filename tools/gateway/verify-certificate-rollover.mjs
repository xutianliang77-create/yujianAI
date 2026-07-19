import { createHash, X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TOP_LEVEL_FIELDS = new Set(["schemaVersion", "taskId", "owner", "hostnames", "current", "next", "activateAt", "rollbackUntil", "minimumCurrentRemainingHours", "privateKeyReadRequired"]);
const CERTIFICATE_FIELDS = new Set(["certificatePath", "sha256Fingerprint"]);
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;

function record(value, name) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value;
}

function exactFields(value, fields, name) {
  for (const key of Object.keys(value)) if (!fields.has(key)) throw new Error(`${name}.${key} is unknown`);
}

function certificateInput(value, name) {
  const input = record(value, name);
  exactFields(input, CERTIFICATE_FIELDS, name);
  if (typeof input.certificatePath !== "string" || !isAbsolute(input.certificatePath) || /[\u0000-\u001f\u007f]/u.test(input.certificatePath)) throw new Error(`${name}.certificatePath must be an absolute control-free path`);
  if (typeof input.sha256Fingerprint !== "string" || !FINGERPRINT.test(input.sha256Fingerprint)) throw new Error(`${name}.sha256Fingerprint is invalid`);
  return input;
}

export function parseCertificateRolloverPlan(value) {
  const input = record(value, "plan");
  exactFields(input, TOP_LEVEL_FIELDS, "plan");
  if (input.schemaVersion !== 1 || input.taskId !== "M3-03-CERTIFICATE-ROLLOVER") throw new Error("certificate rollover plan identity is invalid");
  if (typeof input.owner !== "string" || input.owner.length < 3 || input.owner.length > 128) throw new Error("certificate rollover owner is invalid");
  if (!Array.isArray(input.hostnames) || input.hostnames.length === 0 || input.hostnames.length > 32 || input.hostnames.some((hostname) => typeof hostname !== "string" || !HOSTNAME.test(hostname))) throw new Error("certificate rollover hostnames are invalid");
  if (new Set(input.hostnames).size !== input.hostnames.length) throw new Error("certificate rollover hostnames are duplicated");
  const activateAt = Date.parse(input.activateAt);
  const rollbackUntil = Date.parse(input.rollbackUntil);
  if (!Number.isFinite(activateAt) || !Number.isFinite(rollbackUntil) || rollbackUntil <= activateAt) throw new Error("certificate rollover window is invalid");
  if (!Number.isSafeInteger(input.minimumCurrentRemainingHours) || input.minimumCurrentRemainingHours < 24 || input.minimumCurrentRemainingHours > 720) throw new Error("minimumCurrentRemainingHours must be 24-720");
  if (input.privateKeyReadRequired !== false) throw new Error("certificate rollover verification must not read private keys");
  return { ...input, current: certificateInput(input.current, "current"), next: certificateInput(input.next, "next"), activateAtMs: activateAt, rollbackUntilMs: rollbackUntil };
}

export function validateCertificateRollover(plan, current, next, now = Date.now()) {
  if (plan.activateAtMs < now || plan.current.sha256Fingerprint !== current.fingerprint || plan.next.sha256Fingerprint !== next.fingerprint) throw new Error("certificate rollover binding is invalid");
  if (current.fingerprint === next.fingerprint) throw new Error("next certificate must differ from current certificate");
  if (current.validFromMs > now || current.validToMs < now + plan.minimumCurrentRemainingHours * 3_600_000) throw new Error("current certificate validity is insufficient");
  if (current.validToMs < plan.rollbackUntilMs || next.validFromMs > plan.activateAtMs || next.validToMs < plan.rollbackUntilMs) throw new Error("certificate overlap does not cover activation and rollback");
  for (const hostname of plan.hostnames) {
    if (!current.hostnames.has(hostname) || !next.hostnames.has(hostname)) throw new Error(`certificate SAN does not cover ${hostname}`);
  }
  return { schemaVersion: 1, taskId: plan.taskId, owner: plan.owner, hostnames: plan.hostnames, activateAt: new Date(plan.activateAtMs).toISOString(), rollbackUntil: new Date(plan.rollbackUntilMs).toISOString(), currentFingerprint: current.fingerprint, nextFingerprint: next.fingerprint, privateKeyRead: false, status: "ready-for-controlled-rollover" };
}

function metadata(pem, hostnames) {
  const certificate = new X509Certificate(pem);
  const fingerprint = `sha256:${createHash("sha256").update(certificate.raw).digest("hex")}`;
  return { fingerprint, validFromMs: Date.parse(certificate.validFrom), validToMs: Date.parse(certificate.validTo), hostnames: new Set(hostnames.filter((hostname) => certificate.checkHost(hostname) !== undefined)) };
}

export function verifyCertificateRolloverFile(planPath, now = Date.now()) {
  const plan = parseCertificateRolloverPlan(JSON.parse(readFileSync(resolve(planPath), "utf8")));
  const currentPem = readFileSync(plan.current.certificatePath, "utf8");
  const nextPem = readFileSync(plan.next.certificatePath, "utf8");
  return validateCertificateRollover(plan, metadata(currentPem, plan.hostnames), metadata(nextPem, plan.hostnames), now);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const planPath = process.argv[2];
  if (planPath === undefined) throw new Error("usage: verify-certificate-rollover.mjs <plan.json>");
  process.stdout.write(`${JSON.stringify(verifyCertificateRolloverFile(planPath), null, 2)}\n`);
}
