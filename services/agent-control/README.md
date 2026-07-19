# `@yujian/agent-control`

Agent Control 提供 worker 注册、heartbeat、dispatch start/complete/fail 的内部 API。
服务默认监听 loopback；部署到独立 Pod 时必须配置 `AGENT_CONTROL_TLS_CERT_FILE` 和
`AGENT_CONTROL_TLS_KEY_FILE`，worker 使用 `WorkerControlClient` 的 HTTPS 入口并通过
`x-yujian-worker-token` 发送短期内部 credential。

`GET /healthz` 不需要 credential，仅用于 Kubernetes readiness/liveness。worker 生命周期接口
使用 `x-yujian-worker-token`；artifact、deployment、dispatch、rule 等控制面管理接口使用
独立的 `x-yujian-agent-admin-token`。未配置 `YUJIAN_AGENT_ADMIN_CREDENTIAL` 时，开发环境会
显式回退到内部 credential；生产 Helm 必须注入独立的 admin secret。响应不回显 secret、模型
参数或媒体正文。

控制面内部 API 还提供 artifact 注册、deployment/canary/rollback/reconcile、dispatch 创建和
cancel，以及按 trigger 创建 rule 和触发 dispatch。worker 可调用
`POST /internal/v1/agent-workers/claim` 原子领取同 environment 的最早截止任务；过期 queued
任务会进入 failed，不会被交给 worker。artifact 必须带 `sha256:` digest 与签名引用，
deployment/dispatch/rule 必须绑定同一 `environmentId`，避免跨租户 worker 接单。

Node worker 的 `LiveKitAgentRoomConnector` 使用官方 `@livekit/rtc-node` 建立 Room 会话；它不
保存或签发 token，也不绕过 Agent Control 的 dispatch ownership。连接参数只在 worker 内存中
存在，断线或 drain 会清理本地 session。

`AgentDispatchRunner` 将 claim、handler、complete/fail 串成 worker 运行时闭环；handler 必须
响应 `AbortSignal`，并由 deployment 自己注入短期 Room token provider。heartbeat 响应包含
`cancelDispatchIds`，Node worker 会 abort 当前 handler，Python worker 只 cancel 当前 handler task，
不会停止整个 poll loop。

`ToolPolicyEngine` 支持部署侧 `ToolResultStore`、`ToolAuditSink` 和
`ToolApprovalVerifier`；需显式审批的工具必须有可校验 receipt，布尔值不再单独构成授权。
`PostgresToolResultStore` 只向 `013_agent_runtime.sql` 写入部署侧 codec 生成的密文、KMS key ref
和摘要；subject/tool/idempotency 先哈希，原始幂等值不进数据库。

Agent Control 可通过 `YUJIAN_AGENT_CONTROL_PERSISTENCE_MODULE` 加载部署侧 ESM module。该
module 导出 `createAgentControlPersistence()`，返回带 `load/save` 的 `AgentControlPersistence`，
生产实现应使用 `PostgresAgentControlPersistence` 和 `003_agent_control.sql` 的 snapshot 表；
保存使用 version CAS，stale worker/control replica 不得静默覆盖新状态。

生产启动还必须配置 `YUJIAN_AGENT_ARTIFACT_VERIFIER_MODULE`。该 ESM module 导出
`createAgentArtifactVerifier()`，对 image、sha256 digest、签名引用和可选 SBOM URI 做部署侧
OCI/签名服务校验。verifier 现在是异步边界，必须回显 exact image/digest/
signature/SBOM 并返回 policy/receipt digest；回执摘要固化到 artifact snapshot。
`HttpsAgentArtifactVerifier` 提供实际 HTTPS 签名服务 adapter，且只通过短期 credential lease 访问。

同一 production runtime module 还必须导出 `createAgentDispatchQuota()`。
`RedisAgentDispatchQuota` 在同一 environment hash slot 内原子限制 environment/deployment 活动队列，
lease 以 dispatch deadline 过期，启动时从 PostgreSQL snapshot 重建；终态释放失败只会短期
过度计数，不会超发。`AgentDeploymentReconciler` 把 exact image digest/验证 receipt 交给部署
runtime，canary 健康后才推进到 100%，terminal failure 先持久化再回滚。

本轮未运行 build/test、Redis/PostgreSQL migration、OCI verifier 或 Beelink 5090 worker，不构成 Gate 4 证据。
