import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export interface OwnerApprovalConfig {
  host: string;
  port: number;
  assetRoot: string;
  templateRoot: string;
  keyRegistryPath: string;
  evidenceRoot: string;
  openBaoAddresses: readonly string[];
  tls?: { cert: Buffer; key: Buffer };
}

const defaultAssetRoot = fileURLToPath(new URL("../../../apps/owner-approval", import.meta.url));
const defaultTemplateRoot = fileURLToPath(new URL("../../../docs/governance/owner-decisions", import.meta.url));
const defaultKeyRegistry = fileURLToPath(new URL("../../../docs/acceptance/p1-owner-key-registry.json", import.meta.url));
const controlCharacters = /[\u0000-\u001f\u007f]/u;

function value(environment: NodeJS.ProcessEnv, name: string, fallback?: string): string {
  const result = environment[name] ?? fallback;
  if (result === undefined || result.length === 0 || controlCharacters.test(result)) throw new Error(`${name} must be set and control-free`);
  return result;
}

function port(input: string | undefined): number {
  const result = Number(input ?? 8093);
  if (!Number.isInteger(result) || result < 1 || result > 65535) throw new Error("YUJIAN_OWNER_APPROVAL_PORT must be 1-65535");
  return result;
}

function addresses(input: string): string[] {
  const result = input.split(",").map((item) => item.trim()).filter(Boolean);
  if (result.length === 0 || result.some((item) => !/^https?:\/\//u.test(item))) throw new Error("YUJIAN_OWNER_OPENBAO_ADDRS is invalid");
  return result;
}

function absolute(input: string, name: string): string {
  const result = resolve(input);
  if (result !== input) throw new Error(`${name} must be an absolute path`);
  return result;
}

export function loadOwnerApprovalConfig(environment: NodeJS.ProcessEnv = process.env): OwnerApprovalConfig {
  const host = value(environment, "YUJIAN_OWNER_APPROVAL_HOST", "127.0.0.1");
  const certPath = environment.YUJIAN_OWNER_APPROVAL_TLS_CERT;
  const keyPath = environment.YUJIAN_OWNER_APPROVAL_TLS_KEY;
  if ((certPath === undefined) !== (keyPath === undefined)) throw new Error("Owner approval TLS cert and key must be set together");
  const loopback = host === "127.0.0.1" || host === "::1" || host === "localhost";
  if (!loopback && certPath === undefined) throw new Error("Owner approval service requires TLS when bound beyond loopback");
  return {
    host,
    port: port(environment.YUJIAN_OWNER_APPROVAL_PORT),
    assetRoot: absolute(value(environment, "YUJIAN_OWNER_APPROVAL_ASSET_ROOT", defaultAssetRoot), "YUJIAN_OWNER_APPROVAL_ASSET_ROOT"),
    templateRoot: absolute(value(environment, "YUJIAN_OWNER_APPROVAL_TEMPLATE_ROOT", defaultTemplateRoot), "YUJIAN_OWNER_APPROVAL_TEMPLATE_ROOT"),
    keyRegistryPath: absolute(value(environment, "YUJIAN_OWNER_KEY_REGISTRY", defaultKeyRegistry), "YUJIAN_OWNER_KEY_REGISTRY"),
    evidenceRoot: absolute(value(environment, "YUJIAN_OWNER_APPROVAL_EVIDENCE_ROOT"), "YUJIAN_OWNER_APPROVAL_EVIDENCE_ROOT"),
    openBaoAddresses: addresses(value(environment, "YUJIAN_OWNER_OPENBAO_ADDRS")),
    ...(certPath === undefined || keyPath === undefined ? {} : {
      tls: { cert: readFileSync(certPath), key: readFileSync(keyPath) },
    }),
  };
}
