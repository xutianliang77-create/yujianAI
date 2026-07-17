# P2/P3：运行时与发布门禁计划

版本：v1.0  
日期：2026-07-17  
状态：P2-01/02/03 Beelink 部署与适配器烟测通过；P2 完整 Gate 未关闭；P3 gate-locked

P2/P3 不能用内存 adapter、健康检查或一次性演示替代。2026-07-17 已在 Beelink 的
`/home/beelink/yujianAI/data/p2` 部署独立 PostgreSQL、Redis 和 OpenBao（KMS/secret boundary），
并完成 8 条 migration、runtime adapter 构建、Redis 原子计数、OpenBao 32-byte secret round-trip
和三服务重启恢复烟测。身份 provider、API key 生命周期端到端、备份恢复、Webhook 真实投递和
多副本竞争仍未完成，不能把本次部署写成 P2 Gate 已关闭。

## P2：M2 控制面运行闭环

| ID | 任务 | 当前状态 | 退出证据 |
| --- | --- | --- | --- |
| P2-01 | 部署方 `YUJIAN_PLATFORM_RUNTIME_MODULE`，接入 PostgreSQL persistence/store snapshot | Beelink 已部署；8/8 migration、runtime build、重启后 schema 保留通过；事务 outbox/CAS 尚未做业务流验收 | 迁移锁、事务 outbox、CAS、重启恢复报告 |
| P2-02 | Redis rate limit、token quota、lease、实时 usage provider | Beelink 已部署；Redis atomic-counter runtime smoke 与重启通过；多副本竞争/Redis 故障演练未执行 | 多副本竞争不超限、Redis 重启和恢复报告 |
| P2-03 | 外部 KMS/secret resolver 与 API key rotate/revoke | OpenBao 2.4.1 已部署；受限 runtime token 读取和 32-byte secret round-trip 通过；rotate/revoke 未执行 | 明文 secret 不落库、双 key grace/revoke 传播报告 |
| P2-04 | 注册、邀请、SSO/OIDC、onboarding、持久化 RBAC | API/identity boundary partial | 新用户到第一条 Room、跨 tenant IDOR、审计报告 |
| P2-05 | Webhook destination、outbox worker、DLQ/requeue 生产接线 | SQL/publisher boundary + unit tests | 签名、重试、乱序、replay、恢复后不重复投递 |
| P2-06 | 备份恢复和数据权利执行器 | runbook/adapter boundary | PostgreSQL restore、Redis 重建、删除/导出 evidence 和 RPO/RTO |

P2 进入条件：Gate 0 已关闭，P1/M1 完整 Gate 1 已关闭，并由 `data-owner`、
`security-owner`、`platform-owner` 在真实部署报告上签字。

## 本轮 Beelink 部署证据

| 证据 | 结果 |
| --- | --- |
| Compose project | `yujian-p2`；只绑定 `127.0.0.1:15432/16379/18200` |
| PostgreSQL | `postgres:16.4@sha256:9a70e4d1c03a5066080292db2dd95ee3965d3651316e21989fa0935afb8ce8ca`；8/8 migration |
| Redis | `redis:7.2.7-alpine@sha256:1de7ca6a3f63a083036fa1d95dddbd6bdfcdf5865bb692c1e412d4bdf9cb1e37`；atomic counter smoke |
| OpenBao | `openbao/openbao:2.4.1@sha256:06a26f632cd0bdd0fd6e25034f55d68bc28b62590adc8efea3b8dacade11579a`；unsealed + KMS round-trip |
| Durable path | `/home/beelink/yujianAI/data/p2/{postgres,redis,openbao}`；runtime env/init artifact mode 0600 |
| Recovery | 三服务 `compose restart` 后 health、8 migrations、Redis adapter、KMS round-trip 均通过 |
| Isolation | 既有 `ai-phone-staging-*` 和 `livekit-qkxy-*` 容器保持 running，restart count 0 |

操作细节见 [P2 Beelink runtime README](../../infra/p2/README.md)。本证据证明部署切片和
适配器 smoke，不替代 Gate 2 的注册/邀请/SSO/RBAC、Webhook、备份恢复和多副本验收。

## P3：M3-M7 顺序关闭

1. **M3/Gate 3**：真实 TURN/TLS、运营商网络矩阵、质量指标、24/72 小时稳定性、故障注入。
2. **M4/Gate 4**：Beelink RTX 5090 worker、artifact digest/signature/SBOM、provider、
   dispatch、canary/rollback、取消和成本观测。
3. **M5/Gate 5**：运营商/SBC、SIP、Ingress/Egress、对象存储留存删除和合规签字。
4. **M6/Gate 6/8/9**：私有化离线包、Operator、升级/回滚、备份恢复、HA 和 RPO/RTO。
5. **M7/Gate 6/7/10**：账单对账、安全/渗透/供应链审计、适用性结论、RC/GA 签字。

任何阶段发现外部依赖缺失，都保持 `UPSTREAM_UNAVAILABLE` 或 fail-closed，不伪造成功。
