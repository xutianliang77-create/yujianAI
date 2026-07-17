# P2/P3：运行时与发布门禁计划

版本：v1.0  
日期：2026-07-17  
状态：P2 blocked-by-deployment；P3 gate-locked

P2/P3 不能用内存 adapter、健康检查或一次性演示替代。当前仓库已经提供 runtime module
接口和 PostgreSQL migration 边界，但没有部署方真实 PostgreSQL/Redis/KMS、身份 provider、
对象存储和 Agent provider 凭据；因此本文件只记录可执行闭环，不把规划写成已完成。

## P2：M2 控制面运行闭环

| ID | 任务 | 当前状态 | 退出证据 |
| --- | --- | --- | --- |
| P2-01 | 部署方 `YUJIAN_PLATFORM_RUNTIME_MODULE`，接入 PostgreSQL persistence/store snapshot | interface + migrations exists | 迁移锁、事务 outbox、CAS、重启恢复报告 |
| P2-02 | Redis rate limit、token quota、lease、实时 usage provider | adapters exists | 多副本竞争不超限、Redis 重启和恢复报告 |
| P2-03 | 外部 KMS/secret resolver 与 API key rotate/revoke | boundary exists | 明文 secret 不落库、双 key grace/revoke 传播报告 |
| P2-04 | 注册、邀请、SSO/OIDC、onboarding、持久化 RBAC | API/identity boundary partial | 新用户到第一条 Room、跨 tenant IDOR、审计报告 |
| P2-05 | Webhook destination、outbox worker、DLQ/requeue 生产接线 | SQL/publisher boundary + unit tests | 签名、重试、乱序、replay、恢复后不重复投递 |
| P2-06 | 备份恢复和数据权利执行器 | runbook/adapter boundary | PostgreSQL restore、Redis 重建、删除/导出 evidence 和 RPO/RTO |

P2 进入条件：Gate 0 已关闭，P1/M1 完整 Gate 1 已关闭，并由 `data-owner`、
`security-owner`、`platform-owner` 在真实部署报告上签字。

## P3：M3-M7 顺序关闭

1. **M3/Gate 3**：真实 TURN/TLS、运营商网络矩阵、质量指标、24/72 小时稳定性、故障注入。
2. **M4/Gate 4**：Beelink RTX 5090 worker、artifact digest/signature/SBOM、provider、
   dispatch、canary/rollback、取消和成本观测。
3. **M5/Gate 5**：运营商/SBC、SIP、Ingress/Egress、对象存储留存删除和合规签字。
4. **M6/Gate 6/8/9**：私有化离线包、Operator、升级/回滚、备份恢复、HA 和 RPO/RTO。
5. **M7/Gate 6/7/10**：账单对账、安全/渗透/供应链审计、适用性结论、RC/GA 签字。

任何阶段发现外部依赖缺失，都保持 `UPSTREAM_UNAVAILABLE` 或 fail-closed，不伪造成功。
