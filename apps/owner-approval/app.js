const state = { tasks: [], owner: "", selected: undefined, busy: false };
const byId = (id) => document.getElementById(id);
const decisionLabels = {
  approve: "批准",
  reject: "驳回",
  "approve-with-conditions": "有条件批准",
  "time-bound-exception": "限期例外",
};
const roleLabels = {
  "security-owner": "SECURITY OWNER · aaa",
  "release-owner": "RELEASE OWNER · bbb",
  "legal-owner": "LEGAL OWNER · ccc",
  "compliance-owner": "COMPLIANCE OWNER · ddd",
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function shortHash(value) {
  return value.length > 24 ? `${value.slice(0, 17)}…${value.slice(-8)}` : value;
}

function showToast(message, failed = false) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.className = `toast${failed ? " failed" : ""}`;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 5000);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { accept: "application/json", ...(options.body === undefined ? {} : { "content-type": "application/json" }) },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? `请求失败 (${response.status})`);
  return body.data;
}

function renderTasks() {
  const root = byId("tasks");
  root.replaceChildren();
  const visible = state.tasks.filter((task) => state.owner === "" || task.personalOwner === state.owner);
  if (visible.length === 0) {
    root.append(element("p", "list-empty", "当前筛选条件下没有审批任务。"));
    return;
  }
  for (const task of visible) {
    const button = element("button", `task-card${state.selected?.decisionId === task.decisionId ? " selected" : ""}`);
    button.type = "button";
    button.addEventListener("click", () => selectTask(task.decisionId));
    const top = element("div", "task-top");
    top.append(element("span", "owner-badge", task.personalOwner.toUpperCase()));
    const status = element("span", `task-status ${task.status === "signed-decision-recorded" ? "signed" : "pending"}`,
      task.status === "signed-decision-recorded" ? "已签名 · 可追加替代" : "待决定");
    top.append(status);
    button.append(top, element("h3", "", task.title), element("p", "", task.summary));
    const foot = element("div", "task-foot");
    foot.append(element("span", "", `${task.evidence.length} 项证据`), element("span", "arrow", "→"));
    button.append(foot);
    root.append(button);
  }
}

function renderFacts(task) {
  const root = byId("facts");
  root.replaceChildren();
  for (const [key, value] of Object.entries(task.facts)) {
    const group = element("div", "fact");
    group.append(element("dt", "", key), element("dd", "", value === null ? "未填写" : String(value)));
    root.append(group);
  }
}

function renderEvidence(task) {
  const root = byId("evidence");
  root.replaceChildren();
  for (const item of task.evidence) {
    const row = element("li", "");
    row.append(element("span", "evidence-path", item.path), element("code", "", shortHash(item.sha256)));
    root.append(row);
  }
}

function renderDecisionOptions(task) {
  const select = byId("decision");
  select.replaceChildren();
  select.append(new Option("请选择决定", ""));
  for (const decision of task.allowedDecisions) select.append(new Option(decisionLabels[decision] ?? decision, decision));
  updateConditionalFields();
}

function renderReceipt(task) {
  const receipt = byId("receipt");
  if (task.receipt === undefined) {
    receipt.hidden = true;
    receipt.replaceChildren();
    return;
  }
  const effectiveLabel = task.currentSequence === 0 ? "原始决定" : `替代决定 #${task.currentSequence}`;
  receipt.replaceChildren(
    element("p", "receipt-kicker", "CURRENT EFFECTIVE DECISION"),
    element("h3", "", `${decisionLabels[task.receipt.decision] ?? task.receipt.decision} · ${effectiveLabel}`),
    element("p", "", `签名 key：${task.receipt.keyUri} · v${task.receipt.keyVersion}`),
    element("code", "", shortHash(task.currentReceiptSha256)),
    element("p", "receipt-warning", "Gate 未自动更新，生产发布仍未授权。"),
  );
  const historyTitle = element("h4", "history-title", `不可变决定链 · ${task.history.length} 份`);
  const history = element("ol", "decision-history");
  for (const entry of task.history) {
    const item = element("li", entry.sequence === task.currentSequence ? "current" : "");
    const heading = element("div", "history-heading");
    heading.append(
      element("strong", "", entry.sequence === 0 ? "原始决定" : `替代 #${entry.sequence}`),
      element("span", "", decisionLabels[entry.decision] ?? entry.decision),
    );
    item.append(
      heading,
      element("code", "", shortHash(entry.receiptSha256)),
      element("p", "", new Date(entry.recordedAt).toLocaleString("zh-CN")),
    );
    if (entry.supersessionReason) item.append(element("p", "history-reason", entry.supersessionReason));
    history.append(item);
  }
  receipt.append(historyTitle, history);
  receipt.hidden = false;
}

function configureDecisionForm(task) {
  const superseding = task.status === "signed-decision-recorded";
  byId("decision-form").hidden = false;
  byId("form-title").textContent = superseding ? "本人替代决定" : "本人决定";
  byId("supersession-context").hidden = !superseding;
  byId("supersession-reason-label").hidden = !superseding;
  byId("supersession-reason").required = superseding;
  byId("confirm-original-label").hidden = !superseding;
  byId("confirm-original").required = superseding;
  byId("current-receipt-hash").textContent = superseding ? shortHash(task.currentReceiptSha256) : "";
  byId("submit").textContent = superseding ? "签名并追加替代决定" : "签名并提交决定";
  byId("form-note").textContent = superseding
    ? "服务端将校验当前 receipt 哈希；旧页面或并发提交不会覆盖任何记录。"
    : "提交成功后 token 立即撤销，原始决定不可覆盖。";
}

function selectTask(decisionId) {
  const task = state.tasks.find((candidate) => candidate.decisionId === decisionId);
  if (task === undefined) return;
  state.selected = task;
  byId("detail").classList.remove("empty");
  byId("empty-state").hidden = true;
  byId("task-detail").hidden = false;
  byId("detail-role").textContent = roleLabels[task.role] ?? task.role;
  byId("detail-title").textContent = task.title;
  byId("detail-summary").textContent = task.summary;
  byId("detail-status").textContent = task.status === "signed-decision-recorded" ? "签名已验证" : "等待本人决定";
  byId("detail-status").dataset.state = task.status === "signed-decision-recorded" ? "signed" : "pending";
  renderFacts(task);
  renderEvidence(task);
  renderDecisionOptions(task);
  renderReceipt(task);
  configureDecisionForm(task);
  renderTasks();
  if (window.innerWidth < 980) byId("detail").scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateConditionalFields() {
  const value = byId("decision").value;
  const conditions = value === "approve-with-conditions" || value === "time-bound-exception";
  byId("conditions-label").hidden = !conditions;
  byId("conditions").required = conditions;
  byId("expires-label").hidden = value !== "time-bound-exception";
  byId("expires-at").required = value === "time-bound-exception";
}

async function loadTasks(keepSelection = true) {
  byId("service-state").textContent = "正在刷新审批状态";
  const data = await api("/api/v1/owner-approvals");
  state.tasks = data.tasks;
  byId("service-state").textContent = `服务已连接 · ${state.tasks.filter((task) => task.status !== "signed-decision-recorded").length} 项待决定`;
  renderTasks();
  if (keepSelection && state.selected !== undefined) selectTask(state.selected.decisionId);
}

async function submitDecision(event) {
  event.preventDefault();
  if (state.busy || state.selected === undefined) return;
  const form = byId("decision-form");
  if (!form.reportValidity()) return;
  state.busy = true;
  byId("submit").disabled = true;
  byId("submit").textContent = "正在验签并撤销凭据…";
  const tokenInput = byId("wrapped-token");
  const superseding = state.selected.status === "signed-decision-recorded";
  try {
    const decision = byId("decision").value;
    const expires = byId("expires-at").value;
    await api(`/api/v1/owner-approvals/${encodeURIComponent(state.selected.decisionId)}:${superseding ? "supersede" : "decide"}`, {
      method: "POST",
      body: JSON.stringify({
        revision: state.selected.revision,
        ...(superseding ? {
          expectedReceiptSha256: state.selected.currentReceiptSha256,
          supersessionReason: byId("supersession-reason").value,
          confirmOriginalPreserved: byId("confirm-original").checked,
        } : {}),
        decision,
        reason: byId("reason").value,
        ...(byId("conditions-label").hidden ? {} : { conditions: byId("conditions").value }),
        ...(expires === "" ? {} : { expiresAt: new Date(expires).toISOString() }),
        wrappedToken: tokenInput.value,
        confirmEvidenceReviewed: byId("confirm").checked,
      }),
    });
    tokenInput.value = "";
    form.reset();
    showToast(superseding ? "替代决定已追加，原证据保持不变" : "决定已签名、验签并安全归档");
    await loadTasks(true);
  } catch (error) {
    tokenInput.value = "";
    showToast(error instanceof Error ? error.message : "提交失败", true);
  } finally {
    state.busy = false;
    byId("submit").disabled = false;
    byId("submit").textContent = superseding ? "签名并追加替代决定" : "签名并提交决定";
    updateConditionalFields();
  }
}

for (const button of document.querySelectorAll("[data-owner]")) {
  button.addEventListener("click", () => {
    state.owner = button.dataset.owner ?? "";
    for (const tab of document.querySelectorAll("[data-owner]")) tab.classList.toggle("active", tab === button);
    renderTasks();
  });
}
byId("decision").addEventListener("change", updateConditionalFields);
byId("decision-form").addEventListener("submit", submitDecision);
byId("refresh").addEventListener("click", () => loadTasks(true).catch((error) => showToast(error.message, true)));

loadTasks(false).catch((error) => {
  byId("service-state").textContent = "审批服务不可用";
  showToast(error instanceof Error ? error.message : "无法加载审批任务", true);
});
