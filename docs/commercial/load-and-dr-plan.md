# 商业压测与灾备计划

压测场景覆盖 1:1 音视频、小组语音、主播多订阅、Data/RPC 高频、Agent dispatch、Ingress/
Egress 长任务和 quota 竞争；输出单节点容量、扩缩阈值、网络/TURN、P50/P95/P99 和成本。

灾备演练覆盖 PostgreSQL restore、Redis 重建、RTC 节点/AZ 故障、provider 故障和对象存储
删除/恢复。商业客户数据不得用于未授权压测，报告必须脱敏并由 SRE/产品/安全签字。
