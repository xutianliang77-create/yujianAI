# M4 Agent Runtime 实现记录

状态：`implemented-not-run`，Gate 4 未通过。

## 已实现

- 制品：异步 HTTPS verifier、exact OCI digest 绑定、SBOM/signature/policy/receipt digest 回显校验，
  verifier 短期凭据不落库。
- 发布：canary 未健康时不自动 active，`AgentDeploymentReconciler` 驱动 exact image 并在
  terminal failure 后回滚。
- 调度：Redis Cluster 同 slot Lua 原子限制 environment/deployment 队列，deadline lease、
  重放幂等、启动重建与失败关闭。
- Provider：逐请求 workload identity 凭据换取、严格 HTTPS/headers/response 限制、
  OpenAI-compatible chat/usage 映射、deadline/circuit/failover。
- 安全：显式 projected ServiceAccount token，默认 token automount 关闭，Agent Control/worker
  分离 egress allowlist。
- 账务：价格版本固定的 micros 归因、PostgreSQL 数值明细、Prometheus 低基数指标、
  alert 和 Grafana dashboard。
- Tool：高风险工具必须经 `ToolApprovalVerifier` 校验 receipt，幂等 key 哈希，结果
  由 KMS codec 加密后 insert-once，audit append-only。
- 取消：heartbeat 下发 cancel IDs，Node 传播 `AbortSignal`，Python 只取消当前 handler task。

## 未执行

按用户要求，本轮未执行 TypeScript/Python 测试、build/lint、migration 013、Helm 渲染、
Redis 竞争、OCI/KMS/provider 调用、Room 任务、canary/回滚、仪表盘加载或 Beelink 5090 运行。

## 验收不可替代项

源码、示例和状态 JSON 都不能替代实际 Gate 4 证据。后续验收必须绑定不可变 commit、
image digest、SBOM/signature receipt、provider 配置摘要、工作负载和时间窗，并证明无凭据/
正文落库、无队列/费用泄漏、回滚后普通 RTC 不受影响。
