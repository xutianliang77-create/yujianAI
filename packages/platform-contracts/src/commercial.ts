export interface PricePlanV1 {
  planId: string;
  currency: "CNY";
  effectiveFrom: string;
  tokenRequestsPerMinute: number;
  participantMinutesPerMonth: number;
  agentMinutesPerMonth: number;
  includedRecordingMinutes: number;
  overageUnitPrices: Readonly<Record<string, number>>;
}

export interface InvoiceLineV1 {
  lineId: string;
  usageMetric: string;
  quantity: number;
  unitPriceFen: number;
  amountFen: number;
  usageWindowStart: string;
  usageWindowEnd: string;
}

export interface InvoiceV1 {
  invoiceId: string;
  tenantId: string;
  billingPeriod: string;
  currency: "CNY";
  status: "draft" | "issued" | "void" | "paid";
  lines: readonly InvoiceLineV1[];
  totalFen: number;
  createdAt: string;
}

export interface BillingAdjustmentV1 {
  adjustmentId: string;
  invoiceId: string;
  kind: "credit" | "debit";
  amountFen: number;
  reason: string;
  dedupeKey: string;
  createdAt: string;
}

export interface DataSubjectRequestV1 {
  requestId: string;
  tenantId: string;
  subjectId: string;
  kind: "export" | "delete" | "rectify";
  status: "received" | "processing" | "completed" | "rejected";
  evidenceUri?: string;
  createdAt: string;
  completedAt?: string;
}

export interface SloPolicyV1 {
  service: string;
  availabilityTarget: number;
  p95LatencyMs: number;
  errorBudgetMinutesPerMonth: number;
  alertRoute: string;
}
