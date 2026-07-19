export type PreviewTrialStatusV1 = "planned" | "onboarding" | "active" | "paused" | "closing" | "closed";
export type PreviewCoreFlowV1 = "token" | "join" | "publish-audio" | "subscribe-audio" | "data" | "rpc" | "reconnect";
export type PreviewFlowStatusV1 = "pending" | "passed" | "failed";
export type PreviewDefectSeverityV1 = "p0" | "p1" | "p2" | "p3";
export type PreviewDefectStatusV1 = "open" | "in-progress" | "fixed" | "closed";

export interface PreviewDefectV1 {
  defectId: string;
  severity: PreviewDefectSeverityV1;
  category: "availability" | "isolation" | "security" | "quality" | "compatibility";
  status: PreviewDefectStatusV1;
  fixVersion?: string;
  regressionEvidenceSha256?: string;
  updatedAt: string;
}

export interface PreviewFeedbackV1 {
  feedbackId: string;
  category: "usability" | "quality" | "documentation" | "compatibility";
  priority: "p1" | "p2" | "p3";
  status: "open" | "accepted" | "declined" | "delivered";
  updatedAt: string;
}

export interface PreviewTrialStateV1 {
  trialId: string;
  partnerId: string;
  tenantId: string;
  projectId: string;
  environmentId: string;
  dataClass: "synthetic" | "authorized";
  status: PreviewTrialStatusV1;
  coreFlows: Readonly<Record<PreviewCoreFlowV1, PreviewFlowStatusV1>>;
  defects: readonly PreviewDefectV1[];
  feedback: readonly PreviewFeedbackV1[];
  apiKeyRevoked: boolean;
  resourcesDeleted: boolean;
  auditExportSha256?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

type EventBase = { expectedVersion: number; occurredAt: string };
export type PreviewTrialEventV1 = EventBase & (
  | { type: "onboarding.started" }
  | { type: "trial.activated" }
  | { type: "trial.paused" }
  | { type: "trial.resumed" }
  | { type: "trial.closing" }
  | { type: "trial.closed" }
  | { type: "core-flow.recorded"; flow: PreviewCoreFlowV1; status: Exclude<PreviewFlowStatusV1, "pending"> }
  | { type: "defect.opened"; defectId: string; severity: PreviewDefectSeverityV1; category: PreviewDefectV1["category"] }
  | { type: "defect.updated"; defectId: string; status: Exclude<PreviewDefectStatusV1, "open">; fixVersion?: string; regressionEvidenceSha256?: string }
  | { type: "feedback.recorded"; feedbackId: string; category: PreviewFeedbackV1["category"]; priority: PreviewFeedbackV1["priority"] }
  | { type: "feedback.updated"; feedbackId: string; status: Exclude<PreviewFeedbackV1["status"], "open"> }
  | { type: "cleanup.recorded"; apiKeyRevoked: true; resourcesDeleted: true; auditExportSha256: string }
);

export class PreviewTrialTransitionError extends Error {
  constructor(message: string) { super(message); this.name = "PreviewTrialTransitionError"; }
}

const RESOURCE_ID = /^[a-z][a-z0-9-]{2,63}$/u;
const RECORD_ID = /^[a-z][a-z0-9-]{2,127}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const FLOWS: readonly PreviewCoreFlowV1[] = ["token", "join", "publish-audio", "subscribe-audio", "data", "rpc", "reconnect"];
const DEFECT_SEVERITIES = new Set<PreviewDefectSeverityV1>(["p0", "p1", "p2", "p3"]);
const DEFECT_CATEGORIES = new Set<PreviewDefectV1["category"]>(["availability", "isolation", "security", "quality", "compatibility"]);
const FEEDBACK_CATEGORIES = new Set<PreviewFeedbackV1["category"]>(["usability", "quality", "documentation", "compatibility"]);
const FEEDBACK_PRIORITIES = new Set<PreviewFeedbackV1["priority"]>(["p1", "p2", "p3"]);

function time(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new PreviewTrialTransitionError(`${field} must be an ISO timestamp`);
  return new Date(parsed).toISOString();
}

function ensureRecordId(value: string, field: string): void {
  if (!RECORD_ID.test(value)) throw new PreviewTrialTransitionError(`${field} is invalid`);
}

export function createPreviewTrial(input: {
  trialId: string; partnerId: string; tenantId: string; projectId: string; environmentId: string;
  dataClass: PreviewTrialStateV1["dataClass"]; createdAt: string;
}): PreviewTrialStateV1 {
  ensureRecordId(input.trialId, "trialId");
  if (!/^partner-[a-z0-9-]{3,64}$/u.test(input.partnerId)) throw new PreviewTrialTransitionError("partnerId must be pseudonymous");
  for (const [field, value] of Object.entries({ tenantId: input.tenantId, projectId: input.projectId, environmentId: input.environmentId })) if (!RESOURCE_ID.test(value)) throw new PreviewTrialTransitionError(`${field} is invalid`);
  if (input.dataClass !== "synthetic" && input.dataClass !== "authorized") throw new PreviewTrialTransitionError("dataClass is invalid");
  const createdAt = time(input.createdAt, "createdAt");
  return {
    trialId: input.trialId, partnerId: input.partnerId, tenantId: input.tenantId,
    projectId: input.projectId, environmentId: input.environmentId, dataClass: input.dataClass,
    status: "planned", coreFlows: Object.fromEntries(FLOWS.map((flow) => [flow, "pending"])) as Record<PreviewCoreFlowV1, PreviewFlowStatusV1>,
    defects: [], feedback: [], apiKeyRevoked: false, resourcesDeleted: false,
    version: 1, createdAt, updatedAt: createdAt,
  };
}

function blockingDefect(defect: PreviewDefectV1): boolean {
  return (defect.severity === "p0" || defect.severity === "p1") && defect.status !== "closed";
}

function transitionStatus(current: PreviewTrialStatusV1, event: PreviewTrialEventV1["type"]): PreviewTrialStatusV1 {
  const transitions: Partial<Record<PreviewTrialEventV1["type"], readonly PreviewTrialStatusV1[]>> = {
    "onboarding.started": ["planned"], "trial.activated": ["onboarding"], "trial.paused": ["active"],
    "trial.resumed": ["paused"], "trial.closing": ["active", "paused"], "trial.closed": ["closing"],
  };
  const allowed = transitions[event];
  if (allowed !== undefined && !allowed.includes(current)) throw new PreviewTrialTransitionError(`${event} is not allowed from ${current}`);
  if (event === "onboarding.started") return "onboarding";
  if (event === "trial.activated" || event === "trial.resumed") return "active";
  if (event === "trial.paused") return "paused";
  if (event === "trial.closing") return "closing";
  if (event === "trial.closed") return "closed";
  return current;
}

export function applyPreviewTrialEvent(state: PreviewTrialStateV1, event: PreviewTrialEventV1): PreviewTrialStateV1 {
  if (state.status === "closed") throw new PreviewTrialTransitionError("closed preview trial is immutable");
  if (event.expectedVersion !== state.version) throw new PreviewTrialTransitionError("preview trial version conflict");
  const occurredAt = time(event.occurredAt, "occurredAt");
  if (Date.parse(occurredAt) < Date.parse(state.updatedAt)) throw new PreviewTrialTransitionError("event time must be monotonic");
  let next: PreviewTrialStateV1 = { ...state, version: state.version + 1, updatedAt: occurredAt };
  if (event.type.startsWith("trial.") || event.type === "onboarding.started") next = { ...next, status: transitionStatus(state.status, event.type) };
  if (event.type === "trial.resumed" && state.defects.some(blockingDefect)) throw new PreviewTrialTransitionError("blocking defect prevents trial resume");
  if (event.type === "core-flow.recorded") {
    if ((state.status !== "active" && state.status !== "paused") || !FLOWS.includes(event.flow) || (event.status !== "passed" && event.status !== "failed")) throw new PreviewTrialTransitionError("core flow event is invalid for current trial");
    next = { ...next, coreFlows: { ...state.coreFlows, [event.flow]: event.status } };
  }
  if (event.type === "defect.opened") {
    if ((state.status !== "active" && state.status !== "paused") || !DEFECT_SEVERITIES.has(event.severity) || !DEFECT_CATEGORIES.has(event.category)) throw new PreviewTrialTransitionError("defect event is invalid for current trial");
    ensureRecordId(event.defectId, "defectId");
    if (state.defects.some((defect) => defect.defectId === event.defectId)) throw new PreviewTrialTransitionError("defect already exists");
    const defect: PreviewDefectV1 = { defectId: event.defectId, severity: event.severity, category: event.category, status: "open", updatedAt: occurredAt };
    next = { ...next, defects: [...state.defects, defect], ...((event.severity === "p0" || event.severity === "p1") && state.status === "active" ? { status: "paused" as const } : {}) };
  }
  if (event.type === "defect.updated") {
    const existing = state.defects.find((defect) => defect.defectId === event.defectId);
    if (existing === undefined) throw new PreviewTrialTransitionError("defect not found");
    const allowed: Readonly<Record<PreviewDefectStatusV1, readonly PreviewDefectStatusV1[]>> = { open: ["in-progress", "fixed"], "in-progress": ["fixed"], fixed: ["closed"], closed: [] };
    if (!allowed[existing.status].includes(event.status)) throw new PreviewTrialTransitionError("defect status transition is invalid");
    const fixVersion = event.fixVersion ?? existing.fixVersion;
    const regressionEvidenceSha256 = event.regressionEvidenceSha256 ?? existing.regressionEvidenceSha256;
    if ((event.status === "fixed" || event.status === "closed") && (typeof fixVersion !== "string" || fixVersion.length === 0 || !DIGEST.test(regressionEvidenceSha256 ?? ""))) throw new PreviewTrialTransitionError("fixed defect requires version and regression evidence");
    next = { ...next, defects: state.defects.map((defect) => defect.defectId === event.defectId ? { ...defect, status: event.status, ...(fixVersion === undefined ? {} : { fixVersion }), ...(regressionEvidenceSha256 === undefined ? {} : { regressionEvidenceSha256 }), updatedAt: occurredAt } : defect) };
  }
  if (event.type === "feedback.recorded") {
    if ((state.status !== "active" && state.status !== "paused") || !FEEDBACK_CATEGORIES.has(event.category) || !FEEDBACK_PRIORITIES.has(event.priority)) throw new PreviewTrialTransitionError("feedback event is invalid for current trial");
    ensureRecordId(event.feedbackId, "feedbackId");
    if (state.feedback.some((feedback) => feedback.feedbackId === event.feedbackId)) throw new PreviewTrialTransitionError("feedback already exists");
    next = { ...next, feedback: [...state.feedback, { feedbackId: event.feedbackId, category: event.category, priority: event.priority, status: "open", updatedAt: occurredAt }] };
  }
  if (event.type === "feedback.updated") {
    const existing = state.feedback.find((feedback) => feedback.feedbackId === event.feedbackId);
    if (existing === undefined) throw new PreviewTrialTransitionError("feedback not found");
    const allowed: Readonly<Record<PreviewFeedbackV1["status"], readonly PreviewFeedbackV1["status"][]>> = { open: ["accepted", "declined"], accepted: ["delivered"], declined: [], delivered: [] };
    if (!allowed[existing.status].includes(event.status)) throw new PreviewTrialTransitionError("feedback status transition is invalid");
    next = { ...next, feedback: state.feedback.map((feedback) => feedback.feedbackId === event.feedbackId ? { ...feedback, status: event.status, updatedAt: occurredAt } : feedback) };
  }
  if (event.type === "cleanup.recorded") {
    if (state.status !== "closing" || !DIGEST.test(event.auditExportSha256)) throw new PreviewTrialTransitionError("cleanup requires closing state and audit digest");
    next = { ...next, apiKeyRevoked: true, resourcesDeleted: true, auditExportSha256: event.auditExportSha256 };
  }
  if (event.type === "trial.closed") {
    if (state.defects.some(blockingDefect) || Object.values(state.coreFlows).some((status) => status !== "passed") || !state.apiKeyRevoked || !state.resourcesDeleted || !DIGEST.test(state.auditExportSha256 ?? "")) throw new PreviewTrialTransitionError("trial close conditions are incomplete");
  }
  return next;
}
