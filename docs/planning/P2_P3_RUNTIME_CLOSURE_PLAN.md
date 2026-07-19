# P2/P3：运行时与发布门禁计划

版本：v1.1
日期：2026-07-18
状态：P2-01–06 Beelink/Mac 生产验收通过，M2 技术闭环；正式 Gate 2 等待 Gate 0/1 与 owner 签字；P3 gate-locked

P2/P3 不能用内存 adapter、健康检查或一次性演示替代。2026-07-17 已在 Beelink 的
独立 PostgreSQL、Redis 和 OpenBao（KMS/secret boundary）完成 P2-01/02/03 的 8 条
migration、事务 outbox/CAS、Redis 竞争、OpenBao 三节点 HTTPS/Raft 和 API key 生命周期验收。
2026-07-18 持久化数据迁移到 Beelink 大盘 `/data/models/yujianAI/p2`，clean 验收 worktree
位于 `/data/models/yujianAI/worktrees/p2-acceptance`；原系统盘数据保留作回滚副本。
当次 8 条 migration 是历史运行事实；随后应用 009–011，该次 P2 closure schema 为 11/11。
2026-07-19 当前源码已新增 012，但尚未执行，不能覆盖 11/11 的历史验收记录。最终双机运行
`p2-closure-20260718051008-653ebfee` 由 Beelink 作服务器、本机 Mac 作真实 RTC 客户端，
P2-04/05/06 完整通过并完成清理。

## P2：M2 控制面运行闭环

| ID | 任务 | 当前状态 | 退出证据 |
| --- | --- | --- | --- |
| P2-01 | 部署方 `YUJIAN_PLATFORM_RUNTIME_MODULE`，接入 PostgreSQL persistence/store snapshot | **production-accepted**：事务内 usage+audit+outbox 可见；stale CAS 被拒绝；production platform-api 启动、重启恢复；历史 run 8/8、当前 11/11 migration | `p2-20260717095831-116ef52a` + 当前 migration 枚举 |
| P2-02 | Redis rate limit、token quota、lease、实时 usage provider | **production-accepted**：两个 Redis client 100 次竞争严格 20 次放行；30 次 token quota 仅 3 个并发；容器删除重建后恢复 | 跨主机 Redis/Sentinel/Cluster 故障域仍未验收 |
| P2-03 | 外部 KMS/secret resolver 与 API key rotate/revoke | **production-accepted**：OpenBao 三节点 HTTPS/Raft、leader 停止后读取恢复；API key rotate grace/revoke 传播通过；snapshot/报告无一次性 secret | 当前为单主机 quorum；auto-unseal、跨主机 HA 和生产 KMS 合规签字仍缺 |
| P2-04 | 注册、邀请、SSO/OIDC、onboarding、持久化 RBAC | **production-accepted**：OIDC 验证、邀请接受、tenant/project/environment onboarding、真实 Mac RTC first Room、持久角色优先、跨 tenant IDOR 拒绝和 durable audit 全通过 | closure run 的 `p2_04` + `auditCount=11` |
| P2-05 | Webhook destination、outbox worker、DLQ/requeue 生产接线 | **production-accepted**：HMAC、按目标重试、5 次 heartbeat、五次后 DLQ、requeue、重启后已确认目标不重复、reference-only secret 全通过 | closure run 的 `p2_05`；delivery ledger 6 rows |
| P2-06 | 备份恢复和数据权利执行器 | **production-accepted**：导出/删除、持久 receipt、stale processing crash recovery、0600 evidence、隔离 custom `pg_dump` restore、11 migrations、Redis 从 PG 重建全通过 | closure run 的 `p2_06`；RPO 为 captured snapshot zero-loss，RTO 896 ms |

P2 进入条件：Gate 0 已关闭，P1/M1 完整 Gate 1 已关闭，并由 `data-owner`、
`security-owner`、`platform-owner` 在真实部署报告上签字。

当前结论分两层：P2-01–06/M2 技术验收已经闭环；上述进入条件尚未全部满足，因此正式
Gate 2 和对公网生产发布批准仍保持未关闭，不能用技术验收报告替代 owner 决策。

## 本轮 Beelink 部署证据

| 证据 | 结果 |
| --- | --- |
| Compose project | `yujian-p2`；只绑定 `127.0.0.1:15432/16379/18200-18202` |
| PostgreSQL | `postgres:16.4@sha256:9a70e4d1c03a5066080292db2dd95ee3965d3651316e21989fa0935afb8ce8ca`；当前 11/11 migration |
| Redis | `redis:7.2.7-alpine@sha256:1de7ca6a3f63a083036fa1d95dddbd6bdfcdf5865bb692c1e412d4bdf9cb1e37`；atomic counter smoke |
| OpenBao | `openbao/openbao:2.4.1@sha256:06a26f632cd0bdd0fd6e25034f55d68bc28b62590adc8efea3b8dacade11579a`；3 voters、HTTPS health、leader stop/readback 通过 |
| Durable path | `/data/models/yujianAI/p2/{postgres,redis,openbao-{a,b,c},openbao-tls,reports,backups}`；runtime env/init/report/backup mode 0600 |
| Recovery | production-api restart、Redis rebuild、OpenBao restart unseal/3-voter quorum、11 migrations、API key/KMS、隔离 PG restore 与 data-rights crash recovery 均通过 |
| Closure report | `/data/models/yujianAI/p2/reports/p2-closure-acceptance.json`；run `p2-closure-20260718051008-653ebfee` |
| Isolation | 最终 run 内 `ai-phone-staging-*` 和 `livekit-qkxy-*` restart count hash 前后一致；未 recreate/restart 这些既有容器 |

操作细节见 [P2 Beelink runtime README](../../infra/p2/README.md)。本证据证明 P2-01–06
部署切片、适配器和生产技术验收，但不替代 Gate 0/1、跨主机 HA、auto-unseal、生产 KMS
合规评审和 owner 签字。

## P3：M3-M7 顺序关闭

1. **M3/Gate 3**：真实 TURN/TLS、运营商网络矩阵、质量指标、24/72 小时稳定性、故障注入。
2. **M4/Gate 4**：Beelink RTX 5090 worker、artifact digest/signature/SBOM、provider、
   dispatch、canary/rollback、取消和成本观测。
3. **M5/Gate 5**：运营商/SBC、SIP、Ingress/Egress、对象存储留存删除和合规签字。
4. **M6/Gate 6/8/9**：私有化离线包、Operator、升级/回滚、备份恢复、HA 和 RPO/RTO。
5. **M7/Gate 6/7/10**：账单对账、安全/渗透/供应链审计、适用性结论、RC/GA 签字。

任何阶段发现外部依赖缺失，都保持 `UPSTREAM_UNAVAILABLE` 或 fail-closed，不伪造成功。
