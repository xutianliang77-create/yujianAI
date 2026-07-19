# @yujian/platform-api

第一个可运行的语见控制面切片，直接复用 `livekit-server-sdk@2.17.0`。

## API

- `GET /healthz`：进程存活。
- `GET /readyz`：使用官方 `RoomServiceClient.listRooms()` 并行检查所有语见 RTC 节点，
  只返回节点 id、健康状态和延迟，不暴露内部 endpoint 或上游错误。
- `POST /platform/v1/rtc/token`：签发 60 至 300 秒的 LiveKit Room token。
- `POST /platform/v1/rtc/turn-credentials`：签发 60 至 3600 秒的 coturn REST 临时凭据，
  shared secret 只由部署 runtime 从 KMS/OpenBao 解析。
- `POST /internal/v1/rtc/capacity`：接收 RTC pod sidecar 的短 TTL 容量/drain 报告；仅接受
  独立内部 Bearer credential。
- `POST /platform/v1/tenants`：使用 bootstrap admin credential 创建 Tenant。
- `POST /platform/v1/tenants/{tenantId}/projects`：创建 Project。
- `POST /platform/v1/projects/{projectId}/environments`：创建 Environment 和默认 quota。
- `GET /platform/v1/environments/{environmentId}/quotas`：读取配额快照。
- `GET /platform/v1/environments/{environmentId}/usage`：读取不可变 usage 记录。
- `GET /platform/v1/environments/{environmentId}/audit`：读取作用域内审计投影。
- `GET /platform/v1/environments/{environmentId}/endpoints`：读取不含 secret 的 RTC endpoint discovery。
- `GET /platform/v1/tenants/{tenantId}/billing-statements`、`GET /platform/v1/invoices/{id}` 和
  `/adjustments`：通过注入的 billing adapter 查询账单。
- `POST/GET /platform/v1/tenants/{tenantId}/data-rights`、`GET /platform/v1/data-rights/{id}`
  和状态迁移路由：通过注入的 data-rights adapter 管理数据主体请求。
- `POST /platform/v1/environments/{environmentId}/api-keys`、`POST /platform/v1/api-keys/{id}:rotate|:revoke`：API key 只显示一次、轮换和撤销。
- `POST/GET /platform/v1/tenants/{tenantId}/members`、`PATCH /platform/v1/tenant-members/{memberId}`：管理员成员/RBAC 管理。
- `GET /platform/v1/environments/{environmentId}/rooms` 与 `/rooms/{room}/participants`：经授权的官方 RoomService 查询；支持 participant 查询、更新和移除。
- `POST/GET /platform/v1/environments/{environmentId}/telemetry/rtc`：客户端质量样本上报和窗口汇总。
- `POST /platform/v1/environments/{environmentId}/media/ingress|egress`：授权后转发到 media-ops；
  SIP 同类路由默认在 media-ops 侧禁用。

Token 接口需要：

```text
Authorization: Bearer <environment-scoped-platform-credential>
Content-Type: application/json
```

示例请求：

```json
{
  "tenantId": "tenant-preview",
  "projectId": "project-demo",
  "environmentId": "environment-local",
  "roomName": "quickstart",
  "participantIdentity": "developer-001",
  "permissions": {
    "canPublish": true,
    "canSubscribe": true,
    "canPublishData": true
  },
  "ttlSeconds": 300
}
```

## 本地运行

1. 启动官方 LiveKit 开发实例：

   ```bash
   npm run rtc:up
   ```

2. 依据 `.env.example` 设置环境变量。本地 LiveKit dev mode 使用官方文档中的固定
   开发凭据；不要把它们用于局域网、staging 或生产。

3. 构建并启动：

   ```bash
   npm run build -w @yujian/platform-api
   npm start -w @yujian/platform-api
   ```

`YUJIAN_PLATFORM_CREDENTIALS_JSON` 中的每个 Bearer credential 只绑定一个
`tenantId / projectId / environmentId`。可选 `roles` 使用平台角色到 permission 的
白名单映射；若同时提供 `scopes`，以显式 scope 为准。请求作用域不匹配时返回 403；作用域会写入
JWT 的 `yujian.*` 保留 attributes，调用方不能覆盖。服务默认只监听 `127.0.0.1`，
没有显式配置时会拒绝启动。静态 credential 仍是 bootstrap 入口；API key 生命周期和
scope 已由内存 adapter 实现，生产仍需接入完整 IAM、KMS 和持久化。
API key rotate 默认保留旧 secret 5 分钟作为 grace period；revoke 会立即清除当前和 grace
secret。生产应根据租户策略显式配置更短的轮换窗口并记录审计。

控制面优先读取 `YUJIAN_RTC_PRIMARY_URL`、`YUJIAN_RTC_SECONDARY_URL`、
`YUJIAN_RTC_API_KEY` 和 `YUJIAN_RTC_API_SECRET`。`LIVEKIT_*` 只作为单节点兼容输入；
官方 Server 镜像和 JWT 字段仍保持 LiveKit 命名。Token 响应的 `data.nodeId` 是语见
本次轮询选定的入口，`data.url` 与它对应。

媒体控制面通过 `YUJIAN_MEDIA_OPS_URL` 和 `YUJIAN_MEDIA_OPS_CREDENTIAL` 接入内部
media-ops。两者必须同时设置；未设置时媒体路由明确返回 `UPSTREAM_UNAVAILABLE`，不会伪造
任务成功。credential 只进入内部 header。

本切片使用 `PlatformStore` 作为可替换的内存 adapter，提供合同、幂等缓存、quota
预留、API key hash、usage、audit、outbox 和成员行为；生产部署必须注入
`PostgresPlatformPersistence` + KMS/Redis 实现，不能把内存状态当作持久化真值。API
请求路径已支持注入 `PlatformPersistenceAdapter`：usage 与 audit/outbox 会在同一个 SQL
事务中写入；其他资源通过 `PlatformStoreSnapshot` 恢复和保存，SQL adapter 仍是生产 repository
接管和细粒度约束的边界。SQL adapter 已提供
environment/quota、usage upsert、事务 outbox 和 `SKIP LOCKED` 边界；`RedisLeaseStore`
提供短期原子租约，但尚未替代进程内限流器。

outbox 领取使用不出 PostgreSQL adapter 的私有 claim token。publisher 对正在投递和同批
排队的事件定期 heartbeat，只有当前 token 持有者能标记 published/failed；外部接收方仍应使用
`x-yujian-event-id` 幂等去重，因为远程成功与 delivery ledger 提交之间仍是 at-least-once 语义。

`PostgresPlatformResourceUsageProvider` 可作为 runtime module 的 `resourceUsage` 实现，读取
Ingress/Egress/SIP 活跃任务、Agent observed replicas 和当前分钟 token usage。RTC pod 可运行
`@yujian/rtc-capacity-exporter` sidecar，通过官方 RoomService 汇总 Room、participant、publisher、
track，并用 `participants × published tracks` 作为 subscription 上界。`RedisRtcCapacityProvider`
保存短 TTL/单调 sequence 报告并用 Lua 原子预留容量；节点不健康、draining、报告过期或任一
节点/租户 quota 超限时，token 签发 fail-closed。不能把 SQL 的缺省零值当作真实 RTC 容量。

多个实时来源可通过 `CompositePlatformResourceUsageProvider` 合并。每个 source 必须声明自己
拥有的计数域；重复域、未声明域或非安全非负整数都会拒绝，避免 RTC/Agent/Media provider
静默覆盖造成容量错误。

RTC 质量样本可注入 `PostgresRtcTelemetryPersistence`（`008_rtc_telemetry.sql`）：原始样本
追加写入，窗口摘要在 PostgreSQL 聚合，进程内 `RtcTelemetryBuffer` 只作为开发/无持久化回退。
每次成功写入还会生成不含 tenant/Room/participant label 的 RTC 质量 histogram；
`RtcTelemetryRetentionWorker` 按 `YUJIAN_RTC_TELEMETRY_RETENTION_DAYS`（默认 7，范围 1–90）
分批清理原始样本，长期趋势由私有 Prometheus remote-write 保存。

`PostgresPlatformPersistence.listUsage/listAudit` 是控制面 usage/audit 的 durable read projection，
生产注入的 persistence 必须同时提供这两个查询；否则重启后不得回退到空的进程内列表。

服务启动时可设置 `YUJIAN_PLATFORM_RUNTIME_MODULE` 加载部署侧 ES module。该模块导出
`createPlatformRuntime({ config })`，返回 `PlatformServerDependencies`，用于注入
PostgreSQL/Redis/KMS、billing、data-rights、webhook、outbox replay 和 telemetry 实现；secret 不进入平台 API 镜像。

企业登录可注入 `identity.authenticate(accessToken, request)`，由部署侧先完成 OIDC/SAML
签名校验和租户/项目/环境映射，再返回不含原始 token 的 `PlatformIdentityCredential`；平台 API 不直接
解析企业身份协议，也不会把原始 JWT 写入存储或日志。
`NODE_ENV=production` 启动时会拒绝缺少 persistence、分布式 rate limiter、
`resourceUsage.snapshot(scope)`、`tokenQuota.reserve(scope, policy)` 或 durable
`telemetryPersistence` 的 runtime module；没有实时用量、分布式 token reservation 和持久化
RTC 质量样本就不能进入生产模式。
生产部署应同时设置 `YUJIAN_REQUIRE_RTC_CAPACITY=true` 和
`YUJIAN_REQUIRE_TURN_CREDENTIALS=true`。前者要求 runtime 注入分布式 `rtcCapacity` provider，
后者要求注入 KMS-backed `turnCredentials` issuer；任一 adapter 缺失时进程拒绝启动。TURN
返回值只含短期用户名/HMAC 密码和公开 URL，不暴露 shared secret。
同一 runtime module 还必须提供 `storePersistence`（例如
`PostgresPlatformStorePersistence`），用于 `006_platform_store.sql` 的 Tenant/Project/
Environment/API key 等资源 snapshot；platform-api 在变更响应前保存，快照不含明文 API secret。
PostgreSQL snapshot 写入带 version CAS，多副本发生 stale writer 时拒绝写入而不是覆盖新状态。
`OutboxPublisher.requeueDeadLetter()` 通过持久化 adapter 重新排队 dead-letter 事件；已发布或非
dead-letter 事件不能被 replay。publisher 也可注入按 event 动态解析 destination 的
`WebhookDestinationProvider`，secret 由部署侧 KMS/runtime 解析。生产部署可使用
`PersistentWebhookDestinationProvider`：它按事件 scope 读取 `secret_ref`，调用注入的
`WebhookSecretResolver`，只把短生命周期字节交给 publisher，不把 secret 写入 PostgreSQL、snapshot
或日志。

运维 replay 通过 `POST /platform/v1/admin/outbox/{eventId}:requeue` 暴露，必须使用 admin
Bearer；服务未注入 `PlatformOutboxReplayService` 时返回 503，不会退化为进程内删除或静默重放。

生产 runtime 还必须注入 `OutboxPublisherWorker`（通过 `PlatformServerDependencies.outboxWorker`）。
平台进程监听成功后启动可停止的批量消费循环；PostgreSQL `SKIP LOCKED` 负责多副本领取，worker
只负责退避、轮询和优雅停机。缺少该 worker 时 production 启动会 fail-closed，避免 outbox 只写不投递。

静态控制台跨域使用时，可设置 `YUJIAN_PLATFORM_CORS_ORIGIN` 为一个精确的 `http(s)` origin；
API 不接受 `*`，预检和实际响应只允许该 origin。生产优先把控制台与 API 放在同一 origin，
避免扩大浏览器信任边界。

账单和数据权利服务同样通过 `createPlatformServer` 依赖注入。未配置时相关路由明确返回
`UPSTREAM_UNAVAILABLE`，不会伪造空账单或把数据主体请求写入平台内存 store。
Room/Participant 适配器仍
只调用官方 `RoomServiceClient`，平台 API 负责授权、审计和作用域隔离。

`PlatformServerDependencies.rateLimiter` 接受同步或异步 `RateLimiter`；本地默认使用
`PlatformRateLimiter`，生产可注入 `RedisRateLimiter`，其 Lua fixed-window 计数和过期在 Redis
内原子执行。

生产 token 路径可使用 `RedisTokenQuotaProvider` 的 Lua reservation：同时限制每分钟请求数和
并发票据数，并为并发计数设置崩溃保护 TTL；超过配额返回稳定的 429。释放操作具备进程内
幂等保护，Redis 连接由部署 runtime 注入。

Preview 环境必须由 admin 通过
`PUT /platform/v1/admin/environments/{environmentId}/entitlement` 写入带 version CAS 的套餐、
有效期和 feature allowlist；生产 runtime 缺少 `PostgresEnvironmentEntitlementService` 时拒绝
启动。RTC token 与 TURN credential 在 quota 前执行 entitlement 检查，缺失、暂停、过期或未
授权 feature 均返回拒绝，不使用默认放行。

支持闭环由 `PostgresSupportService` 提供：环境 credential 可创建/查询工单，admin 可 CAS 更新、
登记脱敏 bundle、签发或撤销 60–3600 秒一次性访问。token 仅首次响应返回且带 `Cache-Control:
no-store`，PostgreSQL 只保存哈希；访问 `/platform/v1/support/tickets/...` 时按 ticket 和单一
permission 原子消费。bundle URI 禁止内嵌凭据/query/fragment，且 `containsMedia` 必须为 false。
生产 runtime 缺少 support adapter 时 fail-closed。

创建 Tenant/Project/Environment、成员和 API key 必须携带 `Idempotency-Key`；同一作用域重用 key
时请求字段必须保持不变，否则返回冲突；Room token
是无持久化副作用的票据操作，不要求幂等键。API key scope 由创建者显式声明，例如
`rtc.token.issue`、`rtc.room.read`、`rtc.participant.write`、`telemetry.read`；静态 bootstrap
credential 不受该 scope 限制。

## CLI quickstart

控制面启动后，可用仓库内 CLI 验证健康状态或签发短期 token。CLI 只把 token 写到标准输出，
不把 credential 放入 URL、日志或请求体以外的字段：

```bash
YUJIAN_API_URL=http://127.0.0.1:8090 \
YUJIAN_PLATFORM_CREDENTIAL="$YUJIAN_PLATFORM_ADMIN_CREDENTIAL" \
npm run yujian:cli -- health

YUJIAN_API_URL=http://127.0.0.1:8090 \
YUJIAN_PLATFORM_CREDENTIAL="$YUJIAN_PLATFORM_CREDENTIAL" \
npm run yujian:cli -- token \
  --tenant tenant-demo --project project-demo \
  --environment environment-demo --room quickstart --identity developer-001
```

CLI 仅使用 Node 内置 `fetch`，不形成客户端对 LiveKit API secret、数据库或 Redis 的依赖。
