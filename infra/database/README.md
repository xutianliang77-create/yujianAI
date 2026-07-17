# 控制面数据库边界

`PlatformStore` 是本地/验收 adapter；生产实现必须按 `migrations/001_platform.sql` 使用
PostgreSQL 事务真值，并将 audit + outbox 在同一事务提交。Redis 只保存短期 lease、rate
limit、node routing 和可重建缓存；不得把 secret、usage ledger 或 audit 只写 Redis。

`services/platform-api/src/postgres-persistence.ts` 提供不绑定具体 Node 驱动的 SQL pool
adapter：读取 environment/quota policy、usage dedupe upsert、审计与 outbox 同事务写入，并用
`FOR UPDATE SKIP LOCKED` 领取待发布事件。它目前是生产接线边界，尚未替换 API 主路径的
`PlatformStore`；真实 PostgreSQL/KMS/Redis 连接和迁移演练必须在 Beelink 开机后执行。

`services/platform-api/src/redis-coordination.ts` 提供原子 Lua lease（`SET NX PX` 与 token
compare-and-delete），供分布式 rate-limit、worker drain 和 outbox 协调使用。lease 只保存短期
协调状态，不能代替 PostgreSQL 的审计、账单或 usage 真值。

迁移执行前做备份、schema compatibility preflight，并保留上一版 migration 的回滚说明。

`migrations/002_domain_expansion.sql` 增加 Agent、SIP/Ingress/Egress、Room policy、provider
binding、账单和数据主体请求的持久化边界。所有 credential 只存 `secret_ref` 或 hash；完整
电话号码、token、录音和用户正文不得进入这些表。

`migrations/003_agent_control.sql` 为 Agent Control 提供单行 JSONB snapshot 表；部署侧 runtime
module 通过 `PostgresAgentControlPersistence` 恢复和保存 artifact、deployment、dispatch、rule
与 worker 状态。生产 Agent Control 缺少该 adapter 时拒绝启动。

`migrations/004_media_ops.sql` 为媒体控制面提供可恢复快照；`migrations/005_outbox_delivery.sql`
保存 webhook 的下一次重试、最近错误和 dead-letter 时间，避免进程内失败队列成为唯一真值。
media-ops snapshot adapter 同样使用 version CAS，拒绝 stale replica 覆盖媒体状态。
`migrations/006_platform_store.sql` 为 Tenant/Project/Environment、API key metadata/hash、usage、
audit 和 outbox 投影提供单行快照；快照不包含 API secret，平台生产 runtime 必须注入
`storePersistence` 并在变更响应前完成保存。snapshot adapter 使用 version compare-and-swap，
多副本写入冲突会 fail-closed，不静默覆盖较新的控制面状态。
Outbox adapter 提供受保护的 dead-letter requeue 边界，重放前会确认事件尚未 published。
`migrations/007_webhook_destinations.sql` 保存按 environment scope 的 webhook URL、event types
和 KMS `secret_ref`；数据库永不保存 webhook secret 明文。
`migrations/008_rtc_telemetry.sql` 保存 RTC 质量样本，按 scope/time index 支持窗口聚合；保留
和归档由部署侧 retention job 执行。

## 执行迁移

部署环境使用仓库脚本按文件名顺序执行迁移，并在 PostgreSQL 中记录已应用版本；脚本使用
advisory lock，重复执行安全，DSN 密码不会出现在命令行或脚本日志：

```bash
YUJIAN_DATABASE_URL='postgresql://user:password@postgres:5432/yujian?sslmode=require' \
  npm run db:migrate
```

迁移脚本要求部署环境提供 `psql`；Beelink 开机前不执行。生产发布必须先备份并保留迁移
回滚说明，`yujian_schema_migrations` 只记录成功提交的 migration。
