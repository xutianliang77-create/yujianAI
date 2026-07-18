# 语见AI进度日志

更新时间：2026-07-17

## 📌 2026-07-17 恢复并完成双端真实验证

- 暂停后确认 Beelink 无本项目残留进程，使用隔离端口 `17880/17980`，未触碰既有 `livekit-qkxy-*` 或 `ai-phone-staging-*` 服务。
- Beelink `npm run beelink:acceptance` 通过，报告：`outputs/beelink/20260717T075738Z`；服务器预检、上游同步、workspace lint/test、双 LiveKit 节点、Room/Participant、Data、RPC、Node PCM 音频 Track/RMS 均通过。
- 本机 `npm run client:acceptance` 通过，报告：`outputs/client/20260717T080332Z`；Flutter pub/analyze/test/Web 构建、Chrome WebRTC、Web/Flutter Web 双节点连接、Data、RPC 和音频 Track 通过，Web RTP `2133 bytes`。
- 修复客户端验收脚本的 macOS Chrome 路径、`CdpClient` TDZ 初始化顺序和 Tailscale 直连时的系统代理干扰；待本次提交推送后作为客户端验收修复记录。
- 验收结束后已清理本项目 `local-yujian-rtc-*`、`local-redis-1` 和测试网络；Beelink 上既有服务保持运行，无后台测试进程。
- 手机原生 Android/iOS target 尚未纳入当前仓库；本次客户端证据是本机 Chrome 的 Web/Flutter Web，不宣称原生手机通过。

## 📌 2026-07-17 P0 文档状态与证据同步完成

- 统一当前状态为：**M1 A-C baseline passed；完整 Gate 1 未通过；D/E 尚未执行**。
- 已更新 `README.md`、`docs/README.md`、技术设计、开发计划、验收计划、开发完成审计、
  `docs/compatibility/MATRIX.md` 和 `tests/compatibility/compatibility-matrix.json`。
- 兼容矩阵现在区分 `passed-baseline` 与完整 Gate 通过；Web/Flutter/Node 绑定
  `20260717T080332Z` / `20260717T075738Z` 证据，Python 为 `deferred-runtime`，iOS/Android
  仍为 `planned`。
- 修正真实运行方案的故障诊断命令，使其使用 `YUJIAN_RTC_PRIMARY_PORT` /
  `YUJIAN_RTC_SECONDARY_PORT`，支持本轮隔离端口 `17880/17980`。
- 服务器端报告仍在 Beelink `/home/beelink/yujianAI/outputs/beelink/20260717T075738Z`；
  客户端 summary 已在本仓库 `outputs/client/20260717T080332Z/summary.txt`。

### P0 后续门禁

1. P1/M0-M1：ADR/合规 owner、clean upstream 可复现证据、完整 SDK、视频/屏幕、TURN/弱网、
   reconnect、Webhook、SBOM/签名和 nightly sandbox。
2. P2/M2：真实 PostgreSQL、Redis、KMS、注册/邀请/SSO/onboarding、持久化 RBAC、分布式限流
   和恢复演练。
3. P3/M3-M7：24/72 小时稳定性、5090 Agent/provider、SIP/媒体、私有化、账单、安全和合规。

## 📌 2026-07-17 P1 第一批实现

- 新增 `docs/governance/OWNERS.md` 和 `docs/planning/P1_M0_M1_CLOSURE_PLAN.md`，为 ADR、
  合规、RTC、数据、Agent、SRE、供应链和发布建立角色责任与 Gate 退出证据；个人 owner
  尚未指派，不虚构签字状态。
- ADR-0001..0004 已补充 owner、评审人和关闭前置；合规清单明确角色 owner 不等于法律结论。
- Web 兼容 target 增加合成 camera 与 screen-share video Track 发布/订阅和 RTP bytes 检查；
  已完成 esbuild 语法构建，尚未在 Beelink/Chrome 重新运行，因此状态为 implemented-deferred。
- 新增 `services/platform-api/test/outbox-publisher.test.mjs`，覆盖 webhook HMAC、成功投递、
  terminal failure、DLQ 和 requeue；按用户约束未在本机执行，需在 Beelink 重新运行 workspace test。
- 未改变当前 Gate 判定：仍为 M1 A-C baseline passed，完整 Gate 1 未通过，D/E 尚未执行。
- P2/P3 已单独记录在 `docs/planning/P2_P3_RUNTIME_CLOSURE_PLAN.md`：P2 等待部署方真实
  PostgreSQL/Redis/KMS/身份 provider，P3 在 M0-M2 Gate 关闭前保持 gate-locked。
- 只读核对 Beelink：当前仅有既有 `livekit-qkxy-*`、`ai-phone-staging-*` 服务和 Redis
  `127.0.0.1:6379`；未发现 PostgreSQL `5432`、语见 platform-api/MediaOps 端口或本项目
  runtime module。既有服务未修改；RTX 5090/驱动可见。

## 📌 2026-07-17 P1 兼容性覆盖继续（实现延后运行）

- Web harness 新增 SDK-internal `full-reconnect` 事件闭环检查（`Reconnecting` → `Reconnected`），
  并对 audio/camera/screen receiver stats 采集 `bytesReceived`、`packetsReceived`、`packetsLost`
  和 `jitter`。这是合成故障注入与质量采样实现，不替代 Beelink 的 TURN、弱网和真实断链证据。
- Flutter Web harness 新增可靠 Data、topic/sender 校验和 RPC echo；既有 audio Track 检查保持不变。
- `docs/compatibility/MATRIX.md` 与机器可读矩阵将新增路径标为 `implemented-deferred`，既有
  `20260717T080332Z`/`20260717T075738Z` 证据不被扩大解释；完整 Gate 1 仍未通过。
- 本轮只做源码/合同静态检查，未运行 npm workspace test、Flutter/Chrome、Beelink 或手机验收。
- 下一步：在无界AI测试窗口结束且确认隔离端口后，先在 Beelink 重新运行服务器验收，再运行本机
  Web/Flutter client acceptance；之后补 iOS/Android/Python、TURN/弱网和质量聚合报告。

## 📌 2026-07-17 P1 实现层收尾（运行证据仍待 Beelink/设备）

- Web、Flutter、Node 兼容 harness 均补入合成 camera/screen、mute/unpublish 或 reconnect
  生命周期覆盖；Node 使用官方 RTC Node `VideoSource`/`VideoStream`，不修改 LiveKit 上游。
- 新增官方 Python `livekit.rtc.Room` join/leave smoke：`tests/compatibility/python/room_smoke.py`；
  仅接受短期 token，未在本机安装或执行 Python Agents。
- 新增 Linux `tools/compatibility/run-netem.sh`，支持显式网卡的 loss/delay/jitter/rate 和退出清理；
  仅用于 Beelink/Linux 弱网实验，不能替代 TURN/TCP/TLS 证据。
- 新增 SBOM 结构校验、cosign blob 签名校验、P1 evidence schema verifier，并将 SBOM verifier
  接入 supply-chain/release workflow；新增 digest/短期凭据/自动清理的 nightly sandbox runner 和定时 workflow。
- 这些改动是 P1 implementation-deferred，不改变 Gate 判定：个人 owner/法律结论、iOS/Android/Python
  运行、真实视频/屏幕、TURN/弱网、Webhook 端到端、SBOM/签名产物和 nightly 报告仍未形成。
- 本轮未启动任何 Beelink、Chrome、Flutter、Python、手机或网络故障测试；下一步必须在确认无界AI
  测试窗口结束后按 `docs/acceptance/REAL_RUNTIME_TEST_PLAN.md` 生成 P1 evidence JSON。
- 2026-07-17T08:47Z 只读核对 Beelink：已有 `ai-phone-staging-*`、`livekit-qkxy-*` 和 Redis
  `127.0.0.1:6379` 运行；7880/7881 已被现有 LiveKit 占用，未发现本项目隔离端口或 runtime module。
  RTX 5090 可见；因存在其他项目服务，本轮未启动任何 P1 验收或网络故障注入。

## 📌 2026-07-17 双端真实验证暂停记录

用户要求暂停真实验证，以避免与无界AI在 Beelink 上的测试冲突。当前状态：

- 已将验收边界拆为服务器端与客户端：Beelink 运行 Docker/LiveKit/Node 集成，Mac/手机运行客户端兼容性。
- 提交 `a1cd163`、`8f5f260`、`c876d34`、`8f6e5fc`、`1671698` 已推送到 GitHub `main`；该暂停记录创建时最新代码为 `1671698`。
- Beelink 服务器预检通过：Linux x86_64、Node 24.18.0、Docker/Tailscale、单张 RTX 5090。
- Beelink workspace lint/test/check 通过；双节点服务曾以隔离主机端口 `17880/17980` 启动。
- 修复 `YujianRegionRouter` 同容量节点始终选择 primary 的问题后，Node 双节点真实集成测试通过：Room、Participant、Data、RPC、PCM 音频 Track/RMS。
- 本机 `npm run client:preflight` 通过（Node 25.8.2、Flutter 3.44.1、Chrome 可用）；客户端完整验收尚未执行。
- 最后一轮完整 Beelink 验收在上游网络校验阶段被用户要求中断，没有生成最终 `status=passed`；报告目录为 `outputs/beelink/20260717T050759Z`。
- 已停止并清理本项目测试容器；未触碰 Beelink 上已有的 `livekit-qkxy-*` 容器。无后台测试进程。

### 暂停后的恢复顺序

1. 先确认无界AI在 Beelink 的测试已结束，并确认可使用隔离主机端口。
2. 在 Beelink 重新执行 `YUJIAN_KEEP_RTC_UP=true npm run beelink:acceptance`，必要时使用 `17880/17980` 端口组。
3. 服务器验收通过并保留 RTC 后，再在本机执行 `npm run client:acceptance`；手机原生 Android/iOS target 仍需单独补齐。

## 2026-07-17 本轮继续开发补记（媒体幂等、资源用量与生产门禁）

用户确认：Beelink 是服务器端并配置 1 块 RTX 5090；本机和手机作为客户端。Beelink 执行
服务器、Docker、LiveKit/RTC、Node 集成和 GPU 预检；客户端执行 Web/Flutter/手机兼容性验证。

### 本轮新增实现（未运行验证）

- media-ops 创建幂等键现在保存环境作用域请求指纹；Ingress/Egress/SIP 使用相同 key 重放
  相同请求只返回原资源，不重复调用上游；更改房间、类型、URL、输出目标、号码或拨号参数
  会返回冲突。源 URL/输出目标不写入资源账本，仅留在进程内指纹边界。
- OpenAPI 增加 Ingress `url`、Egress `outputTarget` 请求字段，并收紧 Ingress/Egress 响应合同，
  显式声明 provider ID、状态、时间戳和幂等键；`EgressJobV1` 补齐 `providerEgressId`。
- 官方 LiveKit media adapter 增加 URL ingress 的 HTTP(S)/无内嵌凭据校验、RTMP 输出协议校验、
  输出目标控制字符拒绝；provider 状态回调按 environment 复核，starting/active 必须存在
  provider ID。
- 修复 `createMediaOpsServer` 在传入 options 时覆盖自定义 control 的问题；现在只有未注入
  control 时才从 options 创建默认 control。
- platform-api 增加可注入 `PlatformResourceUsageProvider`，在 quota 查询和 RTC token 容量准入
  时合并 RTC/Agent/Media 实时计数并校验非负安全整数；生产启动缺少该 provider 会 fail-closed。
- platform-api 增加 `PlatformTokenQuotaProvider` 和 Redis Lua 原子 request/concurrent reservation，
  token 路径优先使用分布式 reservation；生产 runtime 缺少该 provider 会 fail-closed，避免
  多副本继续使用进程内 token 并发计数。
- 新增 `PostgresPlatformResourceUsageProvider`，从 durable media jobs、Agent observed replicas
  和当前分钟 token usage 读取可用计数；LiveKit 房间/participant/track 仍要求 RTC provider
  覆盖，不把 SQL 缺省零值当作容量真值。
- PlatformStore 的 Tenant/Project/Environment/Member/API key 创建幂等键增加请求指纹；同一 key
  改变请求字段不再静默返回旧资源。
- media-ops 增加 `MediaOpsSnapshot`/restore、`MediaOpsPersistence`、`PostgresMediaOpsPersistence`
  和 `004_media_ops.sql`；HTTP mutation 成功/失败均保存快照，生产 `YUJIAN_MEDIA_PERSISTENCE_MODULE`
  缺失时拒绝启动，Helm 已提供模块路径注入。
- Outbox webhook 增加指数退避、最大尝试次数校验和 PostgreSQL `next_attempt_at`/`last_error`/
  `dead_lettered_at` 持久化字段（`005_outbox_delivery.sql`），重启后不丢失重试调度。
- Agent Control 增加 artifact digest/signature/SBOM 输入校验、可注入
  `createAgentArtifactVerifier()` runtime module，并在 production/Helm 缺少 verifier 时
  fail-closed；worker 注册、重注册和 heartbeat 继续校验 environment、capability 与 dispatch
  ownership；恢复 snapshot 时也拒绝无效 artifact。
- Outbox 失败状态持久化异常不会覆盖内存 DLQ 记录，避免 webhook publisher 因二次存储故障丢失
  原始投递错误。
- PlatformStore 增加不含明文 secret 的 `PlatformStoreSnapshot`/restore；新增
  `PostgresPlatformStorePersistence`、`006_platform_store.sql`，platform-api 在启动恢复并在
  Tenant/Project/Environment/API key/member/token usage 等 mutation 返回前保存；生产 runtime
  缺少 `storePersistence` 时 fail-closed；PostgreSQL snapshot 保存增加 version CAS，拒绝 stale
  writer 静默覆盖新状态。
- 新增 `platform-store-snapshot.test.mjs` 覆盖 hash-only snapshot 和损坏引用拒绝；测试源码仅
  已写入，按要求未执行。
- Agent Control 与 media-ops PostgreSQL snapshot adapter 增加 version CAS；多副本 stale writer
  现在失败而不是静默覆盖新状态。
- Outbox persistence 增加 dead-letter requeue 边界和 `OutboxPublisher.requeueDeadLetter()`；已发布
  或非 dead-letter 事件拒绝 replay。
- platform runtime loader 对 `storePersistence` 的 `load/save` 形状做启动前校验，避免生产进程
  在首个请求时才因错误模块崩溃。
- ToolPolicyEngine 增加并发幂等、部署侧 `ToolResultStore` 和 `ToolAuditSink` 接口；高风险工具
  结果与审计可离开进程内内存，实际加密存储和人工接管仍由部署侧提供。
- Helm platform-api deployment 现在在 production chart 渲染阶段强制要求
  `platformRuntime.modulePath`，private preflight 使用明确的占位模块路径，不再允许 chart
  成功渲染出必然启动失败的默认配置。
- private deployment preflight 增加 001–008 migration 文件存在性检查；shell 语法已检查，未
  执行 helm、kubectl、Docker 或集群命令。
- 新增 `PostgresWebhookDestinationPersistence` 与 `007_webhook_destinations.sql`，destination
  按 environment scope 保存 URL/event types/`secret_ref`，不落 webhook secret 明文；preflight
  migration 检查扩展到 001–008。
- OutboxPublisher 支持按 event 动态解析 `WebhookDestinationProvider`，destination provider 异常
  会进入该事件的 retry/DLQ，不会中止整个 batch。
- 新增 `PersistentWebhookDestinationProvider` + `WebhookSecretResolver`：按事件 scope 读取
  `secret_ref` 并由部署侧 KMS/runtime 解析，仅将短生命周期 secret bytes 交给 publisher；
  secret 不进入 PostgreSQL、PlatformStore snapshot 或日志。
- ProviderRegistry 收紧 failover 语义：仅超时、限流和 5xx 等可重试错误切换 provider；参数/鉴权
  等不可重试错误原样返回且不触发 circuit failure，避免同一请求在多个 provider 上产生重复副作用。
- DataRightsService 与 PostgresDataRightsService 补齐 tenant+idempotencyKey 的 subject/kind 指纹
  校验；同 key 修改数据权利对象不再静默返回旧请求，改为明确冲突。
- PostgreSQL audit read projection 现在对 actor/result/risk 枚举做严格恢复校验，损坏或越界的
  数据不会以合法审计事件返回给控制面。
- 平台 API 新增可注入 `PlatformIdentityProvider`，Bearer token 在静态 credential/API key 未
  命中时进入部署侧 OIDC/SAML 验证并映射最小 scope；identity provider 形状在 runtime loader
  启动前校验，原始 token 不写入平台持久化。
- `platform-adapters` 新增 `OidcPlatformIdentityBridge`，把 RS256/JWKS 验证结果交给部署侧
  scope resolver，再以最小角色/权限返回 platform-api identity contract；SAML 仍保持 gateway
  边界，不信任前端 claims。
- platform-api 新增 `CompositePlatformResourceUsageProvider`，要求 RTC/Agent/Media 等 source
  声明计数域 owner；重复域、未声明域和非法计数拒绝，避免多 provider 静默覆盖容量真值。
- 新增 admin-auth 的 `POST /platform/v1/admin/outbox/{eventId}:requeue` 运维入口，只有注入
  `PlatformOutboxReplayService` 才能重排 dead-letter；未配置时明确返回 503，不做进程内静默 replay。
- platform-api 新增 environment-scoped webhook destination GET/PUT/DELETE：PUT 只接收 URL、
  `secretRef`、event types 和状态，DELETE 仅禁用；secret 明文仍不进入 API 或数据库。
- RTC telemetry 增加 `RtcTelemetryPersistence` 与 `PostgresRtcTelemetryPersistence`，通过
  `008_rtc_telemetry.sql` 保存质量样本并在 PostgreSQL 聚合窗口摘要；无 runtime 注入时才使用
  进程内 buffer。
- `tools/release/preflight.mjs` 增强 manifest schema、重复/未知 evidence 和 forbidden release
  state 校验，并新增 `npm run release:preflight` 入口；不会把缺失的 Beelink/安全/备份证据视为通过。
- 新增 `tools/private-deployment/verify-offline-manifest.mjs`，由 private preflight 调用，校验
  离线 manifest 结构、重复/占位 artifact、外部服务和实际 artifact root 文件存在性。
- platform runtime loader 增加 outbox replay、webhook destination、telemetry persistence 的
  `load/save`/CRUD/append/summary 形状校验，错误模块在启动阶段 fail-closed。
- `AgentDispatchRunner` 支持注入 `AgentDispatchObserver`，记录 claim/complete/fail/poll error 的
  traceId、耗时和错误摘要；观测器写入失败不会改变 dispatch 处理结果，实际指标/成本聚合仍由
  部署侧 observer 提供。
- 修正 dispatch observer 的同步异常隔离，并新增 `AgentDispatchMetricsObserver`，将事件/耗时
  交给低基数 metrics sink；traceId 不进入指标标签。
- provider-runtime 新增 `ObservedProviderAdapter`，统一记录 provider success/failure/cancelled、
  duration 和 traceId；observer 异常隔离，调用正文和凭据不进入观测。
- 静态 console 增加 environment-scoped webhook destination 列出、保存和禁用入口，仍只提交
  `secretRef`，不在浏览器保存 secret 明文。
- `tools/cli/yujian.mjs` 增加 webhook-list/save/disable 命令，与控制面 destination API 对齐。
- `OutboxPublisherWorker` 已加入 platform-api runtime：production 必须注入可停止的批量投递循环，
  worker 与 HTTP server 生命周期绑定，跨副本领取继续由 PostgreSQL `SKIP LOCKED` 完成；缺少
  worker 时启动 fail-closed。
- `PostgresPlatformPersistence` 增加 `listUsage/listAudit` durable read projection，控制面 `/usage`
  与 `/audit` 在 production 不再从重启即丢失的内存 store 读取；runtime loader 校验读写 adapter
  形状，production 缺少两个查询会 fail-closed。
- `/metrics` 请求观测改为受控路由 label，增加 Prometheus histogram 的 bucket/sum/count 输出；
  不再把租户、房间或 participant ID 作为指标标签。
- provider-runtime 新增 `ProviderRegistry`，按 capability/region/streaming 过滤 provider，逐 binding
  熔断并按声明顺序 failover；仍不携带厂商凭据或请求正文。
- offline manifest verifier 不再把缺少 artifact root 的清单误报为已验证；提供 root 时会拒绝未解析
  digest、路径穿越和 SHA-256 不匹配，未提供 root 时仅报告 declarative inventory。
- license-service verifier 收紧为 Ed25519 公钥、严格 payload 字段、租户/feature/节点/grace/expiry
  和 64-byte base64url signature 校验；不生成真实 license，客户签发和离线演练仍待 Beelink/部署侧。
- RTC telemetry summary 合同和内存/PostgreSQL 聚合补齐 RTT/jitter 的 P50、P95、P99，并同步 OpenAPI；
  客户端全矩阵 stats、长期保留和质量面板仍等待 Beelink/观测部署。
- 私有化升级预检新增 `tools/private-deployment/upgrade-preflight.mjs`：校验迁移编号连续、
  release rollback/schema skew、向前升级约束和上一版镜像 digest；缺少运行时版本时只输出
  declarative 报告，不冒充升级验收。
- `platform-adapters` 收紧 HTTP KMS/对象存储/身份/日志响应合同：canonical base64、算法、
  key/subject/URI/expiry 均严格校验，拒绝可能把坏响应或路径穿越输入带入私有化运行时。
- OIDC adapter 拒绝空签名和非有限 `exp/nbf`，避免 NaN 时间 claim 绕过 token 有效期判断。
- `PostgresDataRightsService.process` 现在与内存服务保持 claim→executor→evidence 或 reject 的完整
  生命周期；数据扫描/导出/删除仍由部署侧 executor 注入，不把用户正文带入平台服务。
- `PostgresBillingReadModel` 对发票币种/账期/状态、明细文本和冲正类型做严格恢复校验，异常
  财务行不会以合法账单合同返回。
- media-ops 新增 `MediaRetentionWorker`：按到期 Egress 批量调用部署侧对象删除 provider、写入
  deletion evidence、持久化 CAS 快照并支持优雅停止；生产启用 Egress 但缺少 retention worker
  时 fail-closed。
- media-ops 快照恢复现在校验 retention/deletion 时间、删除证据成对出现和对象 URI；Helm 在未启用
  media-ops 时拒绝打开 SIP/Egress，并明确持久化 runtime module 还需导出 retention worker factory。
- `YujianRegionRouter` 在 allowed region/residency tags 无匹配节点时改为显式拒绝，不再回退到可能
  违反驻留约束的任意 RTC 节点；双节点配置的 region/tag 输入也做了规范化校验。
- 为上述区域驻留拒绝和 media-ops Egress 快照成对证据新增 Node 合同测试；仅做 `node --check`，
  按用户要求未执行测试运行。
- media-ops `restore()` 改为先完整解析/校验所有资源与索引，再一次性替换内存 map，坏快照不会
  只恢复一部分状态。
- 新增 `docs/acceptance/REAL_RUNTIME_TEST_PLAN.md`：固定 Beelink A-C 基线自动验收、双节点故障
  Gate、单 RTX 5090 Agent Gate、生产持久化/媒体留存 Gate、命令、通过条件和证据归档；明确
  当前 `beelink:acceptance` 不等于 Agent/生产 runtime 全部通过。
- Helm/platform-api/架构文档明确 production runtime 必须提供 `resourceUsage.snapshot(scope)`。

### 本轮静态检查结果

- 源码路径映射 TypeScript 严格语义检查：80 个文件通过（含本轮 outbox worker、durable usage/audit read、metrics histogram、ProviderRegistry、Ed25519 license、identity、resource usage、webhook CRUD、telemetry persistence、provider observer 改动）。
- OpenAPI operationId/$ref 检查（55 operations）、JavaScript `node --check`、Python AST（2 个
  worker 文件）、Shell、offline manifest verifier、Helm values YAML 和 package-lock JSON 通过。
- 本轮继续增量静态检查：TypeScript 严格语义检查、OpenAPI operationId/$ref、私有升级预检脚本
  `node --check`、Shell 语法和 Helm schema JSON 均再次通过；未执行任何运行测试或 Beelink 命令。
- 本轮新增源码尚未运行验证：outbox worker、durable usage/audit read、metrics histogram、ProviderRegistry、
  Ed25519 license payload 校验和离线 artifact digest 校验均等待 Beelink/部署环境证据。
- 未执行 npm build/lint/test、Docker、Flutter、浏览器、LiveKit、GPU、Beelink 或任何外部
  服务连接；以上“通过”不等于运行验收通过。

### 下一次恢复顺序

1. Beelink 开机后运行 `npm run beelink:preflight`，确认唯一 RTX 5090、Docker、Node、双 RTC
   节点和网络条件。
2. 运行 `YUJIAN_KEEP_RTC_UP=true npm run beelink:acceptance`，完成服务器双 LiveKit 节点和
   Node 音频 Track 验证并保留 RTC 服务。
3. 在本机运行 `npm run client:preflight` 与 `npm run client:acceptance`，完成 Web/Flutter
   Web 音频 Track 发布订阅；手机原生 Android/iOS target 当前仍未纳入仓库，需单独补齐。
4. 部署侧提供 `resourceUsage`、PostgreSQL/KMS/Redis runtime module；随后再做持久化、分布式
   quota、webhook/SSO 和生产故障演练。

## 📌 SESSION HANDOFF STATUS

### Current Work

控制面持久化/CAS、outbox/webhook KMS resolver、Agent dispatch observer、media retention cleanup 和私有化预检源码已补齐；运行验收未开始。

### Background Tasks

无后台任务；未启动 Docker、LiveKit、GPU 或 Beelink 连接。

### Next Session Priorities

1. Beelink 开机后执行 `npm run beelink:preflight`。
2. 执行 `YUJIAN_KEEP_RTC_UP=true npm run beelink:acceptance`，记录双 RTC、Node 音频 Track、Agent 5090 和媒体链路证据。
3. 本机执行 `npm run client:acceptance`，记录 Web/Flutter Web 客户端证据；手机原生测试另行登记。
3. 根据运行结果接入真实 PostgreSQL/KMS/Redis runtime module，并回写 Gate 审计。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short
npm run beelink:preflight
npm run beelink:acceptance
```

## 2026-07-17 继续开发补记

本次继续按 M0-M7 任务补齐实现骨架；测试、构建、Docker、浏览器、Flutter 和 Beelink
运行验证仍全部延期。

### 新增实现（未验证）

- M0：ADR-0003/0004、数据分类/威胁模型、DoD/审批矩阵、合规 owner/blocker、许可证与
  SBOM policy、OpenAPI/兼容矩阵边界。
- M1：官方 `WebhookReceiver` 签名与 replay adapter、Ingress/Egress/SIP 官方 SDK adapter、
  TURN 配置边界、Prometheus/OTel 配置、clean mirror patch replay guard、SBOM generator、
  upstream/supply-chain/nightly workflow 和 sandbox profile。
- M2：PostgreSQL schema migration、持久化/outbox 接口、Local envelope KMS adapter、
  webhook publisher（签名/重试/DLQ）、Prometheus `/metrics`、分布式实现替换边界。
- M3：Helm API/PG/Redis/TURN/NetworkPolicy/HPA/PDB/topology spread、synthetic probe、
  backup/restore runbook、脱敏 support bundle、Preview 试用计划和公网 gateway 安全模板。
- M4：Node/Python worker baseline、deadline/cancel/drain、provider adapter/circuit breaker、
  ToolPolicyEngine、Agent quickstart、RTX 5090 profile。
- M5：官方 Ingress/Egress/SIP adapter、media feature gate、录制保留/删除和媒体 quickstart。
- M6：offline manifest、license verifier、企业 OIDC/SAML/SCIM adapter 合同、私有部署 preflight。
- M7：UsageLedger/PricePlan/Invoice/reconcile、DataRightsService、release manifest/preflight、
  LTS/support policy 和 release workflow。
- 本轮增量：`PostgresPlatformPersistence` 注入式 SQL pool 实现环境/quota 查询、usage 幂等写入、
  审计+outbox 事务和 `SKIP LOCKED` outbox 领取；媒体幂等键改为 environment 作用域，媒体状态机
  增加合法迁移和输入类型校验，错误映射补齐 404/409/429；Local envelope KMS 显式接收加密上下文，
  Beelink 单 RTX 5090 的 GPU reservation/启用边界写入 Agent runbook；补齐手动触发的 release
  evidence/SBOM preflight workflow；新增不绑定驱动的 Redis 原子 lease adapter。
- 为媒体状态机和 Redis lease 增加待运行的 Node 合同测试；测试源码已做语法检查，但未执行。
- `platform-api` 增加可注入的 Room/token/region 平台边界，并新增 Node 内置 fetch 的
  `tools/cli/yujian.mjs` health/ready/token quickstart。
- `provider-runtime` 增加 HTTPS JSON provider adapter、deadline/取消、idempotency header、
  响应大小上限和 retryable failover；仍不内置任何 provider secret 或具体厂商依赖。
- `docs/api/openapi.yaml` 扩展为租户/项目/环境、API key、成员、Room/Participant、telemetry、
  usage/audit/endpoint、token 和媒体路由的 v1 描述。
- Node Agent worker 增加 AbortController cancel/drain 和 `WorkerControlClient` 注册、heartbeat、
  start/complete/fail 内部接口；Python reference worker 补齐 cancel/drain 状态边界。
- platform-api 增加异步 `RateLimiter` 接口与 Redis Lua fixed-window `RedisRateLimiter`，本地
  `PlatformRateLimiter` 仍作为默认 adapter。
- platform-api 增加 `PlatformMediaOps`/`HttpMediaOpsClient`，把 Ingress/Egress/SIP 路由按环境
  scope、权限、Idempotency-Key 转发到 media-ops；未配置时返回明确 503。
- media-ops 增加按 environment 隔离的 Ingress/Egress/SIP 列表和单任务查询；platform-api
  同步暴露授权后的查询路径，OpenAPI 已补齐对应资源。
- 私有化部署切片继续补齐：Helm 增加官方 LiveKit 双副本、RTC Service、PostgreSQL/Redis
  headless Service、数据库/Redis 探针与非 root/只读根文件系统边界；platform-api 注入作用域
  credential、双 RTC URL 和可选 media-ops HTTPS 地址。
- media-ops 与 agent-control 增加 `/healthz`、可选 Node HTTPS listener、TLS 文件注入和环境
  级 feature gate；Ingress/Egress 不再默认绕过 gate。Helm 增加可选 media-ops/Agent Control
  TLS 部署、NetworkPolicy 和单副本 `nvidia.com/gpu: 1` worker 约束。
- Node Agent worker 增加 active dispatch snapshot、环境变量驱动的 control register/heartbeat
  循环；worker 仍不声明第二张 GPU，也未接入具体模型 provider。
- 新增 `infra/images/Dockerfile.node-service` 和镜像说明，统一从 workspace lockfile 构建
  platform-api、media-ops、agent-control、agent-worker-node，运行镜像只带目标 service 和
  workspace packages；构建、SBOM、签名和 digest 仍排到 Beelink 开机后的发布阶段。
- Python reference worker 增加 stdlib HTTPS `WorkerControlClient`（register/heartbeat/start/
  complete/fail）和可选 heartbeat loop，与 Node worker 共用内部 envelope；Python/LiveKit join
  及真实 job lifecycle 仍未接入。
- M7 账务与数据权利边界加固：`UsageLedger` 增加价格/数量/账期校验、发票 draft→issued→paid/
  void 状态迁移和 provider 金额校验；`DataRightsService` 增加 received→processing→completed/
  rejected 合法迁移、输入校验和证据 URI 约束。两者仍是可替换内存 adapter，未接财务/数据扫描
  后端。
- M6-03 增加不绑定厂商的 HTTPS gateway adapters：`HttpKmsAdapter`、`HttpObjectStorageAdapter`、
  `HttpIdentityAdapter` 和 `HttpLogExportAdapter`，统一 credential header、超时、对象大小、
  短期签名 URL 和明文 HTTP 拒绝策略；真实客户 KMS/对象存储/OIDC/日志 gateway 仍需部署验收。
- Agent Control 增加 artifact 注册、deployment/canary/rollback/reconcile、dispatch create/cancel
  内部 API，并在 worker start/complete/fail 时校验 environment 与 dispatch ownership；Node/Python
  client 共用 cancel envelope，避免跨环境 worker 接单。
- M5 媒体生命周期继续收口：`SipCallV1` 支持请求级 `sipTrunkId`，移除 LiveKit provider
  bridge 的硬编码 trunk；media-ops 新增 Ingress/Egress/SIP provider `:status` 内部回调，
  对 provider ID、录制 URI、保留时间和合法状态迁移执行校验，重复同状态回调保持幂等。
- M2 持久化接线继续推进：`createPlatformServer` 支持注入 `PlatformPersistenceAdapter`，
  usage 与 audit/outbox 通过同一事务写入；默认内存 store 仍仅用于开发，未在 Mac 上连接
  PostgreSQL/Redis/KMS。
- M3 增加 `YujianRtcCapacityController`：消费节点 readiness/usage，执行 room、participant、
  publisher、subscription、track 配额准入，支持节点 draining 和按利用率选择 fallback；
  platform-api 可注入该 controller，在签发 token 前阻止不健康/排空/超配节点。
- M4 增加 Agent dispatch rule/trigger 与 worker 原子 claim：规则按 trigger、deployment、
  并发上限生成 dispatch，worker 领取同环境最早截止任务，过期 queued 任务自动标记失败；
  Node/Python control client 均提供 claim 方法。
- Helm media-ops 增加 provider 开关、RTC 双节点 URL、API 凭据 secret 注入和默认 SIP trunk
  配置；OpenAPI、media quickstart、服务 README 和数据库边界同步更新。
- Agent worker 增加官方 `@livekit/rtc-node@0.13.31` 的 `LiveKitAgentRoomConnector`，提供按
  dispatch 建立、断线清理和主动关闭 Room session 的 Node adapter；控制面仍负责 token 与
  ownership，未把 token 写入 dispatch 持久化合同。M4 审计、README 已同步；Python adapter
  已补齐，完整 job lifecycle 和 Beelink 运行证据仍待实现/验证。
- billing/data-rights adapter 增加按 tenant/发票查询和数据主体 request get/list 入口，仍只
  是可替换内存边界，未宣称财务系统或真实数据扫描已接入。
- platform-api 的 media client 现在保留 media-ops 的 4xx/5xx 状态并映射到稳定平台错误码，
  不再把 provider/权限/资源冲突全部伪装成 503；网络失败仍归类为 `UPSTREAM_UNAVAILABLE`。
- platform-api 增加可注入 billing/data-rights 服务边界：billing statements、invoice、adjustment
  查询和 data-rights submit/list/get/start/complete/reject 路由；DataRightsService 的 submit
  支持 tenant 作用域幂等键。真实财务、扫描、删除和证据存储仍由外部 adapter 负责。
- billing 增加 `PostgresBillingReadModel` 发票明细/冲正 SQL 投影；data-rights 增加
  `PostgresDataRightsService` 生命周期 adapter 和幂等索引迁移。平台 API 通过结构化依赖
  注入支持同步内存或异步 SQL 实现，未配置时返回明确 503。
- Node Agent worker 增加 `AgentDispatchRunner`，把原子 claim、deadline/cancel handler 和
  complete/fail 回写串成可注入运行循环；Room token 仍由控制面短期签发，handler 自行注入。
- Python reference worker 同步增加 `AgentDispatchRunner`、deadline、任务取消和 complete/fail
  回写；官方 Python LiveKit Room/provider 依赖仍由部署侧显式锁定和注入。
- 历史翻译合同包 `packages/contracts` 已从根 npm workspace 和 package-lock workspace links
  移除，只保留在仓库内供人工历史审阅；新平台默认构建/发布不再包含它。
- 本轮源码静态复核：TypeScript compiler API 语义检查 80 个文件通过（含 media client 错误映射
  修订）、TypeScript syntax
  parse 63 个文件通过、Python AST 1 个文件通过、Ruby Psych 解析 OpenAPI/Helm values 通过、
  package-lock JSON 通过；Node `yaml`/PyYAML 未安装，因此未运行项目构建或测试。
- media-ops 增加可注入 `MediaOpsProvider`：启用 provider 时，Ingress/Egress/SIP 请求会调用官方
  `YujianMediaServiceAdapter`，成功迁移到 active 并保存 provider ID，失败迁移到 failed 并返回
  `PROVIDER_UNAVAILABLE`；默认 provider 仍关闭，SIP/录制合规 gate 不变。
- M2 控制面补齐 Tenant/Project/Environment GET 与环境级 API key metadata/list 查询，并同步
  OpenAPI；`platform-contracts` 增加 Room policy、Room/Participant/Track projection、SIP trunk
  和 ProviderBinding 合同。
- Environment 增加 version compare-and-set PATCH 合同、输入解析、Store 更新和审计投影，避免
  私有化控制面并发更新覆盖；OpenAPI 已同步，删除/恢复状态策略仍待实现。
- 新增 `infra/database/migrations/002_domain_expansion.sql`，为成员、region/room policy、
  provider binding、Agent、SIP/Ingress/Egress、账单和数据主体请求建立 PostgreSQL 持久化边界；
  迁移尚未在 Beelink 执行。
- `tools/private-deployment/preflight.sh` 增加 offline/release manifest schema、Helm values schema
  和 `helm lint` 门禁；只在客户/Beelink 环境执行，当前 Mac 未运行。
- 本轮静态检查：TypeScript `transpileModule` 解析 76 个文件、Python AST、OpenAPI/Helm values
  YAML、模板静态 YAML、package-lock/Helm schema JSON 与 `git diff --check` 通过；未运行
  tsc/npm test/Docker/Flutter/浏览器或 Beelink 命令。
- 后续增量静态检查已覆盖 77 个 TypeScript 文件；本次变更后再次完成 60 个源码 TypeScript
  文件的 `transpileModule` 语法解析、Python AST、OpenAPI/Helm values YAML、package-lock/
  schema JSON 和 `git diff --check`；未运行 tsc/npm test/Docker/Flutter/浏览器或 Beelink 命令。
- 继续补齐：PostgreSQL schema/Redis/KMS persistence boundary、HMAC webhook publisher、官方
  Ingress/Egress/SIP adapter、metrics endpoint、Helm database/TURN/network resources、
  synthetic probe、fault injection、设计伙伴试用、HarmonyOS/小程序 feasibility、商业压测/GA
  review、Python/Node Agent worker 和 provider/tool policy runtime。

### 当前判定

当前已形成 M0-M7 合同、服务骨架、适配器边界、部署和发布骨架；不等于真实生产环境已完成。
生产 PostgreSQL/KMS/Redis 主请求路径接线、HA/TURN、真实 provider/运营商、财务/合规签字以及
Beelink 运行证据仍是未完成项。任何 Gate 仍不得标记通过。

## 2026-07-17 开发推进补记（本轮）

用户已明确：Beelink 是服务器端，配置 1 块 RTX 5090；所有测试、构建、Docker、浏览器和
Flutter 验证等待 Beelink 开机后统一执行。本轮严格只做源码、合同、部署骨架和文档，未连接
Beelink，也未在 Mac 上执行上述命令。

### 本轮后续增量（未验证）

- Python Agent worker 新增 `livekit_room.py`：通过官方 `livekit.rtc.Room` 实现 join/leave、
  取消清理和 session 管理；`requirements.txt` 锁定 `livekit-agents==1.6.5`，token 仍由控制面
  短期签发，worker 不持有 API secret。
- platform-api 新增可选 `YUJIAN_PLATFORM_RUNTIME_MODULE` 的 Helm 注入配置，支持部署方在
  镜像内提供 PostgreSQL/Redis/KMS、billing 和 data-rights adapter，并可从 Secret 注入连接地址。
  未配置时继续使用内存 adapter，仅限开发/合同检查。
- Beelink Agent GPU compose 补齐 `YUJIAN_AGENT_CONTROL_CREDENTIAL` 和 capability 环境注入；
  reference runner 当前串行处理 dispatch，仍只允许唯一 `agent-gpu` profile 申请 RTX 5090。
- Node/Python worker 入口接入可选 `YUJIAN_AGENT_HANDLER_MODULE`：分别加载部署侧
  `handleDispatch`/default 与 `handle_dispatch` handler，Runner 负责 claim、deadline、cancel、
  complete/fail 和 shutdown drain；未设置 handler 时只注册/heartbeat，不领取任务。
- 新增可选 `infra/images/Dockerfile.python-agent`，锁定安装 `livekit-agents==1.6.5` 并复制
  Python worker/官方 RTC adapter；不改变默认 Node worker 镜像，单卡 Beelink 运行时由部署选择
  一个镜像，避免第二个 GPU worker。
- 新增 `tools/database/migrate.mjs` 与 `npm run db:migrate`：按序、带 PostgreSQL advisory lock
  和 `yujian_schema_migrations` 记录执行 SQL migration；DSN 密码只进入进程环境，不进入命令行
  或日志。迁移仍等待 Beelink/部署环境执行。
- `apps/console` 从 onboarding 占位升级为静态控制台：健康/就绪检查、短期 Room token quickstart、
  浏览器内存凭据和响应脱敏；platform-api 增加精确 origin CORS 预检边界，默认仍关闭跨域。
- Python 兼容性 README、M4 完成审计和根 README 已同步 Python 官方 Room adapter 边界。
- Agent Control 管理面与 worker 面已分离 credential：worker 仅使用 `x-yujian-worker-token`，
  artifact/deployment/dispatch/rule 管理使用独立 `x-yujian-agent-admin-token`；生产进程缺少
  admin credential 会拒绝启动，Helm 已注入独立 Secret key。
- Agent Control 增加 `AgentControlSnapshot`、`PostgresAgentControlPersistence`、可选 runtime
  module 和 `003_agent_control.sql`；每次成功 mutation 保存 snapshot，启动时恢复，生产缺少
  persistence adapter 会拒绝启动。
- platform-api 生产启动现在要求 runtime module 提供 persistence 与分布式 rate limiter；新增
  `tools/api/verify-openapi.rb` 和 `npm run openapi:verify`，并接入 release/nightly workflow。

本轮仍未执行 Python 依赖安装、npm/tsc、Dart/Flutter、Docker、浏览器或 Beelink 命令。

静态检查结果：源码路径映射下 TypeScript 严格语义检查 73 个文件、JavaScript `node --check`、
Python AST 2 个文件、Ruby Psych 解析 OpenAPI/Helm values、OpenAPI 本地 `$ref` 325 个、
package-lock/Helm schema/compatibility JSON 和 `git diff --check` 均通过；这些结果不替代
Beelink 运行验收。直接使用历史 `dist` 声明的逐包语义检查未采用，因为其声明尚未由本轮构建
刷新，会产生与源码无关的旧合同噪声。

### 本轮已实现（未验证）

- 扩展 `@yujian/platform-contracts`：Tenant/Project/Environment、成员/RBAC、API key、
  Region/Quota、Usage、Audit/Outbox、RTC telemetry、Agent deployment/dispatch/provider、
  SIP/Ingress/Egress、价格/账单、数据主体请求和 SLO 合同；新增创建/更新请求解析器。
- `PlatformStore` 增加 API key 只显示一次、hash 校验、轮换/撤销、成员创建/更新/列表、
  token quota、usage 去重、audit→outbox 投影；issued API key 可作为环境作用域 Bearer
  credential 使用。
- `platform-api` 增加 Tenant/Project/Environment、API key 生命周期、成员管理、Room/Participant
  查询与移除/更新、endpoint discovery、RTC telemetry 上报/汇总、quota/usage/audit 路由；
  RoomService 仍通过官方 `livekit-server-sdk`，平台只做授权和数据边界。
- `@yujian/livekit-compat` 增加 `YujianRoomServiceAdapter` 与 `YujianRegionRouter`，节点配置
  支持 region/residency/capacity 元数据；LiveKit Server、协议、JWT grant 和官方 SDK 未改名。
- 新增 `@yujian/agent-control` 状态机骨架（artifact 签名门禁、canary/rollback、dispatch、
  cancel）和 `@yujian/media-ops` 状态机骨架（SIP 默认禁用、Ingress/Egress 幂等与 quota）。
- 新增私有化 Helm 最小 chart、离线包边界、容量计算器、M0 ADR/合规适用性清单、OpenAPI
  最小描述、兼容矩阵和控制台 onboarding quickstart。
- 新增平台 API 单进程 rate-limit guard（生产需 Redis 分布式限流）、KMS/对象存储/OIDC/日志
  adapter 合同和 SLO 目标配置；这些是部署边界，不含真实云厂商凭据或外部连接。
- 新增 `infra/agent/beelink/compose.yaml`：Agent GPU profile 明确只预留唯一 RTX 5090；RTC
  双节点默认不占 GPU，Agent profile 在 Beelink 预检通过前保持关闭。
- 新增 `docs/planning/DEVELOPMENT_COMPLETION_AUDIT.md`，将“代码已实现”与“Beelink 运行证据”
  分开审计；当前 M0/M1 为 partial，M2 进入实现中，M3-M7 以可审查骨架/合同推进，Gate 仍未通过。

### 本轮验证状态

- 未执行 `npm`、TypeScript、Dart、Flutter、Docker、浏览器或集成测试。
- 未运行 Beelink 预检；RTX 5090/CUDA/Node 24/Flutter/Chrome/双 RTC 节点仍无本轮运行证据。
- 仅做源码静态检查和合同/路径审阅；新增代码不得视为通过。

### 下一次恢复顺序

1. Beelink 开机后先运行 `npm run beelink:preflight`，记录 OS、Tailscale、Docker、Node、
   Flutter、Chrome 和 `nvidia-smi` 输出。
2. 再运行 `npm run beelink:acceptance`，保存 `outputs/beelink/<run-id>/`，先修复合同/构建
   阶段失败，再执行双节点 Web/Flutter/音频验证。
3. 将本轮新增 API key、RoomService、telemetry、Agent/media 状态机纳入 Beelink 验收脚本，
   回写实现证据与运行证据，不能沿用 Mac 历史结果。
4. 生产化前在启动 wiring 中注入 `PostgresPlatformPersistence`，再接 Redis + 外部 KMS，补
   分布式 quota、TURN/TLS、备份恢复和真实观测管线；当前只完成 API 的可注入事务边界，默认
   启动仍使用内存 store。
5. 后续代码优先完成生产 persistence factory/迁移入口、对象存储与 KMS provider adapter；仍只
   做源码和合同，等 Beelink 开机后再统一执行验证。

## 📌 SESSION HANDOFF STATUS

### Current Work

语见AI正在开发 M2 控制面和 M3-M7 可审查骨架，并保留 M0/M1 环境隔离与 Beelink 服务器验收切片。Beelink 是唯一服务器端
与验收环境：Linux AMD64、Tailscale `100.110.127.117`、一块 RTX 5090；RTC 运行双
节点并共享 Redis，5090 留给后续 Agent/模型 runtime。单一内部 key 已在源码中升级为
绑定 `tenantId / projectId / environmentId` 的环境级 credential。

用户已明确：所有测试必须等待 Beelink 开机后执行。因此本轮只编写代码、测试合同、
部署和验收脚本，没有在 Mac 上运行测试、构建、Docker、浏览器或 Flutter 验证。本轮
新增内容全部是“已实现、未验证”状态。

### Completed

- 保留正式品牌“语见AI”，将英文工程工作名调整为 `Yujian Realtime`。
- 暂定定位语为“让实时智能，连接每一次互动”，待商标和市场评审。
- 明确产品五条能力线：
  - RTC Engine。
  - Realtime Cloud。
  - Agent Platform。
  - Telephony & Media。
  - Private Deployment。
- 明确本版本不建设翻译产品，不建设终端消费者翻译 App。
- 将旧翻译设计归档到 `docs/archive/translation-v1/`。
- 重写根 `README.md`、`AGENTS.md` 和设计文档索引。
- 建立新的统一架构：
  - `tenantId / projectId / environmentId` 是平台隔离层级。
  - Room、Participant、Track、Token grant 和 Server API 保持 LiveKit 兼容。
  - 语见控制面负责租户、项目、Key、区域、配额、账单、审计和部署。
  - LiveKit 负责实时媒体、SIP、Ingress/Egress 和 Agent dispatch。
  - 语见专有扩展使用 `yujian.*` 命名空间。
- 建立新数据模型，覆盖 RTC、Agent、SIP、媒体任务、用量、账单和审计。
- 建立平台合同 v1 草案，包括 API 信封、可靠事件、幂等、错误码和演进规则。
- 建立六平面技术架构：开发者、控制、RTC、Agent、电话媒体、数据可观测。
- 完成功能详细设计和技术设计。
- 完成 M0-M7 开发计划、Gate 和建议团队配置。
- 完成兼容、媒体质量、Agent、SIP、计费、安全、私有化和灾备验收计划。
- 建立 LiveKit 上游 fork/mirror/patch queue/同步和许可证策略。
- 明确旧项目可只读审阅、受控复制，但永远不得修改或形成运行时依赖。
- 将现有 `@yujian/contracts` 标记为历史翻译合同原型；本轮不删除或重写代码。
- 研究并引用 LiveKit 官方文档、官方仓库和中国数据/AI/电信监管官方资料。
- 冻结 11 个 LiveKit 官方组件的 tag 和解引用 commit：
  - LiveKit Server `v1.13.3`。
  - Protocol `v1.50.0`。
  - SIP `v1.7.0`、Ingress `v1.5.0`、Egress `v1.13.0`。
  - Agents Python `1.6.5`、Agents Node.js `1.5.2`。
  - Node Server SDK `2.17.0`、RTC Node SDK `0.13.31`。
  - JavaScript SDK `2.20.1`、Flutter SDK `2.8.1`。
- 建立 `infra/upstream/livekit-versions.json` 和离线/联网校验工具。
- 固定官方 LiveKit Server `v1.13.3` 的 AMD64/ARM64 容器 digest。
- 建立双节点本地语见 RTC 兼容实验室：两个官方固定 digest Server 共享 Redis routing，
  分别使用 `7880-7882` 和 `7980-7982`，不含语见媒体 patch。
- 新增 `@yujian/platform-contracts`：
  - Room token 请求 JSON Schema 和 TypeScript 类型。
  - 未知字段拒绝。
  - TTL 60-300 秒。
  - metadata、attributes 和请求大小上限。
- 新增 `@yujian/livekit-compat`：
  - 精确依赖 `livekit-server-sdk@2.17.0`。
  - 使用官方 `AccessToken` 签发 JWT。
  - 使用官方 `RoomServiceClient` readiness 探测。
  - 不复制或修改 LiveKit SDK 源码。
- 新增 `@yujian/platform-api`：
  - `GET /healthz`。
  - `GET /readyz`。
  - `POST /platform/v1/rtc/token`。
  - Bearer 内部认证、16 KiB payload 上限、5 秒 HTTP 超时和无缓存响应。
  - 默认只监听 `127.0.0.1`，无显式 credential 时拒绝启动。
- 新增真实集成测试：
  - 官方 Room API 创建/查询/删除 Room。
  - 节点 A 创建 Room 后，节点 B 通过共享 Redis 查询到同一 Room。
  - 平台 API 签发 Token，官方 `TokenVerifier` 验证 grant。
  - 官方 `@livekit/rtc-node` 从两个节点入口连接两个真实 Participant。
  - 可靠 Data Packet 和 RPC 往返。
  - 发布 48 kHz、单声道、440 Hz PCM，订阅端解码 40 帧并验证 RMS 大于 1000。
- 新增 Web SDK 隔离兼容 target：
  - 精确固定官方 `livekit-client@2.20.1`。
  - 真实 Headless Chrome 从两个节点入口连接同一 Room。
  - 验证可靠 Data、RPC、麦克风来源音频 Track 和接收 RTP 字节。
- 新增 Flutter SDK 隔离兼容 target：
  - 精确固定官方 `livekit_client 2.8.1`。
  - API 合同编译、`dart analyze`、Flutter test 和正式 Web build 通过。
  - 真实 Flutter Web App 入房；服务端确认 `sdk=FLUTTER`、版本 `2.8.1`、协议 `16`。
  - 入房信令经节点 A，Room 实际运行于节点 B，Participant 在约 1.27 秒进入 active。
- 自有 Compose service、npm script、测试场景和环境变量改用 `yujian` / `rtc` 命名；
  官方 npm 包、Docker 镜像、SDK 类型和协议字段不改名，以维持直接兼容。
- 定位并修复本机真实 RTC 测试的信令重置：原生 SDK 受系统代理变量影响且未按
  `NO_PROXY` 绕过 loopback；测试仅在本地 endpoint 下清除代理变量，远程测试不变。
- 新增平台环境隔离合同和实现（待 Beelink 验证）：
  - Token 请求必须携带 `tenantId / projectId / environmentId`。
  - 每个 Bearer credential 只绑定一个环境作用域，跨作用域返回 403
    `AUTHORIZATION_FAILED`。
  - 已验证作用域注入 JWT 的 `yujian.tenant_id / project_id / environment_id`。
  - 调用方不能提供或覆盖 `yujian.*` 保留 attributes。
  - 配置改为 `YUJIAN_PLATFORM_CREDENTIALS_JSON`，拒绝旧的无作用域 key。
- 新增平台隔离、配置拒绝、跨环境 403 和 JWT attribute 测试用例，但未执行。
- 建立 Beelink 唯一验收入口（待 Beelink 开机执行）：
  - Linux AMD64 固定 digest 双 RTC 节点和 Redis override。
  - 预检 Linux、Tailscale IP、Docker、Node 24、Flutter、Chrome 和唯一 RTX 5090。
  - 一键执行上游联网校验、合同/单元测试、双节点音频、真实 Web 和 Flutter Web。
  - 验收输出写入 `outputs/beelink/<run-id>/`，退出时关闭测试服务。
- 建立工作区外 LiveKit clean bare mirror 同步工具和仓库内空 patch queue；M1 禁止
  媒体核心 patch，不直接修改 clean mirror。
- 新增只允许手动触发、只选择 Beelink RTX 5090 self-hosted runner 的 GitHub Actions
  验收工作流；当前未触发。
- 新增 `YujianRtcNodePool` 与 `YujianRtc*` 公共别名：控制面支持 1-16 个固定 RTC 节点、
  轮询签发、全节点 `/readyz`，并在成功响应中返回语见 `nodeId`；官方 LiveKit JWT 和
  协议字段保持不变。
- `services/platform-api/.env.example` 增加 `YUJIAN_RTC_PRIMARY_URL` /
  `YUJIAN_RTC_SECONDARY_URL` 与 Yujian credential 输入，`LIVEKIT_*` 仅保留单节点兼容
  fallback；就绪响应不暴露 endpoint 或上游错误文本。
- Flutter 隔离兼容 target 已改为同一 Room 双入口连接，使用 fake media device 发布音频
  Track，并在另一节点验证 `TrackSubscribedEvent`、麦克风 source、发布者 identity 和
  RTP bytes；Chrome runner 增加 fake media 参数。新增 Compose 节点观测 ID 和 HTTP healthcheck，
  未修改官方 LiveKit 镜像、SDK 或上游源码。

### Canonical Documents

- `docs/product/BRAND_AND_PRODUCT_CHARTER.md`
- `docs/architecture/01-platform-boundaries.md`
- `docs/architecture/02-unified-data-model.md`
- `docs/architecture/03-delivery-baseline.md`
- `docs/architecture/04-platform-contracts-v1.md`
- `docs/architecture/05-technical-architecture.md`
- `docs/architecture/06-yujian-naming-and-dual-node-runbook.md`
- `docs/design/01-functional-detailed-design.md`
- `docs/design/02-technical-design.md`
- `docs/planning/01-development-tasks-and-plan.md`
- `docs/acceptance/01-acceptance-tasks-and-plan.md`
- `docs/migration/SOURCE_REUSE_AND_UPSTREAM_STRATEGY.md`

### Decisions Still Required

1. 正式英文品牌、定位语、域名和商标。
2. 开源版、托管云和企业版的功能边界。
3. 控制面长期主语言和框架；首个切片已使用 TypeScript/Node.js。
4. 首个中国托管区域、运营商网络与云厂商。
5. PostgreSQL、分析仓、消息系统和对象存储的具体选型。
6. 首批国内模型 provider。
7. SIP/号码/外呼的资质与合作模式。
8. HarmonyOS 和小程序进入哪个里程碑。
9. 团队规模；若资源不足，需要缩减首版范围。

### Verification

#### 本轮状态

- 测试执行：按用户要求延期，等待 Beelink 开机。
- 本轮新增 TypeScript、JavaScript、Dart、Shell、Compose 和 workflow：未构建、未测试、
  未运行。
- 本轮新增 node pool、双节点 token 路由和 Flutter 音频 Track 逻辑：仅完成静态审阅，
  未在 Mac 上构建或运行；Beelink 开机前不得视为通过。
- Beelink SSH、Tailscale、GPU、Docker 和运行时状态：本轮未连接、未探测。
- 后台进程：无。

#### 策略切换前的历史基线

以下结果来自本轮之前的 Mac 兼容实验，仅作为历史证据；不能证明本轮新增变更通过：

- 文档目标：已切换为中国实时互动平台。
- 功能开发：已开始 M0/M1；当前只包含兼容基线和最小控制面切片。
- LiveKit 源码复制：未执行。
- 无界AI/旧项目源码复制：未执行。
- 旧项目写操作：未执行。
- `npm run verify:upstream:network`：11 个官方 tag/commit 与 npm 版本通过。
- `npm run check`：通过。
- 新平台合同测试：5/5 通过。
- LiveKit SDK 兼容测试：3/3 通过。
- Platform API 测试：4/4 通过。
- 历史合同回归：7/7 通过。
- 固定 digest 的两个官方 LiveKit Server `1.13.3`：启动通过，共享 Redis 健康。
- 双节点 Room/Participant/Data/RPC/非静音音频 Track 集成测试：1/1 通过。
- 官方 Web SDK `2.20.1` 真实 Chrome 兼容：通过，音频 Track 接收 2017 bytes。
- 官方 Flutter SDK `2.8.1`：Dart 分析、单元测试、Web build 和真实 Chrome 入房通过。
- `npm audit --omit=dev`：0 vulnerabilities。
- `npm pack -w @yujian/contracts --dry-run`：通过，历史包仍可复现打包。
- `docker compose config --quiet`：通过。
- 本地 Markdown 链接：检查 43 个文件、34 个本地链接，全部解析。
- 敏感片段扫描：未发现私钥、长 API key 或明文 secret。
- 独立性：除 `node_modules` 依赖链接外，工作区没有软链接。
- 规范索引：未发现指向旧合同文件名或旧源码策略文件名的残留链接。
- 新增 TypeScript 源文件均低于 350 行。
- `git diff --check`：通过。

### Background Tasks

无。

### Next Session Priorities

1. Beelink 开机后先运行预检，再执行唯一完整验收；任何失败按 5 Whys 定位根因。
2. 验收通过后把报告摘要和实际版本写回本日志，不沿用 Mac 历史结果。
3. 将 `PlatformStore` 与 rate limiter 替换为 PostgreSQL/KMS/Redis adapter，接入事务 outbox、签名 webhook 和分布式 quota。
4. 增加 TURN/TLS、UDP/TCP fallback、WAF/DDoS 和外部网络矩阵。
5. 为 RTX 5090 Agent runtime 冻结 CUDA/driver/container/provider 兼容矩阵并执行 GPU 计算验收。
6. 将音频 P50/P95/P99、丢包、抖动、取消和降级指标接入真实 OTel/Prometheus 管线。

### Resume Checklist

```bash
tailscale ping 100.110.127.117
ssh beelink@100.110.127.117
cd <beelink-yujianAI-checkout>
git status --short --branch
export YUJIAN_RTC_NODE_IP=100.110.127.117
export LIVEKIT_API_KEY=<random-url-safe-test-key>
export LIVEKIT_API_SECRET=<random-url-safe-test-secret-at-least-32-chars>
export YUJIAN_PLATFORM_TEST_CREDENTIAL=<random-url-safe-test-credential-at-least-32-chars>
npm run beelink:preflight
npm run beelink:acceptance
```

### Environment Note

Beelink 验收脚本要求 Node 24，并会在执行时记录实际 OS、Flutter、GPU 和 Tailscale
信息。当前未确认 Beelink 是否在线，也未确认 NVIDIA driver/CUDA 对 RTX 5090 的真实
计算可用性；`nvidia-smi` 预检只建立硬件/驱动可见性，Agent runtime 仍需单独计算验收。

## 📌 SESSION HANDOFF STATUS

### Current Work

继续完成 M0-M7 源码合同和适配器：本轮新增 outbox worker、durable usage/audit read projection、
低基数 HTTP histogram、ProviderRegistry（仅可重试错误 failover）、严格 Ed25519 license verifier、
离线 artifact digest 校验、RTC telemetry P50/P95/P99、数据权利幂等冲突校验，以及 Yujian 公共
RTC/Media/Agent 别名；Node/Python Agent、双 RTC、Web/Flutter、GPU 和所有运行测试仍等待 Beelink。

### Background Tasks

无。

### Next Session Priorities

1. Beelink 开机后执行 `npm run beelink:preflight`，再执行唯一的 `npm run beelink:acceptance`。
2. 若验收失败，先区分 Node/依赖、双 RTC/Redis、5090 GPU 和 Flutter/Web 环节，再按 5 Whys 修复。
3. 回写实际运行版本、日志和 `outputs/beelink/<run-id>/` 证据；不要把本机静态检查当成 Gate 通过。
4. 生产部署先执行 `npm run db:migrate` 和 `npm run openapi:verify`，再注入 platform/Agent
   Control runtime module；缺少 PG/Redis/persistence/outbox worker/durable readers 时保持 fail-closed。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
rg -n "SESSION HANDOFF|Beelink|rtc-node|MediaOpsRequestError" PROGRESS_LOG.md README.md services packages
```

## 📌 SESSION HANDOFF STATUS — P2-01/02/03 production acceptance

### Current Work

P2-01/02/03 已从部署烟测提升为 Beelink 真实 production acceptance。运行环境为
`beelink@100.110.127.117:/home/beelink/yujianAI`，Compose project 为 `yujian-p2`，
不触碰既有 `ai-phone-staging-*` 或 `livekit-qkxy-*` 容器。

### Evidence

- 运行命令：`./tools/p2/run-production-acceptance.sh`。
- run id：`p2-20260717095831-116ef52a`；脱敏报告：
  `/home/beelink/yujianAI/data/p2/reports/production-acceptance.json`。
- PostgreSQL：8/8 migration；production platform-api 真实启动与重启；usage、audit、outbox
  同一事务可见；两个 store writer 的 stale CAS 被拒绝。
- Redis：两个 client 进行 100 次限流竞争，严格 20 次放行；30 次 token reservation 仅 3
  个并发成功，全部 release 无泄漏；删除并重建 Redis 容器后恢复。
- KMS：OpenBao 2.4.1 三节点 HTTPS/Raft、3 voters；停止 leader 后通过 survivor resolver
  读回同一 32-byte secret；随后 acceptance secret 已删除。API key create/rotate/revoke
  传播通过，snapshot 和报告无一次性 secret。
- `./infra/p2/beelink/deploy.sh smoke` 再次通过：`raftPeers=3`、`raftVoters=3`。
- PostgreSQL 清理核验：临时 snapshot/audit/usage/outbox 均为 0，migration count=8。
- 既有五个 AI Phone/LiveKit 容器 restart count 保持 0；报告、runtime.env、HA init
  artifact 均为 0600。P2 OpenBao TLS 目录为 0700，证书/私钥不进入数据库。

### Current Gate Judgment

P2-01/02/03：**production-accepted（范围内通过）**。P2 完整 Gate：**未关闭**，仍缺
P2-04 注册/邀请/SSO/onboarding/持久化 RBAC、P2-05 Webhook 签名/重试/DLQ/replay 真实投递、
P2-06 PostgreSQL 备份恢复/数据权利执行器，以及 owner/security/data 签字。三节点 KMS 位于
同一台 Beelink，只证明单主机 process/container quorum；跨主机/AZ HA、auto-unseal 和正式
生产 KMS 合规仍未证明。

### Background Tasks

无。

### Next Session Priorities

1. 保持 P2-01/02/03 证据与实现同步，不把同主机 Raft 写成跨故障域 HA。
2. 关闭 P2-04：注册/邀请/SSO/onboarding、持久化 RBAC、跨 tenant IDOR 和恢复审计。
3. 关闭 P2-05：真实 webhook 签名、重试、DLQ、requeue、乱序/重复和跨副本恢复。
4. 关闭 P2-06：PostgreSQL 备份恢复、RPO/RTO、Redis 重建演练和 data-rights deletion evidence。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run build -w @yujian/platform-api
ssh beelink@100.110.127.117 'cd /home/beelink/yujianAI && ./infra/p2/beelink/deploy.sh status'
```

## 📌 SESSION HANDOFF STATUS — P2-04/05/06 implementation-ready, acceptance interrupted

### Current Work

P2-04/05/06 源码、数据合同、migration 和可重复验收工具已就绪。P2-04 包含 OIDC
onboarding、邀请/接受、PostgreSQL 持久 RBAC、跨 tenant 拒绝和第一条 Room 客户端
probe；P2-05 包含按 event+destination 持久投递账本、claim lease、HMAC、重试、DLQ/
requeue 和重启恢复；P2-06 包含 data-rights executor/worker、prepared→committed 0600
evidence、PostgreSQL 隔离恢复和 Redis 从 PostgreSQL 真值重建。

本地审查另外修复了两个根因：onboarding 内部幂等键改为按已验证身份隔离，
邀请/直接创建成员将目标状态纳入幂等指纹；data-rights 删除在证据无法准备时
现在会在 DELETE 之前回滚，不再出现先删数据后发现证据目录不可写的情况。

### Verification

- `npm run check`：通过；全 workspace lint 通过，共 35 个单元/合同测试通过、0 失败。
- `npm run openapi:verify`：58 operations / 58 unique operationIds 通过。
- `npm run verify:upstream`：11 个 LiveKit upstream component 本地 manifest 校验通过。
- P2 shell/Node 验收工具语法检查通过；`git diff --check` 通过。

### Production Acceptance Status

最终双机运行 `p2-closure-20260717104540-c0c4ba0e` 由 Beelink 作服务器、当前
Mac 作 RTC 客户端。Beelink 发出系统重启广播后失去 SSH，用户已确认死机。
本次没有产生完整脱敏报告：P2-04/05/06 均为 **not-passed**，完整 P2 Gate 为
**not-passed**。P2-05 在早先的未完整运行中已实际观察到 HMAC/retry/DLQ/requeue，
但不以部分观察代替完整验收。状态证据见 `docs/acceptance/p2-closure-evidence.json`。

### Background Tasks

无。已停止所有 Beelink 连接和操作，不尝试重启服务器。

### Next Session Priorities

1. 只在用户确认 Beelink 恢复后，检查宿主机、GPU、P2 Compose 和既有五个容器状态。
2. 清理中断运行的临时 tenant/outbox/KMS/probe artifact，但不动 `ai-phone-staging-*`
   和 `livekit-qkxy-*` 服务。
3. 从 Mac 运行 `./tools/p2/run-closure-with-client.sh`，只在完整报告、备份、清理和
   protected restart count 均核验后关闭 P2-04/05/06。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run check
npm run openapi:verify
# 仅在用户确认 Beelink 已恢复后：
./tools/p2/run-closure-with-client.sh
```

## 📌 SESSION HANDOFF STATUS — P2 data runtime (superseded)

> This earlier smoke-only handoff is retained for history. The authoritative current status is the
> `P2-05 outbox claim-ownership hardening` handoff at the end of this file.

### Current Work

P2-01/02/03 已在 Beelink `beelink@100.110.127.117:/home/beelink/yujianAI` 部署并完成真实烟测。
使用独立 Compose project `yujian-p2`，不复用、不重启既有 `ai-phone-staging-*` 或
`livekit-qkxy-*` 容器。PostgreSQL 16.4、Redis 7.2.7-alpine、OpenBao 2.4.1 均固定 amd64
digest，服务绑定 127.0.0.1:15432/16379/18200，数据目录为 `data/p2`。

### Evidence

- 首次启动修复了非 root 镜像 UID 与 bind mount 权限；PostgreSQL/OpenBao/Redis 均 healthy。
- 修复 migration runner 文件名过滤缺少下划线的根因；`001` 至 `008` 共 8 条 migration 已应用。
- `npm ci`、platform-api build、`node --check` 通过；runtime module 已接入 PostgreSQL
  persistence/store/resource usage、Redis rate limiter/token quota、OpenBao webhook resolver、
  outbox worker 和 telemetry persistence。
- `tools/p2/runtime-smoke.mjs` 通过：PostgreSQL migration count=8、store 查询、Redis 原子
  counter、OpenBao 32-byte secret write/read/delete round-trip；runtime close hook 通过。
- 三服务 `compose restart` 后再次通过 health、8 条 migration、Redis adapter、KMS round-trip。
- 既有 5 个服务容器 restart count 保持 0；没有触碰 LiveKit/ai-phone 服务。

### Remaining P2 Work

P2 完整 Gate 仍未关闭：注册/邀请/SSO/onboarding、持久化 RBAC、API key rotate/revoke 的
端到端业务流、多副本限流竞争、Webhook 签名/重试/DLQ/requeue、PostgreSQL 备份恢复、Redis
重建、数据权利执行器和 owner 签字尚待完成。P1 完整 Gate 1 也仍保持未通过。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run build -w @yujian/platform-api
ssh beelink@100.110.127.117 'cd /home/beelink/yujianAI && ./infra/p2/beelink/deploy.sh status'
```

## 📌 SESSION HANDOFF STATUS — P2-06 crash-recovery hardening

### Current Work

2026-07-18 在不连接 Beelink 的前提下，完成 destructive data-rights 中断恢复加固。
新增 `010_data_rights_recovery.sql`：为请求增加 `processing_started_at`，并建立不含原始
subject 的 `data_rights_evidence_receipts` 持久账本。删除 executor 在事务内按 request ID
获取 advisory lock，将删除与 committed receipt 同时提交；进程在提交后退出时，
worker 可物化同一 receipt，不重复删除。

worker 存活时会 heartbeat 续租；进程退出后，默认 5 分钟过期的 `processing`
请求会回收为 `received`。验收脚本新增 post-commit crash 故障注入，并要求
PostgreSQL 备份恢复后 3 个 data-rights 请求、2 条 committed receipt 及 10 条
migration 均完整。

### Verification

- `npm run check`：全 workspace lint 通过，36 个单元/合同测试通过、0 失败。
- data-rights 3/3：正常删除+receipt 重放、evidence 不可写时删除前回滚、
  heartbeat/stale lease 回收。
- `npm run openapi:verify`：58/58 operationId 通过。
- private deployment upgrade preflight：`migrationCount=10`、`latestMigration=10`。
- P2 shell 语法、Node 验收 helper 语法和 `git diff --check` 通过。

### Production Acceptance Status

P2-06 仍为 **implementation-ready / not production-accepted**。migration 010、post-commit crash
恢复、隔离 `pg_dump` restore 和 Redis rebuild 都没有在 Beelink 上运行。P2-04/05/06
与完整 P2 Gate 继续为 **not-passed**，不用本地测试替代真实部署证据。

### Background Tasks

无。本轮未发起 SSH、未重启 Beelink、未操作其容器或数据。

### Next Session Priorities

1. 仅在用户确认 Beelink 恢复后，先审计宿主机/GPU/磁盘和中断运行残留。
2. 应用 migration 010，确认 10/10；不动 `ai-phone-staging-*` 和 `livekit-qkxy-*`。
3. 从 Mac 运行 `./tools/p2/run-closure-with-client.sh`，核验 receipt crash recovery、
   3 个 data-rights 请求恢复、backup checksum/RPO/RTO、Redis rebuild 与 protected restart count。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run check
npm run openapi:verify
# 只在用户确认 Beelink 恢复后：
./tools/p2/run-closure-with-client.sh
```

## 📌 SESSION HANDOFF STATUS — P2-05 outbox claim-ownership hardening

### Current Work

2026-07-18 在不连接 Beelink 的前提下，完成多副本 Webhook outbox 长投递续租加固。
新增 `011_outbox_claim_ownership.sql`，为 outbox 增加私有 `claim_token` 和
`claim_renewal_count`。`PostgresPlatformPersistence` 只在当前进程持有匹配 token 时允许
renew/published/failed；失去 ownership 的旧 worker fail closed，不能覆盖新 worker 状态。

`OutboxPublisher` 从批量领取完成起，对正在投递和同批排队事件持续 heartbeat，并在完成前
再次确认 ownership。验收脚本新增独立 350 ms 慢投递，使用 100 ms heartbeat，
要求同一 attempt 的 `claim_renewal_count >= 3`；随后再独立执行 partial retry、DLQ/
requeue 和 restart ledger 恢复。

语义边界仍为 at-least-once：接收方已成功但 delivery ledger 尚未提交时进程退出，
仍可能重投；接收方必须以 `x-yujian-event-id` 幂等去重，文档不声称 exactly-once。

### Verification

- `npm run check`：全 workspace lint 通过，38 个单元/合同测试通过、0 失败。
- platform-api 20/20：包含慢投递期间活动/排队 claim heartbeat 和 PostgreSQL claim token 一致性测试。
- `npm run openapi:verify`：58/58 operationId 通过。
- private deployment upgrade preflight：`migrationCount=11`、`latestMigration=11`。
- P2 shell/Node 语法和 `git diff --check` 通过。

### Production Acceptance Status

P2-05 仍为 **implementation-ready / partial-live-observed**。migration 011、慢投递 heartbeat、
claim ownership 丢失和 11 条 migration 恢复尚未在 Beelink 上运行。P2-04/05/06 与
完整 P2 Gate 继续为 **not-passed**。

### Background Tasks

无。本轮未发起 SSH、未重启 Beelink、未操作其容器或数据。

### Next Session Priorities

1. 仅在用户确认 Beelink 恢复后，应用 migration 010/011 并确认 11/11。
2. 从 Mac 运行 `./tools/p2/run-closure-with-client.sh`，检查慢投递 heartbeat count、
   retry/DLQ/requeue/restart ledger、data-rights receipt crash recovery 和 backup restore。
3. 只有完整脱敏报告、清理结果和 protected restart count 都通过后才关闭 P2。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run check
npm run openapi:verify
# 只在用户确认 Beelink 恢复后：
./tools/p2/run-closure-with-client.sh
```

## 📌 2026-07-18 P2 文档状态同步

- 将 P2-04 当前本地回归状态从过期的 platform-api 18/18 更新为 20/20。
- 将开发完成审计和 Helm preflight 文档中的当前 migration 范围从 001–008 更新为
  001–011，并将审计日期更新为 2026-07-18。
- 保留 2026-07-17 P2-01/02/03 Beelink production acceptance 的 8/8 migration 记录；这是
  当次真实运行证据，不用当前 11 条源码 migration 覆盖历史事实。
- 验证：`npm test -w @yujian/platform-api` 20/20 通过；migration 目录枚举为 001–011
  共 11 个文件；`git diff --check` 通过。
- 本次只同步文档，不改变 Gate 判定：P2-04/05/06 与完整 P2 Gate 仍为 **not-passed**。

## 📌 SESSION HANDOFF STATUS — P1-M0-03 upstream replay evidence guard

### Current Work

2026-07-18 在不连接 Beelink、不下载真实 mirror 的前提下，补齐 clean upstream patch replay
证据门禁。`replay-patch-queue.mjs` 不再只检查 patch 引用存在，而是在固定 component commit
的临时 checkout 中执行 `git apply --check` 和实际 apply，随后记录 base/result tree。

门禁要求 mirror 位于工作区外且为 origin 匹配的 clean bare repository；patch 必须绑定 manifest
component/base commit，并通过 metadata、SHA-256、review date、相对路径和 realpath 防逃逸检查。
成功或失败报告以原子 rename 写入 mode 0600 JSON，失败使用稳定错误码；`PATCH_CONFLICT`
不会被自动解决。临时 checkout 结束后必定删除，bare mirror 不被修改。

周度 upstream workflow 会归档 30 天 replay report。本地临时 Git fixture 同时验证了非空 patch
成功产生不同 result tree，以及上下文冲突 fail closed 并写出 `status=failed/PATCH_CONFLICT`。

### Verification

- `npm run verify:upstream:network`：11 个固定 LiveKit component 的 tag/commit/npm 解析通过。
- `npm run check`：新增 upstream replay 1/1、既有 workspace 38/38 均通过，lint 通过。
- `node --check`：replay 实现和测试语法通过。
- Ruby YAML parse：`.github/workflows/upstream-sync.yml` 通过。
- `git diff --check`：通过。

### Gate Status

P1-M0-03 为 **guard implemented / real evidence deferred**。本机不存在
`~/.cache/yujian/upstream`，本轮没有同步真实 LiveKit bare mirror，也没有执行各上游组件 clean
build，因此 Gate 0、完整 Gate 1 和 P2 完整 Gate 均保持 **not-passed**。

### Background Tasks

无。本轮未连接 Beelink，未修改 LiveKit、无界AI或其他旧项目，未启动后台同步。

### Next Session Priorities

1. 在 Beelink 或隔离 CI 外部目录首次同步真实 mirror，生成并归档 `status=passed` replay report。
2. 为各冻结组件定义可复现 clean build 子集和 artifact digest 报告，不把 mirror 存入 workspace。
3. 完成真实报告后再评估 P1-M0-03；随后推进 P1-M0-04 SBOM/签名/漏洞证据。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run verify:upstream
npm run verify:upstream:network
# 只在隔离 runner/Beelink 可用时：
YUJIAN_UPSTREAM_MIRROR_ROOT="$HOME/.cache/yujian/upstream" npm run upstream:mirror:sync
YUJIAN_UPSTREAM_MIRROR_ROOT="$HOME/.cache/yujian/upstream" \
YUJIAN_UPSTREAM_REPLAY_REPORT="outputs/p1/upstream-replay.json" npm run upstream:patch:replay
```

## 📌 SESSION HANDOFF STATUS — P2-01–06 Beelink/Mac production acceptance passed

### Current Work

2026-07-18 Beelink 恢复在线后，将语见 P2 持久化数据从系统盘迁移到大盘
`/data/models/yujianAI/p2`，并在 `/data/models/yujianAI/worktrees/p2-acceptance` 建立 detached
clean worktree。原 `/home/beelink/yujianAI/data/p2` 保留作回滚副本，没有修改无界AI或其他旧项目。

迁移暴露并修复两个真实恢复缺陷：

- `deploy.sh` 原先用无空格字符串匹配 OpenBao JSON，重启后误跳过 unseal；现改为 `jq`
  解析 `initialized`/`sealed` 布尔字段，恢复后 OpenBao 为 3 peers/3 voters。
- closure restore 查询把 psql `:'variable'` 放进 `-c`，变量没有展开；四条带参数查询改为
  stdin SQL + `-v` 安全绑定。Mac wrapper 同时在远端失败时输出最后 80 行日志。

最终双机 run `p2-closure-20260718051008-653ebfee` 完整通过：Beelink 为服务端，本机 Mac
以真实 RTC participant 入房；P2-04 OIDC/邀请/onboarding/持久 RBAC/IDOR/audit，P2-05
HMAC/retry/DLQ/requeue/restart/5 次 claim heartbeat，P2-06 data-rights/crash recovery、隔离
`pg_dump` restore 和 Redis 从 PostgreSQL 重建全部通过。

### Verification

- P2 PostgreSQL、Redis、OpenBao A/B/C：均 healthy；所有 bind mount 位于
  `/data/models/yujianAI/p2`，OpenBao 3 peers/3 voters。
- migration：001–011 共 11 条已在真实 PostgreSQL 应用；`deploy.sh smoke` 输出
  `postgres=ready`、`redis=ready`、`openbao=tls-raft-ha`。
- closure report：`/data/models/yujianAI/p2/reports/p2-closure-acceptance.json`，mode 0600；
  backup mode 0600、79,104 bytes、SHA-256 与报告一致，isolated restore RTO 896 ms。
- 独立清理复核：四组 scoped DB count 均为 0；KMS metadata HTTP 404；临时 restore DB、
  RTC probe 和 Redis rebuild key 均为 0。
- protected container restart count 在最终 run 前后 hash 一致；既有 LiveKit 容器仅执行
  `start`，未 recreate，restart count 为 0。`ai-phone-staging-agent` 在本轮外部自行累计过
  restart，本轮未操作该容器。
- Beelink `/data`：3.3T，总剩余约 2.2T；RTX 5090 当前可见，driver 595.71.05。
- 本地：两个修改后的 shell 脚本 `bash -n`、`git diff --check` 通过；双机完整脚本通过。

证据索引已同步到 `docs/acceptance/p2-closure-evidence.json`。M2/P2-01–06 技术验收为
**passed**；正式 Gate 2 仍等待 Gate 0/1、`data-owner`/`security-owner`/`platform-owner`
签字、跨主机 HA、auto-unseal 和生产 KMS 合规评审，不将技术通过写成公网发布批准。

### Background Tasks

- Beelink `yujian-p2` 的 PostgreSQL、Redis、OpenBao A/B/C 持续运行。
- 既有 `livekit-qkxy-livekit-1` 与 `livekit-qkxy-redis-1` 已启动供 RTC 服务使用。
- 没有遗留验收进程、临时数据库、RTC probe 或未完成 cleanup。

### Next Session Priorities

1. 使用 `/data/models/yujianAI` 的隔离目录完成 P1-M0-03 真实 LiveKit bare mirror replay 和
   clean build 证据，不写入项目 worktree。
2. 补齐 P1-M0-04 SBOM/签名/漏洞 evidence、nightly sandbox 与 owner 签字。
3. Gate 0/1 和正式 Gate 2 条件关闭后，再进入 P3/M3 的真实 TURN/弱网及 24/72 小时稳定性。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
ssh beelink@100.110.127.117 \
  'cd /data/models/yujianAI/worktrees/p2-acceptance && git rev-parse HEAD'
ssh beelink@100.110.127.117 \
  'cd /data/models/yujianAI/worktrees/p2-acceptance && \
   YUJIAN_DATA_ROOT=/data/models/yujianAI \
   YUJIAN_P2_ENV_FILE=/data/models/yujianAI/p2/runtime.env \
   ./infra/p2/beelink/deploy.sh status'
```

## 📌 SESSION HANDOFF STATUS — P1-M0-03 real upstream evidence passed

### Current Work

2026-07-18 在 Beelink 大盘建立隔离 clean worktree
`/data/models/yujianAI/worktrees/p1-upstream`（commit
`cc93a95ba707cbd33b29975fc2bf882e2f1f698b`），没有修改 `/home/beelink/yujianAI`、
无界AI 或其他项目。真实上游 mirror、build 和 evidence 分别位于：

- `/data/models/yujianAI/upstream-mirrors`；
- `/data/models/yujianAI/upstream-builds/p1-clean-20260718135102`；
- `/data/models/yujianAI/evidence/p1`。

10 个唯一 LiveKit bare repository 已同步并通过 `git fsck --connectivity-only`；
11 个 manifest component 的真实 patch replay 报告为 `status=passed`，patch/conflict
均为 0，manifest SHA-256 为
`42b0b74098cf1845b8b0979f5de5371df36c5253f74fbeda1245191aafde3f1f`。

clean build 覆盖 Server、Protocol Go/JS、SIP、Ingress、Egress、Python/Node Agent
core、Node Server/RTC SDK、Web SDK 和 Flutter SDK 根包。可生成产物均执行两次并
通过逐字节或逐文件 SHA-256 对比；主要结果索引为
`docs/acceptance/p1-upstream-evidence.json`。Egress 模板使用源码声明的
`sha-594b3b1`/amd64 digest，Git LFS 示例资产和 Agent provider 插件不在核心包
构建范围。

Flutter 真实检查暴露了上游最低版本声明偏差：3.27.3 的 `path 1.9.0`、
3.32.8 的 `meta 1.16.0` 不满足当前 pubspec，3.38.9 能解析源码但不匹配冻结
lockfile。最终按官方归档 SHA-256 固定 Flutter 3.44.0/Dart 3.12.0，根包
`pub get --enforce-lockfile --no-example`、`analyze --no-pub lib test` 通过，测试为
260 passed/1 skipped，两次依赖图 SHA-256 均为
`8fcfcbbb0135f6fc4eb3dfb55a4fbc304de6abc57bbe43f2b0b3dec22ef1d346`。上游未提交
lockfile 的 `example/` 明确排除，未生成或改写任何上游跟踪文件。

### Verification

- `upstream-replay.json`：4,221 bytes、mode 0600、`status=passed`。
- `clean-build-report.json`：10,210 bytes、mode 0600，SHA-256
  `01da09189cdf16ad5b1908bc65d74581af6bde8d44514bfc6e6b47260bd46ae6`。
- Flutter 最终日志：2,021,504 bytes、mode 0600；analyze 无问题、全部根测试通过。
- Server/SIP/Ingress/Egress 分别生成静态或依赖完整的 linux/amd64 ELF；
  动态依赖在按 digest 固定的构建镜像中无 `not found`。
- 工具链 Dockerfile 已在 Beelink 真实构建；本轮新增的 GStreamer/模板/辅助镜像
  引用已定向删除，没有执行全局 Docker prune。
- 失败的 Flutter 3.27/3.32/3.38 工具链目录已删除；最终 3.44.0 工具链保留在
  `/data`，约 3.7G。

### Gate Status

P1-M0-03 的真实 mirror/replay/clean-build **运行证据缺口已关闭**；该任务仍等待
`rtc-owner`/`release-owner` 审批、fork 权限和差异通知演练。M0/M1 仍为
partial，正式 Gate 0/1 仍为 **not-passed**；M2/P2-01–06 技术验收状态不变。

### Background Tasks

- Beelink 现有 P2 PostgreSQL/Redis/OpenBao 和 LiveKit 容器保持原状，本轮未重启/
  recreate。
- 无遗留 build/pull 进程或临时构建容器。
- bare mirror、构建产物、缓存、Flutter 3.44.0 和脱敏报告持续位于 `/data`。

### Next Session Priorities

1. 推进 P1-M0-04：当前镜像 SBOM、签名验证、漏洞门禁和法律/owner 证据。
2. 执行 nightly sandbox 真实租户隔离/凭据销毁/自动清理证据。
3. 补 iOS/Android/Python、TURN/弱网/reconnect、视频/屏幕和质量指标，不将 clean
   build 扩大成 RTC 运行兼容通过。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
ssh beelink@100.110.127.117 \
  'jq ".status, .gate" /data/models/yujianAI/evidence/p1/clean-build-report.json'
ssh beelink@100.110.127.117 \
  'jq ".status, .summary" /data/models/yujianAI/evidence/p1/upstream-replay.json'
ssh beelink@100.110.127.117 \
  'df -h /data && docker ps --format "{{.Names}} {{.Status}}"'
```

## 📌 SESSION HANDOFF STATUS — P1-M0-04 candidate scan complete, no runtime switch

### Current Work

2026-07-18 按用户授权，在 Beelink 只拉取并扫描 Redis/PostgreSQL/OpenBao
补丁候选，没有启动候选容器、修改 Compose 或切换 P2 运行服务。候选 run id
为 `p1-m0-04-candidates-20260718T084500Z`，原始证据位于
`/data/models/yujianAI/evidence/p1-m0-04/p1-m0-04-candidates-20260718T084500Z`。

候选范围由 `infra/upstream/p1-image-candidates.json` 按 Linux AMD64 registry digest
冻结，且 `deploymentAllowed=false`。候选 run 与当前镜像 run 使用同一 Grype DB
快照（schema `v6.1.9`、built `2026-07-18T06:48:35Z`、SHA-256
`5df41e43b3ea4ca0f405b12484f9f4ef6ee55c5d5f672fdf4346d206c4d72b73`）。

### Verification and Findings

- Redis 7.2.14-alpine：21 包，High 0、Critical 0，3 个 `NOASSERTION`；
  `eligible-for-regression`，不是 deployment approval。
- PostgreSQL 16.14-bookworm：149 包，High 61、Critical 27，26 个
  `NOASSERTION`；阻断。
- PostgreSQL 16.14-alpine 备选：51 包，High 18、Critical 1，6 个
  `NOASSERTION`；唯一 Critical 为 `gosu` 内置 Go stdlib，同时从 Debian 改为
  Alpine，仍阻断。
- OpenBao 2.5.4：354 包，High 36、Critical 13，329 个 `NOASSERTION`；
  2.4→2.5 跨次版本且仍阻断。
- 两个 PostgreSQL 选项互斥；候选证据中的 41 Critical 合计只用于对比，
  不代表一个可部署组合。
- 原始候选证据共 28 个文件，全部 mode `0600`；Cosign 原生验签和
  仓库 verifier 均通过。机器可读索引为
  `docs/acceptance/p1-supply-chain-candidate-evidence.json`。
- `npm run test:supply-chain` 8/8 通过；当前/候选 evidence verifier 均通过结构
  校验；`P1_M0_04_REQUIRE_PASS=true` 按预期失败关闭；`npm run check`
  通过（workspace 38/38，upstream replay 1/1）。
- 四类个人 Owner 的资格、职责分离和待填字段已固化到
  `docs/governance/P1_M0_04_OWNER_NOMINATION.md`；自然人姓名、联系方式、
  任命日期和批准人仍等待用户提供，未伪造指派或签字。

### Runtime Safety Check

2026-07-18 复核时，Beelink `/data` 容量 3.3T，可用 2.2T。P2 Redis 仍运行
`redis:7.2.7-alpine@sha256:1de7...`，PostgreSQL 仍运行
`postgres:16.4@sha256:9a70...`，OpenBao 三节点仍运行
`openbao/openbao:2.4.1@sha256:06a26...`；五个 P2 容器全部 healthy/running、
`restartCount=0`。未发现遗留 Syft/Grype/Cosign/扫描 runner 任务。

### Gate Status

P1-M0-04 仍为 **blocked**。Redis 候选只获得“可进入回归”结论，不改变
当前镜像、固定 digest 或 Gate 状态。PostgreSQL/OpenBao 候选未达零 Critical；
当前镜像仍有 76 Critical 和 465 个 license `NOASSERTION`，且生产 registry
签名与四类实名 Owner 未完成。Gate 0/1、Gate 7 和生产发布保持未通过。

### Background Tasks

- 无本轮遗留的 pull、Syft、Grype、Cosign 或 evidence runner 进程。
- 候选镜像仅缓存在 Beelink Docker image store，没有候选容器。

### Next Session Priorities

1. 由用户提供 `security-owner`、`release-owner`、`legal-owner`、
   `compliance-owner` 的自然人实名及联系/批准信息，再完成任命记录。
2. 只有在用户另行授权启动候选测试容器后，才对 Redis 7.2.14-alpine
   执行多客户竞争、quota、重启和重建回归。
3. 不部署 PostgreSQL/OpenBao 候选；继续寻找或重建零 Critical 镜像，或由
   实名 `security-owner` 对 advisory 逐项决策。
4. 继续补齐 LICENSE/NOTICE 和生产 OCI registry 签名设计，再生成新的当前镜像 run。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run test:supply-chain
npm run supply-chain:verify-image-evidence
npm run supply-chain:verify-candidate-evidence
P1_M0_04_REQUIRE_PASS=true npm run supply-chain:verify-image-evidence  # 当前必须失败关闭
ssh beelink@100.110.127.117 \
  'R=/data/models/yujianAI/evidence/p1-m0-04/p1-m0-04-candidates-20260718T084500Z; jq . "$R/run-result.json"; docker ps --filter label=com.docker.compose.project=yujian-p2 --format "{{.Names}} {{.Image}} {{.Status}}"'
```

## 📌 SESSION HANDOFF STATUS — P1-M0-04 evidence complete, gate blocked

### Current Work

2026-07-18 在 Beelink `/data/models/yujianAI` 对语见当前固定的 4 个 Linux AMD64
镜像执行真实供应链验收，run id 为 `p1-m0-04-20260718T074700Z`。范围由
`infra/upstream/p1-image-scope.json` 冻结：LiveKit Server v1.13.3、Redis 7.2.7、
PostgreSQL 16.4、OpenBao 2.4.1。`ai-phone-*` 不属于本仓库范围；平台 API 当前没有
已部署发布镜像，未把源码验收冒充镜像证据。

Syft 1.48.0、Grype 0.116.0、Cosign 3.1.2 均从官方 release 获取并按官方 checksum
校验，二进制保存在 `/data/models/yujianAI/toolchains/supply-chain`。每个镜像已生成
SPDX 2.3 和 Grype JSON；Grype DB schema `v6.1.9`、built
`2026-07-18T06:48:35Z`，数据库 SHA-256 为
`5df41e43b3ea4ca0f405b12484f9f4ef6ee55c5d5f672fdf4346d206c4d72b73`。

聚合声明包含固定 registry digest、本地 image id、SBOM/scan/tool hash，由加密工程
证据密钥使用 Cosign v3 签名；私钥位于 evidence 根之外，报告只复制公钥。原生 Cosign
验签和仓库 `verify-signature.mjs` bundle 入口均返回 `Verified OK`。statement SHA-256
为 `f0582da7b0a3214d6778e2ccd0499b820aef1f9d035f43e73441bcb9b119db99`，bundle
SHA-256 为 `d7dd846d72882161f15d7639bf3d679e54f6acc893638ce112ecc010954a21bc`。

### Verification and Findings

- 4 份 SPDX 共 647 个包；原始报告及仓库验签日志共 28 个文件、约 12M，全部 mode `0600`。
- LiveKit：137 包，High 1、Critical 0，单镜像阈值通过。
- Redis：23 包，High 82、Critical 11，阻断。
- PostgreSQL：149 包，High 210、Critical 42，阻断；Critical 中 16 fixed、12
  not-fixed、14 wont-fix。
- OpenBao：338 包，High 87、Critical 23，阻断。
- 合计 76 个未豁免 Critical 匹配；没有创建任何例外或降低零 Critical 阈值。
- 647 个包中 465 个 `licenseDeclared=NOASSERTION`，因此 THIRD_PARTY_NOTICES 仍不是
  最终法律清单。
- `npm run test:supply-chain` 4/4 通过；普通 evidence verifier 可验证失败报告结构；
  `P1_M0_04_REQUIRE_PASS=true` 会在 release preflight 中失败关闭。
- 机器可读脱敏索引为 `docs/acceptance/p1-supply-chain-evidence.json`，Owner/法律评审为
  `docs/compliance/P1_M0_04_SUPPLY_CHAIN_REVIEW.md`。

### Gate Status

P1-M0-04 的“真实执行和证据归档”已经完成，但技术门禁为 **blocked**，不能称为任务
通过。阻断项是 76 个未豁免 Critical、465 个许可证 `NOASSERTION`、缺少语见控制的
OCI registry 发布签名，以及 `security-owner`、`release-owner`、`legal-owner`、
`compliance-owner` 个人负责人和签字。正式 Gate 0/1、Gate 7 和生产发布保持未通过；
M2/P2-01–06 技术验收状态不变。

### Background Tasks

- 本轮没有重启、recreate 或改写 P2 PostgreSQL/Redis/OpenBao、LiveKit 或 ai-phone 容器。
- Cosign 容器拉取因网络慢已中止，实际证据使用 checksum 校验的单文件二进制；无遗留
  pull/scan 进程。
- 加密工程证据私钥留在 `/data/models/yujianAI/secrets/p1-m0-04`，mode `0600`；不得
  提交仓库，也不得冒充生产 release identity。

### Next Session Priorities

1. 经用户授权后只拉取 Redis/PostgreSQL/OpenBao 候选补丁镜像并扫描，不先切换运行容器。
2. 候选通过后分别执行 Redis 竞争/重建、PostgreSQL 备份恢复/migration、OpenBao
   Raft snapshot/TLS/HA 回归，再申请变更固定 digest。
3. 补齐 465 个许可证归属、最终 LICENSE/NOTICE、registry 签名方案和四类个人 Owner。
4. 重跑 P1-M0-04，要求未豁免 Critical 为 0，再继续 nightly sandbox 与 SDK/媒体矩阵。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run test:supply-chain
npm run supply-chain:verify-image-evidence
P1_M0_04_REQUIRE_PASS=true npm run supply-chain:verify-image-evidence  # 当前必须失败关闭
ssh beelink@100.110.127.117 \
  'R=/data/models/yujianAI/evidence/p1-m0-04/p1-m0-04-20260718T074700Z; \
   jq . "$R/run-result.json"; jq -r ".[] | [.id,.vulnerabilityScan.counts.critical,.vulnerabilityScan.gate] | @tsv" "$R/images.json"'
ssh beelink@100.110.127.117 \
  'df -h /data && docker ps --format "{{.Names}} {{.Status}}"'
```

## 📌 SESSION HANDOFF STATUS — P1-M0-04 personal Owners named, signoff pending

### Current Work

2026-07-18 用户已指定 P1-M0-04 四类个人 Owner：`security-owner=aaa`、
`release-owner=bbb`、`legal-owner=ccc`、`compliance-owner=ddd`，任命批准人为
`eee`。任命日期按当前会话日期记录为 2026-07-18。

`docs/governance/OWNERS.md`、`docs/governance/P1_M0_04_OWNER_NOMINATION.md`、
供应链评审、计划/审计和两份机器可读 evidence JSON 已同步。候选与当前
evidence verifier 已扩展为校验实名 Owner、任命批准人和任命日期。

### Evidence Boundary

- 用户未提供四位 Owner 的联系方式或备份人，对应字段保持 `null`/“待补”。
- 未获取 aaa/bbb/ccc/ddd 各自的本人确认或对漏洞、LICENSE/NOTICE、合规、
  registry 签名的专业决定，因此状态是 `assigned-pending-signoff`。
- 任命信息是仓库治理记录，不改写 Beelink 原始 SPDX/Grype/Cosign 扫描产物。
- 本轮没有拉取镜像、运行候选容器、切换 P2 服务或修改 Beelink 数据。

### Verification

- `npm run test:supply-chain` 10/10 通过，包含实名 Owner 任命元数据和待签状态校验。
- 当前镜像与候选镜像 evidence verifier 通过。
- `npm run check` 通过：workspace 38/38，upstream replay 1/1。
- `P1_M0_04_REQUIRE_PASS=true` 仍按预期报 `release gate is not passed`，证明实名指定没有绕过发布门禁。

### Gate Status

P1-M0-04、Gate 0/1、Gate 7 和生产发布继续 **blocked**。四类 Owner 的
“个人姓名未指定”缺口已转为“联系/备份/本人确认与专业签字待补”；
当前镜像 76 Critical、465 `NOASSERTION`、PostgreSQL/OpenBao 候选 Critical 和
生产 OCI registry 签名缺口都未因任命而改变。

### Next Session Priorities

1. 补齐 aaa/bbb/ccc/ddd 的联系方式、备份人和本人书面确认。
2. 由 aaa 对 Critical/High advisory 和可能 VEX 逐项决策。
3. 由 ccc/ddd 对 LICENSE/NOTICE、商标和中国分发适用性签字。
4. 由 bbb 确定生产 OCI registry 签名身份、密钥轮换、归档和回滚方案。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run test:supply-chain
npm run supply-chain:verify-image-evidence
npm run supply-chain:verify-candidate-evidence
P1_M0_04_REQUIRE_PASS=true npm run supply-chain:verify-image-evidence  # 仍必须失败关闭
```
