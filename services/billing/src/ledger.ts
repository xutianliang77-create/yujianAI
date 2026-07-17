import { randomUUID } from "node:crypto";
import type { BillingAdjustmentV1, InvoiceV1, PricePlanV1, UsageRecordV1 } from "@yujian/platform-contracts";

export class BillingConflictError extends Error {
  constructor(message: string) { super(message); this.name = "BillingConflictError"; }
}

const BILLING_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/u;

function validatePlan(plan: PricePlanV1): void {
  if (plan.currency !== "CNY" || !BILLING_PERIOD_PATTERN.test(plan.effectiveFrom.slice(0, 7))) throw new BillingConflictError("price plan currency or effectiveFrom is invalid");
  for (const value of [plan.tokenRequestsPerMinute, plan.participantMinutesPerMonth, plan.agentMinutesPerMonth, plan.includedRecordingMinutes]) {
    if (!Number.isFinite(value) || value < 0) throw new BillingConflictError("price plan allowance must be non-negative");
  }
  for (const price of Object.values(plan.overageUnitPrices)) {
    if (!Number.isInteger(price) || price < 0) throw new BillingConflictError("overage prices must be non-negative integer fen");
  }
}

export class UsageLedger {
  readonly records = new Map<string, UsageRecordV1>();
  readonly plans = new Map<string, PricePlanV1>();
  readonly invoices = new Map<string, InvoiceV1>();
  readonly adjustments = new Map<string, BillingAdjustmentV1>();
  private readonly dedupe = new Map<string, UsageRecordV1>();
  private readonly adjustmentDedupe = new Map<string, BillingAdjustmentV1>();

  addPlan(plan: PricePlanV1): void {
    validatePlan(plan);
    const current = this.plans.get(plan.planId);
    if (current !== undefined && current.effectiveFrom !== plan.effectiveFrom) throw new BillingConflictError("price plan is immutable");
    this.plans.set(plan.planId, plan);
  }

  listInvoices(tenantId: string): readonly InvoiceV1[] {
    if (tenantId.length === 0 || tenantId.length > 256 || tenantId.trim() !== tenantId) throw new BillingConflictError("tenantId is invalid");
    return [...this.invoices.values()].filter((invoice) => invoice.tenantId === tenantId);
  }

  getInvoice(invoiceId: string): InvoiceV1 {
    const invoice = this.invoices.get(invoiceId);
    if (invoice === undefined) throw new BillingConflictError("invoice not found");
    return invoice;
  }

  listAdjustments(invoiceId: string): readonly BillingAdjustmentV1[] {
    this.getInvoice(invoiceId);
    return [...this.adjustments.values()].filter((adjustment) => adjustment.invoiceId === invoiceId);
  }

  record(input: UsageRecordV1): UsageRecordV1 {
    if (!Number.isFinite(input.quantity) || input.quantity < 0) throw new BillingConflictError("usage quantity must be non-negative");
    if (input.dedupeKey.length === 0 || input.dedupeKey.length > 256) throw new BillingConflictError("usage dedupeKey is invalid");
    const existing = this.dedupe.get(input.dedupeKey);
    if (existing !== undefined) return existing;
    this.records.set(input.usageRecordId, input);
    this.dedupe.set(input.dedupeKey, input);
    return input;
  }

  issueInvoice(tenantId: string, billingPeriod: string, planId: string, now = new Date()): InvoiceV1 {
    if (tenantId.length === 0 || !BILLING_PERIOD_PATTERN.test(billingPeriod)) throw new BillingConflictError("billing period is invalid");
    const plan = this.plans.get(planId);
    if (plan === undefined) throw new BillingConflictError("price plan not found");
    const existing = [...this.invoices.values()].find((invoice) => invoice.tenantId === tenantId && invoice.billingPeriod === billingPeriod);
    if (existing !== undefined) return existing;
    const records = [...this.records.values()].filter((record) => record.tenantId === tenantId && record.windowStart.startsWith(billingPeriod));
    const lines = records.map((record) => {
      const unitPriceFen = plan.overageUnitPrices[record.metric] ?? 0;
      return {
        lineId: `line-${randomUUID()}`,
        usageMetric: record.metric,
        quantity: record.quantity,
        unitPriceFen,
        amountFen: Math.round(record.quantity * unitPriceFen),
        usageWindowStart: record.windowStart,
        usageWindowEnd: record.windowEnd,
      };
    });
    const invoice: InvoiceV1 = {
      invoiceId: `invoice-${randomUUID()}`,
      tenantId,
      billingPeriod,
      currency: "CNY",
      status: "draft",
      lines,
      totalFen: lines.reduce((total, line) => total + line.amountFen, 0),
      createdAt: now.toISOString(),
    };
    this.invoices.set(invoice.invoiceId, invoice);
    return invoice;
  }

  issue(invoiceId: string): InvoiceV1 {
    return this.transitionInvoice(invoiceId, "issued", ["draft"]);
  }

  markPaid(invoiceId: string): InvoiceV1 {
    return this.transitionInvoice(invoiceId, "paid", ["issued"]);
  }

  void(invoiceId: string): InvoiceV1 {
    return this.transitionInvoice(invoiceId, "void", ["draft", "issued"]);
  }

  reconcile(invoiceId: string, providerTotalFen: number): { invoiceId: string; expectedFen: number; providerTotalFen: number; deltaFen: number } {
    const invoice = this.invoices.get(invoiceId);
    if (invoice === undefined) throw new BillingConflictError("invoice not found");
    if (!Number.isInteger(providerTotalFen) || providerTotalFen < 0) throw new BillingConflictError("provider total must be a non-negative integer fen");
    return { invoiceId, expectedFen: invoice.totalFen, providerTotalFen, deltaFen: providerTotalFen - invoice.totalFen };
  }

  createAdjustment(invoiceId: string, providerTotalFen: number, reason: string, dedupeKey: string, now = new Date()): BillingAdjustmentV1 | undefined {
    const result = this.reconcile(invoiceId, providerTotalFen);
    if (result.deltaFen === 0) return undefined;
    if (reason.length === 0 || reason.length > 256 || reason.trim() !== reason) throw new BillingConflictError("adjustment reason is invalid");
    if (dedupeKey.length === 0 || dedupeKey.length > 256 || dedupeKey.trim() !== dedupeKey) throw new BillingConflictError("adjustment dedupeKey is invalid");
    const cached = this.adjustmentDedupe.get(dedupeKey);
    if (cached !== undefined) return cached;
    const adjustment: BillingAdjustmentV1 = {
      adjustmentId: `adjustment-${randomUUID()}`,
      invoiceId,
      kind: result.deltaFen > 0 ? "debit" : "credit",
      amountFen: Math.abs(result.deltaFen),
      reason,
      dedupeKey,
      createdAt: now.toISOString(),
    };
    this.adjustments.set(adjustment.adjustmentId, adjustment);
    this.adjustmentDedupe.set(dedupeKey, adjustment);
    return adjustment;
  }

  private transitionInvoice(invoiceId: string, status: InvoiceV1["status"], allowed: readonly InvoiceV1["status"][]): InvoiceV1 {
    const invoice = this.invoices.get(invoiceId);
    if (invoice === undefined) throw new BillingConflictError("invoice not found");
    if (!allowed.includes(invoice.status)) throw new BillingConflictError(`invoice cannot transition from ${invoice.status} to ${status}`);
    const updated = { ...invoice, status };
    this.invoices.set(invoiceId, updated);
    return updated;
  }
}
