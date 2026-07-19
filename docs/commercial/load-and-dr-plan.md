# 商业压测与灾备计划

状态：执行合同；当前版本尚未运行。

## 前置条件

- 只使用合成 tenant、号码、媒体和短期凭据，不复制商业客户正文、录音或 secret。
- 固定 source commit、OCI/chart digest、schema、节点规格、区域、运营商和测试窗口。
- release-owner 与 sre-owner 签发限时维护 receipt；生产故障注入还需 security-owner。
- 所有原始输出写入追加式证据目录，报告只引用 URI 和 SHA-256。

## 压测矩阵

| 场景 | 逐级负载 | 必须记录 |
| --- | --- | --- |
| RTC 1:1 音视频 | 连接、发布、订阅和重连并发 | join success、P50/P95/P99、packet loss、freeze、CPU/内存/出口 |
| 小组语音/主播多订阅 | participant/订阅扇出与节点 drain | RTP bytes、带宽、容量 lease、跨节点迁移 |
| Data/RPC | 消息大小、频率、deadline 与取消 | success、延迟、队列、丢弃和限流 |
| Agent | dispatch、provider streaming、工具调用 | queue/start/token 延迟、GPU、取消、cost ledger |
| SIP/Ingress/Egress | 并发呼叫和长任务 | provider 状态、质量、对象写入、费用和删除 |
| 控制面竞争 | token/API key/quota/outbox/webhook | CAS 冲突、Redis 原子性、PG 锁、重试和 DLQ |

每级至少包含预热、稳态和冷却；达到错误预算、SLO、资源保护或费用上限即停止。容量结论必须
同时给出保守安全容量、扩缩阈值、单位成本和不确定性，不得只报告峰值。

## 灾备矩阵

1. RTC node/AZ drain 与硬故障：验证 health observation 过期、驻留策略、无跨域误路由和恢复。
2. PostgreSQL 主库故障及隔离 restore：验证 committed ledger/outbox/audit、RPO/RTO 和无生产覆盖。
3. Redis 丢失/重启：从 PostgreSQL 真值重建 quota/capacity，验证无重复 lease 或额度放大。
4. OpenBao/KMS leader/key 故障：验证 TLS、短期 token、轮换、旧 key 退役门禁和恢复。
5. TURN/网络/运营商/provider 故障：验证 fallback、deadline、circuit、cancel 和费用上限。
6. 对象存储删除/恢复：验证备份、retention、发票/数据权利/媒体证据 digest 和不可覆盖。

## 通过条件

报告必须包含时间线、注入动作 digest、P50/P95/P99、错误率、RPO/RTO、账本损失、残留资源、
production overwrite、回滚和 Owner receipt。任何 `ledgerLoss=true`、`productionOverwrite=true`、
未关闭 P0/P1、错误预算 `freeze`、驻留越界或缺少 digest 均判失败。真实执行前 Gate 9 不通过。
