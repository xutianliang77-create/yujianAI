import type { BillingAdjustmentV1, InvoiceLineV1, InvoiceV1 } from "@yujian/platform-contracts";

export interface BillingSqlResult<Row extends object> { rows: readonly Row[] }
export interface BillingSqlPool { query<Row extends object>(text: string, values?: readonly unknown[]): Promise<BillingSqlResult<Row>> }

type InvoiceRow = {
  invoice_id: string;
  tenant_id: string;
  billing_period: string;
  currency: "CNY";
  status: InvoiceV1["status"];
  total_fen: string | number;
  created_at: string;
  line_id?: string | null;
  usage_metric?: string | null;
  quantity?: string | number | null;
  unit_price_fen?: string | number | null;
  amount_fen?: string | number | null;
  usage_window_start?: string | null;
  usage_window_end?: string | null;
};

type AdjustmentRow = {
  adjustment_id: string;
  invoice_id: string;
  kind: BillingAdjustmentV1["kind"];
  amount_fen: string | number;
  reason: string;
  dedupe_key: string;
  created_at: string;
};

function integer(value: string | number, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`invalid ${field}`);
  return parsed;
}

function quantity(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("invalid invoice quantity");
  return parsed;
}

function text(value: unknown, field: string, max = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`invalid ${field}`);
  return value;
}

function invoiceFromRows(rows: readonly InvoiceRow[]): InvoiceV1 {
  const first = rows[0];
  if (first === undefined) throw new Error("invoice not found");
  if (first.currency !== "CNY" || !/^\d{4}-(0[1-9]|1[0-2])$/u.test(first.billing_period)) throw new Error("invalid invoice currency or billing period");
  if (first.status !== "draft" && first.status !== "issued" && first.status !== "void" && first.status !== "paid") throw new Error("invalid invoice status");
  const lines: InvoiceLineV1[] = rows.flatMap((row) => row.line_id === null || row.line_id === undefined ? [] : [{
    lineId: text(row.line_id, "line_id", 256),
    usageMetric: text(row.usage_metric, "usage_metric", 256),
    quantity: quantity(row.quantity),
    unitPriceFen: integer(row.unit_price_fen ?? 0, "unit_price_fen"),
    amountFen: integer(row.amount_fen ?? 0, "amount_fen"),
    usageWindowStart: new Date(text(row.usage_window_start, "usage_window_start", 64)).toISOString(),
    usageWindowEnd: new Date(text(row.usage_window_end, "usage_window_end", 64)).toISOString(),
  }]);
  return {
    invoiceId: text(first.invoice_id, "invoice_id", 256),
    tenantId: text(first.tenant_id, "tenant_id", 128),
    billingPeriod: first.billing_period,
    currency: first.currency,
    status: first.status,
    lines,
    totalFen: integer(first.total_fen, "total_fen"),
    createdAt: new Date(text(first.created_at, "created_at", 64)).toISOString(),
  };
}

function adjustmentFrom(row: AdjustmentRow): BillingAdjustmentV1 {
  if (row.kind !== "credit" && row.kind !== "debit") throw new Error("invalid adjustment kind");
  return {
    adjustmentId: text(row.adjustment_id, "adjustment_id", 256),
    invoiceId: text(row.invoice_id, "invoice_id", 256),
    kind: row.kind,
    amountFen: integer(row.amount_fen, "amount_fen"),
    reason: text(row.reason, "reason", 256),
    dedupeKey: text(row.dedupe_key, "dedupe_key", 256),
    createdAt: new Date(text(row.created_at, "created_at", 64)).toISOString(),
  };
}

/** Read model used by the control plane; invoice creation remains a financial-system concern. */
export class PostgresBillingReadModel {
  constructor(private readonly pool: BillingSqlPool) {}

  async listInvoices(tenantId: string): Promise<readonly InvoiceV1[]> {
    const result = await this.pool.query<InvoiceRow>(
      `SELECT i.*, l.line_id, l.usage_metric, l.quantity, l.unit_price_fen, l.amount_fen, l.usage_window_start, l.usage_window_end
       FROM billing_invoices i LEFT JOIN billing_invoice_lines l ON l.invoice_id = i.invoice_id
       WHERE i.tenant_id = $1 ORDER BY i.billing_period DESC, i.invoice_id, l.line_id`,
      [tenantId],
    );
    return this.groupInvoices(result.rows);
  }

  async getInvoice(invoiceId: string): Promise<InvoiceV1> {
    const result = await this.pool.query<InvoiceRow>(
      `SELECT i.*, l.line_id, l.usage_metric, l.quantity, l.unit_price_fen, l.amount_fen, l.usage_window_start, l.usage_window_end
       FROM billing_invoices i LEFT JOIN billing_invoice_lines l ON l.invoice_id = i.invoice_id
       WHERE i.invoice_id = $1 ORDER BY l.line_id`,
      [invoiceId],
    );
    return invoiceFromRows(result.rows);
  }

  async listAdjustments(invoiceId: string): Promise<readonly BillingAdjustmentV1[]> {
    const result = await this.pool.query<AdjustmentRow>(
      "SELECT * FROM billing_adjustments WHERE invoice_id = $1 ORDER BY created_at, adjustment_id",
      [invoiceId],
    );
    return result.rows.map(adjustmentFrom);
  }

  private groupInvoices(rows: readonly InvoiceRow[]): readonly InvoiceV1[] {
    const grouped = new Map<string, InvoiceRow[]>();
    for (const row of rows) {
      const existing = grouped.get(row.invoice_id);
      if (existing === undefined) grouped.set(row.invoice_id, [row]);
      else existing.push(row);
    }
    return [...grouped.values()].map(invoiceFromRows);
  }
}
