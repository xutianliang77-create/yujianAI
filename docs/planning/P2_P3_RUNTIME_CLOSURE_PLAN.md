# P2/P3：运行时与发布门禁计划

版本：v1.0  
日期：2026-07-18
状态：P2-01/02/03 Beelink 生产验收通过；P2-04/05/06 implementation-ready、最终验收被 Beelink 重启中断；P2 完整 Gate 未关闭；P3 gate-locked

P2/P3 不能用内存 adapter、健康检查或一次性演示替代。2026-07-17 已在 Beelink 的
`/home/beelink/yujianAI/data/p2` 部署独立 PostgreSQL、Redis 和 OpenBao（KMS/secret boundary），
并完成 P2-01/02/03 的 8 条 migration、事务 outbox/CAS、Redis 竞争、OpenBao
三节点 HTTPS/Raft 和 API key 生命周期验收。P2-04/05/06 实现及第 9–10 条 migration
已在仓库就绪；最终双机验收运行 `p2-closure-20260717104540-c0c4ba0e` 期间 Beelink
重启后死机，未产生完整报告，因此不能把 P2 Gate 写成已关闭。

## P2：M2 控制面运行闭环

| ID | 任务 | 当前状态 | 退出证据 |
| --- | --- | --- | --- |
| P2-01 | 部署方 `YUJIAN_PLATFORM_RUNTIME_MODULE`，接入 PostgreSQL persistence/store snapshot | **production-accepted**：事务内 usage+audit+outbox 可见；stale CAS 被拒绝；production platform-api 启动、重启恢复和 8/8 migration 通过 | 真实 webhook 投递/DLQ、备份恢复仍属 P2-05/06 |
| P2-02 | Redis rate limit、token quota、lease、实时 usage provider | **production-accepted**：两个 Redis client 100 次竞争严格 20 次放行；30 次 token quota 仅 3 个并发；容器删除重建后恢复 | 跨主机 Redis/Sentinel/Cluster 故障域仍未验收 |
| P2-03 | 外部 KMS/secret resolver 与 API key rotate/revoke | **production-accepted**：OpenBao 三节点 HTTPS/Raft、leader 停止后读取恢复；API key rotate grace/revoke 传播通过；snapshot/报告无一次性 secret | 当前为单主机 quorum；auto-unseal、跨主机 HA 和生产 KMS 合规签字仍缺 |
| P2-04 | 注册、邀请、SSO/OIDC、onboarding、持久化 RBAC | **implementation-ready / acceptance-interrupted**：新增 OIDC 自助 onboarding、邀请接受、PostgreSQL member scope resolver、持久角色优先于 token role claim、跨 tenant 拒绝与双机 RTC probe；本地 18/18 platform-api 测试通过；最终本机客户端 join 被 Beelink 死机中断 | 新用户到第一条 Room、跨 tenant IDOR、审计报告的单次完整脱敏报告 |
| P2-05 | Webhook destination、outbox worker、DLQ/requeue 生产接线 | **implementation-ready / partial-live-observed**：新增 event+destination delivery ledger、claim lease、一次一投的 DB attempt、HMAC/KMS、DLQ/requeue 和确定性 restart fault injection；Beelink 已实际走到 HMAC/retry/DLQ/requeue，未形成最终报告 | 签名、重试、乱序、replay、恢复后不重复投递的完整报告 |
| P2-06 | 备份恢复和数据权利执行器 | **implementation-ready / not production-accepted**：PostgreSQL executor/worker、0600 prepared→committed evidence、持久 receipt、请求级事务锁、processing heartbeat/stale 回收、isolated `pg_dump` restore 和 Redis 从 PG 真值重建脚本已完成；本地 3/3 data-rights 测试通过；死机前未执行到真实备份恢复 | PostgreSQL restore、Redis 重建、删除/导出 evidence 和 RPO/RTO |

P2 进入条件：Gate 0 已关闭，P1/M1 完整 Gate 1 已关闭，并由 `data-owner`、
`security-owner`、`platform-owner` 在真实部署报告上签字。

## 本轮 Beelink 部署证据

| 证据 | 结果 |
| --- | --- |
| Compose project | `yujian-p2`；只绑定 `127.0.0.1:15432/16379/18200-18202` |
| PostgreSQL | `postgres:16.4@sha256:9a70e4d1c03a5066080292db2dd95ee3965d3651316e21989fa0935afb8ce8ca`；8/8 migration |
| Redis | `redis:7.2.7-alpine@sha256:1de7ca6a3f63a083036fa1d95dddbd6bdfcdf5865bb692c1e412d4bdf9cb1e37`；atomic counter smoke |
| OpenBao | `openbao/openbao:2.4.1@sha256:06a26f632cd0bdd0fd6e25034f55d68bc28b62590adc8efea3b8dacade11579a`；3 voters、HTTPS health、leader stop/readback 通过 |
| Durable path | `/home/beelink/yujianAI/data/p2/{postgres,redis,openbao-{a,b,c},openbao-tls}`；runtime env/init/report mode 0600 |
| Recovery | production-api restart、Redis rm/up rebuild、OpenBao leader stop/start+unseal、8 migrations、API key metadata 和 KMS readback 均通过；报告 `data/p2/reports/production-acceptance.json` |
| Isolation | 既有 `ai-phone-staging-*` 和 `livekit-qkxy-*` 容器保持 running，restart count 0 |

操作细节见 [P2 Beelink runtime README](../../infra/p2/README.md)。本证据证明部署切片和
适配器和生产验收，但不替代 Gate 2 的注册/邀请/SSO/RBAC、Webhook、备份恢复、跨主机 HA
和 owner 签字。

## P3：M3-M7 顺序关闭

1. **M3/Gate 3**：真实 TURN/TLS、运营商网络矩阵、质量指标、24/72 小时稳定性、故障注入。
2. **M4/Gate 4**：Beelink RTX 5090 worker、artifact digest/signature/SBOM、provider、
   dispatch、canary/rollback、取消和成本观测。
3. **M5/Gate 5**：运营商/SBC、SIP、Ingress/Egress、对象存储留存删除和合规签字。
4. **M6/Gate 6/8/9**：私有化离线包、Operator、升级/回滚、备份恢复、HA 和 RPO/RTO。
5. **M7/Gate 6/7/10**：账单对账、安全/渗透/供应链审计、适用性结论、RC/GA 签字。

任何阶段发现外部依赖缺失，都保持 `UPSTREAM_UNAVAILABLE` 或 fail-closed，不伪造成功。
