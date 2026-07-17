# RTC/控制面故障注入计划

按环境隔离执行，使用合成租户和短期凭据：

1. RTC 节点停止/网络隔离：验证 `/readyz`、drain、token endpoint 和共享 Redis 路由。
2. Redis 延迟/不可用：验证控制面降级、不能写账本、恢复后 lease 不重复。
3. PostgreSQL 主库不可用：验证写入失败可重试、outbox 不丢、API 不误报成功。
4. provider timeout/rate-limit：验证 deadline、circuit breaker、取消和预算。
5. TURN/公网 UDP 禁用：验证 TCP/TLS fallback 和告警。

每个场景记录注入时间、P50/P95/P99、错误率、恢复时间、RPO/RTO、残留资源和回滚决定。
