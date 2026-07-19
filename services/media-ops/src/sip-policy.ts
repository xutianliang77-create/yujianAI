import type { SipTrunkV1 } from "@yujian/platform-contracts";
import type { SipRiskDecisionProvider } from "./governed-provider.js";

export interface SipTrunkPolicySqlPool {
  query<Row extends object>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly Row[] }>;
}

export interface SipTrunkPolicyProvider {
  get(environmentId: string, trunkId: string | undefined): Promise<SipTrunkV1 | undefined>;
}

export interface SipFraudDecisionProvider {
  authorize(input: { environmentId: string; trunk: SipTrunkV1; operation: "call" | "transfer"; destination: string }): Promise<{ allowed: boolean; decisionCode: string }>;
}

type TrunkRow = {
  trunk_id: string; environment_id: string; direction: string; provider: string; region: string;
  number_refs: unknown; credential_ref: string; allowed_destination_prefixes: unknown;
  secure_transport: string; fraud_policy_ref: string; dispatch_rule_ref: string;
  max_concurrent_calls: number | string; max_calls_per_minute: number | string;
  max_daily_cost_micros: number | string; allow_international: boolean; status: string;
  version: number | string; updated_at: string | Date;
};

function strings(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0 || item.length > 512 || /[\u0000-\u001f\u007f]/u.test(item))) throw new Error(`SIP trunk ${field} is invalid`);
  return value;
}

function integer(value: string | number, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`SIP trunk ${field} is invalid`);
  return parsed;
}

function trunk(row: TrunkRow): SipTrunkV1 {
  if (!(["inbound", "outbound", "bidirectional"] as const).includes(row.direction as never)) throw new Error("SIP trunk direction is invalid");
  if (!(["active", "suspended", "retiring"] as const).includes(row.status as never)) throw new Error("SIP trunk status is invalid");
  if (row.secure_transport !== "tls-srtp" && row.secure_transport !== "provider-managed") throw new Error("SIP trunk secure transport is invalid");
  const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at;
  if (!Number.isFinite(Date.parse(updatedAt))) throw new Error("SIP trunk updatedAt is invalid");
  return {
    trunkId: row.trunk_id, environmentId: row.environment_id, direction: row.direction as SipTrunkV1["direction"],
    provider: row.provider, region: row.region, numberRefs: strings(row.number_refs, "numberRefs"),
    credentialRef: row.credential_ref, allowedDestinationPrefixes: strings(row.allowed_destination_prefixes, "allowedDestinationPrefixes"),
    secureTransport: row.secure_transport, fraudPolicyRef: row.fraud_policy_ref, dispatchRuleRef: row.dispatch_rule_ref,
    maxConcurrentCalls: integer(row.max_concurrent_calls, "maxConcurrentCalls"), maxCallsPerMinute: integer(row.max_calls_per_minute, "maxCallsPerMinute"),
    maxDailyCostMicros: integer(row.max_daily_cost_micros, "maxDailyCostMicros"), allowInternational: row.allow_international,
    status: row.status as SipTrunkV1["status"], version: integer(row.version, "version"), updatedAt,
  };
}

export class PostgresSipTrunkPolicyProvider implements SipTrunkPolicyProvider {
  constructor(private readonly pool: SipTrunkPolicySqlPool) {}
  async get(environmentId: string, trunkId: string | undefined): Promise<SipTrunkV1 | undefined> {
    const result = await this.pool.query<TrunkRow>(
      `SELECT * FROM sip_trunks WHERE environment_id = $1 AND (($2::text IS NOT NULL AND trunk_id = $2) OR ($2::text IS NULL AND status = 'active'))
       ORDER BY CASE WHEN trunk_id = $2 THEN 0 ELSE 1 END, trunk_id LIMIT 2`,
      [environmentId, trunkId ?? null],
    );
    if (result.rows.length > 1 && trunkId === undefined) throw new Error("SIP trunk selection is ambiguous");
    return result.rows[0] === undefined ? undefined : trunk(result.rows[0]);
  }
}

function e164(value: string): boolean { return /^\+[1-9][0-9]{6,14}$/u.test(value); }

/** Default-deny trunk, destination and fraud policy used before Redis/cost admission. */
export class PolicySipRiskDecisionProvider implements SipRiskDecisionProvider {
  constructor(private readonly trunks: SipTrunkPolicyProvider, private readonly fraud: SipFraudDecisionProvider) {}

  async authorize(input: Parameters<SipRiskDecisionProvider["authorize"]>[0]): ReturnType<SipRiskDecisionProvider["authorize"]> {
    const selected = await this.trunks.get(input.environmentId, input.trunkId);
    if (selected === undefined || selected.status !== "active") return { allowed: false, decisionCode: "trunk_unavailable" };
    if (selected.fraudPolicyRef === "unconfigured" || selected.dispatchRuleRef === "unconfigured") return { allowed: false, decisionCode: "trunk_policy_unconfigured" };
    const direction = input.direction ?? "outbound";
    if (input.operation === "call" && selected.direction !== "bidirectional" && selected.direction !== direction) return { allowed: false, decisionCode: "direction_denied" };
    if (!e164(input.destination)) return { allowed: false, decisionCode: "destination_not_e164" };
    if (!selected.allowInternational && !input.destination.startsWith("+86")) return { allowed: false, decisionCode: "international_denied" };
    if (selected.allowedDestinationPrefixes.length === 0 || !selected.allowedDestinationPrefixes.some((prefix) => input.destination.startsWith(prefix))) return { allowed: false, decisionCode: "destination_denied" };
    const decision = await this.fraud.authorize({ environmentId: input.environmentId, trunk: selected, operation: input.operation, destination: input.destination });
    if (!decision.allowed) return { allowed: false, decisionCode: decision.decisionCode || "fraud_denied" };
    return { allowed: true, decisionCode: decision.decisionCode, trunkId: selected.trunkId, maxConcurrentCalls: selected.maxConcurrentCalls, maxCallsPerMinute: selected.maxCallsPerMinute, maxDailyCostMicros: selected.maxDailyCostMicros };
  }
}
