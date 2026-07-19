import { createHash, randomUUID } from "node:crypto";
import type { BillingSqlPool } from "./postgres-ledger.js";

export interface BillingSqlConnection extends BillingSqlPool { release(): void; }
export interface BillingWritePool extends BillingSqlPool { connect(): Promise<BillingSqlConnection>; }
export interface BillingArtifactStore { put(key: string, body: Uint8Array, contentType: string): Promise<{ uri: string }>; }
export interface BillingReconciliation {
  reconciliationId: string;
  invoiceId: string;
  statementId: string;
  expectedFen: number;
  providerTotalFen: number;
  deltaFen: number;
  status: "matched" | "within-threshold" | "review-required" | "adjusted";
  thresholdFen: number;
}

const PERIOD = /^20[0-9]{2}-(0[1-9]|1[0-2])$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const REF = /^(?:evidence|https|s3|gs|oss):\/\/[^\s?#]+$/u;
const ID = /^[a-z][a-z0-9._-]{2,127}$/u;
function safeInteger(value: string | number, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`billing ${field} is invalid`);
  return number;
}
function signedInteger(value: string | number, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`billing ${field} is invalid`);
  return number;
}
function monthBounds(period: string): [string, string] {
  if (!PERIOD.test(period)) throw new Error("billing period is invalid");
  const [year, month] = period.split("-").map(Number);
  return [new Date(Date.UTC(year!, month! - 1, 1)).toISOString(), new Date(Date.UTC(year!, month!, 1)).toISOString()];
}

/** PostgreSQL financial write model; all invoice and adjustment changes are transactional and CAS-protected. */
export class PostgresBillingSettlementService {
  constructor(private readonly pool: BillingWritePool, private readonly artifacts: BillingArtifactStore, private readonly clock: () => number = Date.now) {}

  async createDraft(tenantId: string, billingPeriod: string, planId: string): Promise<string> {
    if (!/^[a-z][a-z0-9-]{2,127}$/u.test(tenantId) || !/^[a-z][a-z0-9._-]{2,127}$/u.test(planId)) throw new Error("billing scope or plan is invalid");
    const [start, end] = monthBounds(billingPeriod);
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${tenantId}:${billingPeriod}`]);
      const existing = await connection.query<{ invoice_id: string; plan_id: string | null }>("SELECT invoice_id,plan_id FROM billing_invoices WHERE tenant_id=$1 AND billing_period=$2", [tenantId, billingPeriod]);
      if (existing.rows[0] !== undefined) {
        if (existing.rows[0].plan_id !== planId) throw new Error("billing period already uses a different price plan");
        await connection.query("COMMIT"); return existing.rows[0].invoice_id;
      }
      const plan = await connection.query<{ overage_unit_prices: Record<string, unknown> }>("SELECT overage_unit_prices FROM price_plans WHERE plan_id=$1 AND currency='CNY' AND effective_from<=$2 ORDER BY effective_from DESC LIMIT 1", [planId, start]);
      const prices = plan.rows[0]?.overage_unit_prices;
      if (prices === undefined || typeof prices !== "object" || Array.isArray(prices)) throw new Error("billing price plan is unavailable");
      const incomplete = await connection.query<{ count: string | number }>("SELECT count(*) AS count FROM usage_records WHERE tenant_id=$1 AND window_start<$3 AND window_end>$2 AND (finalized_at IS NULL OR window_start<$2 OR window_end>$3)", [tenantId, start, end]);
      if (safeInteger(incomplete.rows[0]?.count ?? 0, "incomplete usage count") > 0) throw new Error("billing period contains unfinalized or cross-boundary usage");
      const usage = await connection.query<{ metric: string; quantity: string | number }>("SELECT metric,sum(quantity) AS quantity FROM usage_records WHERE tenant_id=$1 AND window_start>=$2 AND window_end<=$3 AND finalized_at IS NOT NULL GROUP BY metric ORDER BY metric", [tenantId, start, end]);
      const invoiceId = `invoice-${randomUUID()}`;
      const lines = usage.rows.map((row) => {
        const quantity = Number(row.quantity); const price = prices[row.metric];
        if (!Number.isFinite(quantity) || quantity < 0 || !Number.isSafeInteger(price) || (price as number) < 0) throw new Error(`billing price or quantity is invalid for ${row.metric}`);
        const amountFen = Math.round(quantity * (price as number));
        if (!Number.isSafeInteger(amountFen)) throw new Error(`billing amount exceeds safe range for ${row.metric}`);
        return { lineId: `line-${randomUUID()}`, metric: row.metric, quantity, unitPriceFen: price as number, amountFen };
      });
      const totalFen = lines.reduce((sum, line) => sum + line.amountFen, 0);
      if (!Number.isSafeInteger(totalFen)) throw new Error("billing invoice total exceeds safe range");
      const now = new Date(this.clock()).toISOString();
      await connection.query("INSERT INTO billing_invoices (invoice_id,tenant_id,billing_period,currency,status,total_fen,created_at,plan_id,usage_cutoff,version) VALUES ($1,$2,$3,'CNY','draft',$4,$5,$6,$7,1)", [invoiceId, tenantId, billingPeriod, totalFen, now, planId, end]);
      for (const line of lines) await connection.query("INSERT INTO billing_invoice_lines (line_id,invoice_id,usage_metric,quantity,unit_price_fen,amount_fen,usage_window_start,usage_window_end) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [line.lineId, invoiceId, line.metric, line.quantity, line.unitPriceFen, line.amountFen, start, end]);
      await connection.query("COMMIT");
      return invoiceId;
    } catch (error) { await connection.query("ROLLBACK"); throw error; }
    finally { connection.release(); }
  }

  async transition(invoiceId: string, expectedVersion: number, target: "issued" | "paid" | "void", approvalReceiptRef: string): Promise<void> {
    if (!ID.test(invoiceId) || !REF.test(approvalReceiptRef) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error("billing transition approval or version is invalid");
    const allowed = target === "issued" ? ["draft"] : target === "paid" ? ["issued"] : ["draft", "issued"];
    const timeColumn = target === "issued" ? "issued_at" : target === "paid" ? "paid_at" : "voided_at";
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      const now = new Date(this.clock()).toISOString();
      const current = await connection.query<{ status: string }>("SELECT status FROM billing_invoices WHERE invoice_id=$1 AND version=$2 AND status=ANY($3::text[]) FOR UPDATE", [invoiceId, expectedVersion, allowed]);
      const fromStatus = current.rows[0]?.status;
      if (fromStatus === undefined) throw new Error("billing invoice transition conflict");
      const result = await connection.query<{ invoice_id: string }>(`UPDATE billing_invoices SET status=$2,${timeColumn}=$3,version=version+1 WHERE invoice_id=$1 AND version=$4 RETURNING invoice_id`, [invoiceId, target, now, expectedVersion]);
      if (result.rows[0] === undefined) throw new Error("billing invoice transition conflict");
      await connection.query("INSERT INTO billing_invoice_transitions (transition_id,invoice_id,from_status,to_status,from_version,to_version,approval_receipt_ref,transitioned_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [`billing-transition-${randomUUID()}`, invoiceId, fromStatus, target, expectedVersion, expectedVersion + 1, approvalReceiptRef, now]);
      await connection.query("COMMIT");
    } catch (error) { await connection.query("ROLLBACK"); throw error; }
    finally { connection.release(); }
  }

  async reconcile(invoiceId: string, statement: { statementId: string; providerId: string; billingPeriod: string; totalFen: number; digest: string; artifactUri: string }, thresholdFen: number): Promise<BillingReconciliation> {
    if (!ID.test(invoiceId) || !ID.test(statement.statementId) || !ID.test(statement.providerId) || !PERIOD.test(statement.billingPeriod) || !DIGEST.test(statement.digest) || !REF.test(statement.artifactUri) || !Number.isSafeInteger(statement.totalFen) || statement.totalFen < 0 || !Number.isSafeInteger(thresholdFen) || thresholdFen < 0) throw new Error("provider billing statement is invalid");
    const now = new Date(this.clock()).toISOString();
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("INSERT INTO provider_billing_statements (statement_id,provider_id,billing_period,currency,total_fen,statement_digest,artifact_uri,created_at) VALUES ($1,$2,$3,'CNY',$4,$5,$6,$7) ON CONFLICT (statement_digest) DO NOTHING", [statement.statementId, statement.providerId, statement.billingPeriod, statement.totalFen, statement.digest, statement.artifactUri, now]);
      const stored = await connection.query<{ statement_id: string; provider_id: string; billing_period: string; total_fen: string | number; artifact_uri: string }>("SELECT statement_id,provider_id,billing_period,total_fen,artifact_uri FROM provider_billing_statements WHERE statement_digest=$1", [statement.digest]);
      const persisted = stored.rows[0];
      if (persisted === undefined || persisted.provider_id !== statement.providerId || persisted.billing_period !== statement.billingPeriod || safeInteger(persisted.total_fen, "provider total") !== statement.totalFen || persisted.artifact_uri !== statement.artifactUri) throw new Error("provider statement digest conflicts with persisted content");
      const invoice = await connection.query<{ total_fen: string | number; billing_period: string }>("SELECT total_fen,billing_period FROM billing_invoices WHERE invoice_id=$1", [invoiceId]);
      const row = invoice.rows[0];
      if (row === undefined || row.billing_period !== statement.billingPeriod) throw new Error("provider statement does not match invoice period");
      const expectedFen = safeInteger(row.total_fen, "invoice total"); const deltaFen = statement.totalFen - expectedFen;
      const status = deltaFen === 0 ? "matched" : Math.abs(deltaFen) <= thresholdFen ? "within-threshold" : "review-required";
      const proposedId = `billing-recon-${randomUUID()}`;
      await connection.query("INSERT INTO billing_reconciliations (reconciliation_id,invoice_id,statement_id,expected_fen,provider_total_fen,delta_fen,status,threshold_fen,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (invoice_id,statement_id) DO NOTHING", [proposedId, invoiceId, persisted.statement_id, expectedFen, statement.totalFen, deltaFen, status, thresholdFen, now]);
      const existing = await connection.query<{ reconciliation_id: string; expected_fen: string | number; provider_total_fen: string | number; delta_fen: string | number; status: BillingReconciliation["status"]; threshold_fen: string | number }>("SELECT reconciliation_id,expected_fen,provider_total_fen,delta_fen,status,threshold_fen FROM billing_reconciliations WHERE invoice_id=$1 AND statement_id=$2", [invoiceId, persisted.statement_id]);
      const reconciliation = existing.rows[0];
      if (reconciliation === undefined) throw new Error("provider reconciliation was not persisted");
      const storedExpected = safeInteger(reconciliation.expected_fen, "expected total");
      const storedProvider = safeInteger(reconciliation.provider_total_fen, "provider total");
      const storedDelta = signedInteger(reconciliation.delta_fen, "delta");
      const storedThreshold = safeInteger(reconciliation.threshold_fen, "threshold");
      if (storedExpected !== expectedFen || storedProvider !== statement.totalFen || storedDelta !== deltaFen || storedThreshold !== thresholdFen || (reconciliation.status !== status && reconciliation.status !== "adjusted")) throw new Error("provider reconciliation conflicts with immutable input");
      await connection.query("COMMIT");
      return { reconciliationId: reconciliation.reconciliation_id, invoiceId, statementId: persisted.statement_id, expectedFen: storedExpected, providerTotalFen: storedProvider, deltaFen: storedDelta, status: reconciliation.status, thresholdFen: storedThreshold };
    } catch (error) { await connection.query("ROLLBACK"); throw error; }
    finally { connection.release(); }
  }

  async adjustReconciliation(reconciliationId: string, financeApprovalRef: string, reason: string, dedupeKey: string): Promise<string> {
    if (!ID.test(reconciliationId) || !REF.test(financeApprovalRef) || !ID.test(dedupeKey) || reason.trim() !== reason || reason.length < 20 || reason.length > 512 || /[\u0000-\u001f\u007f]/u.test(reason)) throw new Error("billing reconciliation adjustment is invalid");
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      const result = await connection.query<{ invoice_id: string; delta_fen: string | number; status: BillingReconciliation["status"]; finance_approval_ref: string | null; adjustment_id: string | null }>("SELECT invoice_id,delta_fen,status,finance_approval_ref,adjustment_id FROM billing_reconciliations WHERE reconciliation_id=$1 FOR UPDATE", [reconciliationId]);
      const row = result.rows[0];
      if (row === undefined || row.status === "matched") throw new Error("billing reconciliation cannot be adjusted");
      const deltaFen = signedInteger(row.delta_fen, "delta");
      if (deltaFen === 0) throw new Error("zero-delta reconciliation cannot be adjusted");
      const kind = deltaFen > 0 ? "debit" : "credit";
      if (row.status === "adjusted") {
        const existing = await connection.query<{ adjustment_id: string }>("SELECT adjustment_id FROM billing_adjustments WHERE adjustment_id=$1 AND invoice_id=$2 AND kind=$3 AND amount_fen=$4 AND reason=$5 AND dedupe_key=$6", [row.adjustment_id, row.invoice_id, kind, Math.abs(deltaFen), reason, dedupeKey]);
        if (row.finance_approval_ref !== financeApprovalRef || existing.rows[0] === undefined) throw new Error("billing reconciliation adjustment conflicts with immutable input");
        await connection.query("COMMIT");
        return existing.rows[0].adjustment_id;
      }
      const adjustmentId = `adjustment-${randomUUID()}`;
      const now = new Date(this.clock()).toISOString();
      await connection.query("INSERT INTO billing_adjustments (adjustment_id,invoice_id,kind,amount_fen,reason,dedupe_key,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [adjustmentId, row.invoice_id, kind, Math.abs(deltaFen), reason, dedupeKey, now]);
      const updated = await connection.query<{ reconciliation_id: string }>("UPDATE billing_reconciliations SET status='adjusted',finance_approval_ref=$2,adjustment_id=$3 WHERE reconciliation_id=$1 AND status=$4 RETURNING reconciliation_id", [reconciliationId, financeApprovalRef, adjustmentId, row.status]);
      if (updated.rows[0] === undefined) throw new Error("billing reconciliation adjustment conflict");
      await connection.query("COMMIT");
      return adjustmentId;
    } catch (error) { await connection.query("ROLLBACK"); throw error; }
    finally { connection.release(); }
  }

  async exportInvoice(invoiceId: string): Promise<{ uri: string; digest: string }> {
    if (!ID.test(invoiceId)) throw new Error("invoice ID is invalid");
    const invoice = await this.pool.query<Record<string, unknown> & { invoice_id: string; status: string }>("SELECT * FROM billing_invoices WHERE invoice_id=$1", [invoiceId]);
    const lines = await this.pool.query<Record<string, unknown>>("SELECT * FROM billing_invoice_lines WHERE invoice_id=$1 ORDER BY line_id", [invoiceId]);
    if (invoice.rows[0] === undefined) throw new Error("invoice not found");
    if (invoice.rows[0].status !== "issued" && invoice.rows[0].status !== "paid") throw new Error("only issued or paid invoices can be exported");
    const body = Buffer.from(`${JSON.stringify({ schemaVersion: 1, invoice: invoice.rows[0], lines: lines.rows }, null, 2)}\n`, "utf8");
    const digest = `sha256:${createHash("sha256").update(body).digest("hex")}`;
    const artifact = await this.artifacts.put(`billing/${invoiceId}/${digest.slice(7)}.json`, body, "application/json");
    if (!REF.test(artifact.uri)) throw new Error("billing export URI is invalid");
    const updated = await this.pool.query<{ invoice_id: string }>("UPDATE billing_invoices SET export_uri=$2,export_digest=$3 WHERE invoice_id=$1 AND (export_digest IS NULL OR (export_digest=$3 AND export_uri=$2)) RETURNING invoice_id", [invoiceId, artifact.uri, digest]);
    if (updated.rows[0] === undefined) throw new Error("invoice export conflicts with immutable artifact");
    return { uri: artifact.uri, digest };
  }
}
