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

## 📌 SESSION HANDOFF STATUS — M3 收口、M4 Agent 与 M5 媒体 Runtime 开发完成，运行待执行

### Current Work

2026-07-19 按“开发完毕、测试先略过”继续完成以下源码切片：

- M3-05/09/10：九格运营商采样 policy、24/72 小时 append-only runner、不可把 partial 当 pass
  的证据 verifier，以及设计伙伴 version CAS、P0/P1 自动暂停和关闭门禁。真实运营商、客户、
  长稳与故障注入未执行。
- M4-01–10：exact OCI artifact verification receipt、canary/rollback reconciler、Redis Cluster
  dispatch quota/rebuild、workload identity 短期 provider credential、OpenAI-compatible usage、
  PostgreSQL 数值成本、tool approval/KMS 密文结果、Node/Python 取消传播、Agent 网络策略、
  alert/dashboard 和 quickstart。源码 migration 新增 013。
- M5-01–10：独立 provider callback credential、部署侧 edge-attestation verifier、provider
  sequence/乱序保护、safe trunk/KMS ref/目的地区/fraud policy、Redis SIP 频率/并发/日费用和
  Ingress/Egress active capacity；入呼只采用不主动 dial，外呼/DTMF/transfer/hangup 状态与租约
  闭环；URL ingress SSRF guard、录制合规回执、稳定 object URI、retention/deletion evidence；
  provider usage 不可变写入、确定性 reconciliation/CAS checkpoint、SIP PDD/接通时长/DTMF
  摘要、provider allowlist metrics；platform-api entitlement/quota/audit 和控制台媒体入口。
- migration 014 清除 002 表 legacy raw idempotency key，安全迁移 trunk 完整号码为不可逆 refs，
  新增媒体账务/质量/checkpoint。所有“当前源码”预检、备份默认值和审计索引已同步到 001–014；
  历史 001–011 Beelink 证据未改写。
- M5 状态已写入 `docs/acceptance/M5_MEDIA_RUNTIME_IMPLEMENTATION.md` 和
  `docs/acceptance/m5-media-runtime-implementation.json`；Gate 5 仍为 false。

### Verification Boundary

用户明确测试先略过。本阶段未运行 build、lint、任何单元/集成/合同测试、OpenAPI/YAML/JSON
verifier、migration 013/014、Helm render/lint、Docker/Kubernetes、Redis/PostgreSQL/OpenBao、
LiveKit SIP/Ingress/Egress、运营商/SBC、对象存储、provider/KMS、Prometheus/Grafana、浏览器或
Beelink 命令。新增测试只作为待执行合同，不能视为通过证据。

### Gate Status

- M3、M4、M5 的开发状态均为 `implemented-not-run`。
- Gate 3/4/5 未通过，`productionReleaseAuthorized=false`。
- SIP/Egress 必须继续默认关闭；真实运营商合作、资质/法务签字、SBC/TLS/SRTP、号码、录音
  告知、对象删除、provider 账单/质量和灾备证据不可由源码替代。
- bbb Registry/KMS sequence 1 reject、ccc legal sequence 1 reject 及 Gate 0/1/7 既有阻断保持有效。

### Background Tasks

- 本轮未启动本机或 Beelink background process。
- 未探测、停止、重启或修改 Beelink 服务。

### Next Session Priorities

1. 测试继续暂停时进入 M6：Operator/安装升级回滚、完整离线 bundle、国内 KMS/对象存储/日志、
   SAML/SCIM/审计导出、license 签发/分发、巡检/远程协助、国内模型 provider 和客户验收报告。
2. M6 收口后进入 M7：账单结算、区域故障、SLO/on-call、安全/数据权利、LTS/status、RC/GA gate。
3. 只有用户恢复测试授权后，才执行 Node 22/24 build/test/OpenAPI/migration/Helm，再安排
   Beelink `/data` 的真实 provider/HA/媒体/Agent/24–72 小时验收。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short
cat docs/acceptance/m5-media-runtime-implementation.json
sed -n '1,260p' docs/planning/DEVELOPMENT_COMPLETION_AUDIT.md
sed -n '1,260p' infra/helm/yujian-platform/README.md
# 测试仍暂停时不要执行 npm test/check/build、verifier、migration、Helm、Docker、Kubernetes 或 Beelink 命令。
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

## 📌 SESSION HANDOFF STATUS — Redis candidate regression passed, deployment not approved

### Current Work

2026-07-18 经用户授权，在 Beelink 对零 Critical 的
`redis:7.2.14-alpine@sha256:dfa188...` 候选执行了真实隔离回归。正式 run id 为
`p1-m0-04-redis-regression-20260718T101047Z`，原始报告位于：

`/data/models/yujianAI/evidence/p1-m0-04/p1-m0-04-redis-regression-20260718T101047Z/report.json`

report SHA-256 为
`b52848641e435b69302275e0d042f5ce4779226855d8c6d46c7ea4067dfd66bd`。测试数据使用独立目录：

`/data/models/yujianAI/p1-m0-04/redis-candidate/p1-m0-04-redis-regression-20260718T101047Z`

测试 runner 固化为 `tools/supply-chain/redis-candidate-regression.mjs` 和
`tools/supply-chain/run-redis-candidate-regression.sh`；SHA-256 分别为
`b11aed1ae428e63a12b7c3bcaff33912c326840e73bea997ebc267af66b89e78`、
`4b73c88cfcfab37ce04b4d7795314436a071790396ce641bcd41f651b095530c`。

### Verification and Findings

- 候选容器仅绑定 loopback 随机端口，限制为 512 MiB、1 CPU、256 PIDs；未接入当前
  Compose，也未访问 P2 Redis 数据目录。
- 初始、容器重启、容器删除重建三个阶段均执行两客户端竞争：100 次限流恰好允许 20 次，
  30 次 Token quota 恰好成功 3 次，释放无泄漏，租约保持单 owner 并可转移。
- 初始阶段写入 AOF marker，`WAITAOF` 返回本地确认；marker 在重启和删除重建后均恢复，
  最终清理后 DB size 为 0。
- 首次功能 run 通过后发现测试数据目录仍由容器 UID 999 所有。根因是候选 volume 初始化
  后没有恢复宿主机 owner；runner 已在正常和失败清理路径按固定候选镜像恢复宿主 UID/GID、
  目录 `0700`、文件 `0600`，并以本节正式 run 重跑。首次 run 已标记为被正式 run 取代。
- 正式证据文件全部 mode `0600`；数据目录 owner 为 `beelink:beelink`，文件 mode `0600`。
- 候选容器已删除。受保护的 `yujian-p2-redis-1` 容器 ID 前后均为
  `77956da2cbca...`，仍运行固定 Redis 7.2.7 digest，状态 `running/healthy`，
  `restartCount=0`。`/data` 仍有约 2.2T 可用。
- 候选 evidence JSON 已加入三阶段摘要、报告/runner hash、隔离和未授权部署边界；verifier
  会拒绝 Critical 候选携带回归、错误竞争结果或把 `deploymentApproval` 写成 approved。
- `npm run test:supply-chain` 11/11 通过；当前镜像和候选 evidence verifier 均通过结构
  校验；`P1_M0_04_REQUIRE_PASS=true` 仍按预期报 `release gate is not passed`。
- `npm run check` 通过：workspace 38/38，upstream replay 1/1；`bash -n`、`node --check`、
  `jq empty` 和 `git diff --check` 均通过。

### Gate Status

Redis 候选状态由 `eligible-for-regression` 更新为
`regression-passed-awaiting-deployment-approval`，但没有修改固定 manifest、Compose 或当前
运行容器。P1-M0-04、Gate 0、完整 Gate 1、Gate 7 和生产发布仍为 **blocked/not-passed**：
当前固定镜像仍有 76 Critical 和 465 个 license `NOASSERTION`；PostgreSQL/OpenBao 候选
仍有 Critical；生产 OCI registry 签名、四类 Owner 联系/备份/本人专业签字和
`release-owner` bbb 的 Redis 发布决定尚未完成。

### Background Tasks

- 无候选容器、临时 worktree、扫描或回归进程遗留。
- 当前 P2 Redis/PostgreSQL/OpenBao 服务未因本轮测试重启或重建。

### Next Session Priorities

1. 由 bbb 基于候选 digest、回滚方案和生产 registry 签名明确批准或驳回 Redis 发布；
   未批准前不得切换当前 Redis。
2. 为 PostgreSQL/OpenBao 寻找或重建零 Critical 候选，未过安全门禁前不启动候选部署回归。
3. 补齐 465 个许可证归属、最终 LICENSE/NOTICE，以及 aaa/ccc/ddd 的专业评审和四类 Owner
   联系/备份/本人确认。
4. 只有发布决定和前置门禁完成后，才修改固定 digest、执行 canary/回滚并重跑当前镜像
   SBOM、漏洞和 registry 签名证据。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run test:supply-chain
npm run supply-chain:verify-image-evidence
npm run supply-chain:verify-candidate-evidence
P1_M0_04_REQUIRE_PASS=true npm run supply-chain:verify-image-evidence  # 仍必须失败关闭
ssh beelink@100.110.127.117 \
  'R=/data/models/yujianAI/evidence/p1-m0-04/p1-m0-04-redis-regression-20260718T101047Z; \
   sha256sum "$R/report.json"; jq "{status,persistence,isolation,gate}" "$R/report.json"; \
   docker inspect yujian-p2-redis-1 --format "{{.Id}} {{.Config.Image}} {{.State.Status}} {{.State.Health.Status}} {{.RestartCount}}"'
```

## 📌 SESSION HANDOFF STATUS — PostgreSQL/OpenBao zero-Critical rebuild complete; Owner/OCI decisions pending

### Current Work

2026-07-18 已为 P1-M0-04 建立 bbb Redis 决定合同、PostgreSQL/OpenBao 可复现安全重建、
LICENSE/NOTICE 载荷、生产 OCI fail-closed 签名工具和四类 Owner 专业签字合同。没有切换、
重启或重建当前 P2 服务。

- bbb Redis 记录：`docs/acceptance/p1-redis-release-decision.json`，状态
  `awaiting-explicit-decision`，`deploymentAuthorized=false`。扫描/回归为真，回滚接受、
  registry 冻结、生产签名和 bbb 本人签字仍为 false。
- 最终安全重建 run：`p1-m0-04-remediated-build-20260718T105917Z`。
  PostgreSQL image ID 为 `sha256:dc6f20504a5a693df299ede952a30852afeb3799a2013ef323625363e32291e4`；
  OpenBao image ID 为 `sha256:7777335318370ad73ddf719e9245f8b60b28c71b7858184d48cfdeb4747e8fa0`。
- 最终复扫 run：`p1-m0-04-remediated-scan-20260718T110222Z`；两镜像合计 Critical 0、
  High 3、license `NOASSERTION` 335。工程 statement SHA-256 为
  `2dd99bfeb481c14be1195da2b88e5503e4df8bfada86a4b09969f6ddc3ec7cb4`，bundle SHA-256
  为 `f492a8dcd6e5435c3bd57a82722d755a5b4e96fae6f8528b0b9712db1d91facc`，验签通过。
- High 未豁免：两处 `GO-2026-4970`（Go 1.25.11，修复 1.25.12）及 OpenBao 的
  `GO-2026-5026`（x/net 0.54.0，修复 0.55.0），等待 aaa 逐项专业决定。
- 镜像内许可证 hash 已实测：PostgreSQL
  `3d6af92ff8a4c2cdf69afb1cf44edea727922f5cd0cf8b5f72b11cdecac8fdfd`、gosu
  `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`、OpenBao MPL-2.0
  `d6b1a865f1c8c697d343bd4e0ce61025f91898486a1f00d727f32e8644af77d3`、OpenBao dependencies
  `f4293107047228ac15cdf62b2054ff04ba55a22887406fbcc6b6aa564e469bd9`。
- Owner 签字合同：`docs/acceptance/p1-m0-04-owner-signoffs.json`，四位状态均为
  `awaiting-personal-signature`，不能由 AI/eee 代签。签字 verifier 会拒绝 unsigned approval、
  不完整前置条件及任何签字后的 reject 被解释为发布批准。
- 生产 OCI 工具：`tools/supply-chain/sign-production-oci.sh`。只接受批准 registry 的 digest
  reference、SPDX 2.3 和 OpenBao/KMS managed key URI，并完成 sign/attest/fresh-pull/verify；
  结果仍固定 `releaseAuthorized=false` 等待 bbb。当前未执行，因为 bbb 未冻结 repository，
  本机 GitHub token 无 `write:packages`，且未提供生产 KMS/OpenBao key URI。

### Verification

- `npm run test:supply-chain`：23/23 通过。
- 当前、官方候选、安全重建、Redis 决定和 Owner 签字五组 verifier 均通过；均保持
  deployment/release fail-closed。
- `npm run check` 通过：upstream replay 1/1，workspace 38/38。
- `bash -n`、`node --check`、全部相关 JSON `jq empty`、`git diff --check` 和 secret pattern
  检查通过。
- Beelink `/data` 可用约 2.2T；当前 P2 PostgreSQL、Redis、OpenBao A/B/C 均
  `running/healthy`、`restartCount=0`，容器 ID 与构建/扫描前一致。

### Gate Status

安全重建候选的 Critical 阈值通过，但它们仍是 `local-pre-registry`，不是生产 registry
digest。当前运行镜像仍为旧固定版本并有 76 个 Critical。由于 3 个 High、335 个
`NOASSERTION`、PostgreSQL/OpenBao 运行回归、bbb Redis 决定、生产 OCI 签名及
aaa/bbb/ccc/ddd 本人专业签字未完成，P1-M0-04、Gate 0、完整 Gate 1、Gate 7 和生产发布
继续 **blocked/not-passed**。

### Background Tasks

- 无构建、扫描、候选容器或临时测试进程遗留。
- 本轮安全重建镜像仅保存在 Beelink 本地；未推送 registry，未修改 P2 Compose/manifest。

### Next Session Priorities

1. bbb 在 Redis 决定 JSON 中本人明确 `approve` 或 `reject`；批准仍须先补 registry、回滚和
   生产验签前置条件。
2. bbb 冻结生产 OCI repository 与 OpenBao/KMS key URI后，推送 digest 并执行
   `sign-production-oci.sh`；不得用工程证据密钥代替生产身份。
3. aaa 逐项决定 3 个 High；ccc/ddd 对实际 LICENSE/NOTICE、OpenBao source offer、中国
   分发形态签字。
4. 安全决定允许后，对 PostgreSQL 执行 backup/restore、migration 001–011、outbox/CAS；
   对 OpenBao 执行 2.4→2.5 Raft snapshot/TLS/HA/API-key 回归。
5. 只有上述前置条件完成后才修改当前固定 manifest、执行 canary/回滚并重跑当前镜像证据。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run test:supply-chain
npm run supply-chain:verify-remediated-evidence
npm run supply-chain:verify-redis-decision
npm run supply-chain:verify-owner-signoffs
npm run check
ssh beelink@100.110.127.117 \
  'R=/data/models/yujianAI/evidence/p1-m0-04/p1-m0-04-remediated-scan-20260718T110222Z; \
   jq "{runId,status,summary}" "$R/signing-statement.json"; \
   docker inspect yujian-p2-postgres-1 yujian-p2-redis-1 yujian-p2-openbao-a-1 \
     yujian-p2-openbao-b-1 yujian-p2-openbao-c-1 \
     --format "{{.Name}} {{.Id}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}} {{.RestartCount}}"'
```

## 📌 SESSION HANDOFF STATUS — P1-M0-04 production OCI technical closure complete; personal decisions pending

### Current Work

2026-07-18 已修复原安全重建中的 3 项 High，并在 Beelink `/data` 完成真实私有 Registry、
OpenBao KMS OCI 签名、SPDX attestation 和外部客户端读取验证。技术链路通过，但没有代替
aaa/bbb/ccc/ddd 本人签字，也没有切换当前 P2 运行镜像。

- 最终 PostgreSQL/OpenBao build run：`p1-m0-04-remediated-build-20260718T115740Z`；最终 scan
  run：`p1-m0-04-remediated-scan-20260718T120238Z`。两镜像合计 Critical 0、High 0，
  `NOASSERTION` 335；工程 statement SHA-256 为
  `a7f9d159d2a27dd2727afd523ccd1204f46d4cf8a1d53354539b46348e1417ea`。
- 官方 Distribution 3.1.1 镜像被当前 Grype DB 检出 Critical 10/High 20，未部署；固定源码
  commit `9a8d98b...` 使用 Go 1.25.12、x/crypto 0.52、x/net 0.55 最小重建后为
  Critical 0/High 0。最终 Registry build run 为 `registry-build-20260718T121700Z`，运行
  image ID `sha256:a6757e5a...`。
- Registry 为 `beelink.tail1e9cec.ts.net:5443`，只绑定 `100.110.127.117:5443`，Tailscale
  TLS + bcrypt；未认证 401、认证 200。证书到期时间为 2026-10-11，后续须加入续期/reload。
- OpenBao key URI 为 `openbao://yujian-oci-release`，ECDSA P-256、不可导出、禁止明文备份；
  scoped policy 仅允许读取该 key 及签名子路径。Cosign 通过 TLS 验证连接，公钥 SHA-256 为
  `5f362c145a7b75f9fb28d9860952dbd67240e8f20238476450a88e51aef9492e`。
- Redis、PostgreSQL、OpenBao、Registry 四个私有 registry digest 已完成 Cosign 签名和
  SPDX attestation；四份 `result.json` 均为 signature/attestation verified、
  `releaseOwnerDecision=pending-bbb`、`releaseAuthorized=false`。
- 本机 `MacBook-Air-5.local` 通过 Registry v2 API、TLS 和认证重新读取 4 个 manifest、
  44 个 config/layer blob，全部 SHA-256 匹配。外部证据 SHA-256 为
  `2fb355037ed58cf4a9c8cc6fbe1f0dc556ece7466b74d3d9d2056db33919e7de`。
- 远端汇总为
  `/data/models/yujianAI/registry/evidence/p1-m0-04-production-oci-summary-20260718T122500Z.json`，
  SHA-256 `61f63898512b6444d92cdee4f1ececbc6269ef5575efb1c04c1c72a0cf33e1a3`；仓库索引为
  `docs/acceptance/p1-production-oci-evidence.json`。

### Gate Status

- P1-M0-04 的 High 技术缺口与生产 OCI 技术签名缺口已关闭。
- `productionOciTechnical=passed`，但 `releaseOwnerFreeze=pending-bbb`、
  `productionReleaseAuthorized=false`。
- bbb 尚未本人批准/驳回 Redis，也未本人冻结已配置的 Registry/KMS URI；aaa 尚未本人确认
  最终零 Critical/High 证据；ccc/ddd 尚未签署 LICENSE/NOTICE、OpenBao source offer 和
  中国分发意见。
- 当前运行镜像仍是旧固定版本，当前-image run 仍有 76 Critical；PostgreSQL/OpenBao 候选
  生产回归尚未执行。因此 P1-M0-04、Gate 0、完整 Gate 1、Gate 7 和生产发布继续
  **blocked/not-passed**。

### Background Tasks

- `yujian-production-registry` 在 Beelink 运行，`restart=unless-stopped`，数据/认证/TLS 位于
  `/data/models/yujianAI/registry`；凭据与 OpenBao signer token 位于
  `/data/models/yujianAI/secrets/p1-m0-04`，均不在 Git，目录/文件为 0700/0600。
- P2 PostgreSQL、Redis、OpenBao A/B/C 持续 `running/healthy`、`restartCount=0`，容器 ID
  与本轮前一致；没有切换当前 Redis/PostgreSQL/OpenBao。
- 无遗留构建、扫描或签名进程。

### Next Session Priorities

1. bbb 本人在 `p1-redis-release-decision.json` 明确 approve/reject，并对
   `beelink.tail1e9cec.ts.net:5443` 与 `openbao://yujian-oci-release` 作 freeze 签字；不能由
   AI、eee 或工程证据代签。
2. aaa 本人确认最终 Critical 0/High 0、残余 Medium/Unknown 和 signer policy。
3. ccc/ddd 对实际 LICENSE/NOTICE、335 个 `NOASSERTION` 处置、OpenBao source offer、商标
   措辞及中国分发形态签字。
4. 获得安全/发布决定后，执行 PostgreSQL backup/restore、migration 001–011、outbox/CAS，
   以及 OpenBao 2.4→2.5 Raft/TLS/HA/API-key 回归；之后才允许 canary/回滚与当前-image 重扫。
5. 在 2026-10-11 前实现 Tailscale TLS 证书自动续期和 Registry reload，并补 Registry HA/
   备份恢复方案；当前单节点配置不得被误称为最终 HA 生产批准。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run test:supply-chain
npm run supply-chain:verify-remediated-evidence
npm run supply-chain:verify-production-oci
npm run supply-chain:verify-redis-decision
npm run supply-chain:verify-owner-signoffs
npm run check
ssh beelink@100.110.127.117 \
  'jq "{technicalStatus,registry,kms,remainingHumanGates}" \
     /data/models/yujianAI/registry/evidence/p1-m0-04-production-oci-summary-20260718T122500Z.json; \
   docker inspect yujian-production-registry yujian-p2-postgres-1 yujian-p2-redis-1 \
     yujian-p2-openbao-a-1 yujian-p2-openbao-b-1 yujian-p2-openbao-c-1 \
     --format "{{.Name}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}} {{.RestartCount}}"'
```

## 📌 SESSION HANDOFF STATUS — P1-M0-04 personal signing controls ready; zero personal approvals

### Current Work

2026-07-18 已在 Beelink OpenBao 为 aaa、bbb、ccc、ddd 分别配置独立的 ECDSA P-256
不可导出 key 和最小权限 policy，并生成五份待本人决定模板。此次工作只建立签字条件，未替
任何 Owner 作决定、未预发个人凭据、未把技术验签写成发布批准。

- key URI 分别为 `openbao://yujian-owner-aaa`、`openbao://yujian-owner-bbb`、
  `openbao://yujian-owner-ccc`、`openbao://yujian-owner-ddd`；全部 `exportable=false`、
  `allowPlaintextBackup=false`。
- 最终 key provision run 为 `owner-key-provision-20260718T131500Z`；远端结果：
  `/data/models/yujianAI/evidence/p1-m0-04/owner-signers/owner-key-provision-20260718T131500Z/result.json`；
  SHA-256 `5bf28ddac4a1c03070415daf84cdd6e143bc06aebf10c7ecee8dc60099efac55`。
- 最终 policy validation run 为 `owner-policy-validation-20260718T131500Z`；远端结果：
  `/data/models/yujianAI/evidence/p1-m0-04/owner-signers/owner-policy-validation-20260718T131500Z/result.json`；
  SHA-256 `f2433cc6bccb77217b1889540d6c591662209e51a24024eadbc109b301af97ed`。
- 每位 Owner 的 own-key read/sign 技术自测通过，读取其他 Owner key 和 `sys/mounts` 均被
  拒绝；所有临时技术自测 token 已撤销，活动自测 token 数为 0。
- `issue-owner-signing-token.sh` 只允许四个已登记 Owner；在本人在线时才创建一次性 5 分钟
  response-wrap delivery token，解包后的 scoped token 最长 15 分钟、不可续期。本轮没有
  运行该签发动作，`personalCredentialIssued=false`。
- 五份模板均保持 `status=awaiting-personal-decision`、决定字段为 `null`。bbb 有 Redis 发布
  与 Registry/KMS freeze 两份独立模板；待决定模板使用 `--require-decided` 和签名脚本均会
  被拒绝。
- 仓库索引为 `docs/acceptance/p1-owner-key-registry.json`；操作说明和模板在
  `docs/governance/owner-decisions/`；结构/门禁测试为 34/34 通过。

### Gate Status

- `allPersonalDecisionsPending=true`，`productionReleaseAuthorized=false`。
- 独立 key、最小 policy 和密码学签名工具不证明 aaa/bbb/ccc/ddd 已本人审阅或批准；当前
  身份绑定仍是安全交付 + 本人独立 SSH 会话 + OpenBao audit，不等同法定电子签章。
- bbb Redis approve/reject、bbb Registry/KMS freeze、aaa 安全决定、ccc 法律决定、ddd
  中国分发决定均未完成。因此 P1-M0-04、Gate 0、完整 Gate 1、Gate 7 和生产发布继续
  **blocked/not-passed**。
- 当前 P2 Redis/PostgreSQL/OpenBao 运行镜像未切换。2026-07-18 最新远端复核中，P2 五个
  容器均 `running/healthy`、`restartCount=0`；Registry 仍运行且未用作批准当前镜像切换。

### Background Tasks

- `yujian-production-registry` 继续在 Beelink 运行，数据、TLS 和认证材料位于 `/data` 下；
  没有新的构建、扫描、签名或个人令牌进程。
- 未生成或提交真实 token、个人签名、JWT、Registry 密码或 OpenBao root token。

### Next Session Priorities

1. 每位 Owner 在线并完成证据审阅后，管理员才按人签发 5 分钟 wrapped token；通过独立
   安全通道交付，不复制到聊天或 Git。
2. Owner 本人填写自己的模板，并在自己的 Beelink SSH 会话中解包 15 分钟 token、执行
   `sign-owner-decision.sh`；bbb 必须分别签两份决定。
3. 维护人核对 secure delivery、SSH 身份、OpenBao audit、artifact hash 和
   `cosign verify-blob`，再回填 Redis/Owner gate JSON；签名拒绝不得授权生产。
4. 仅在 aaa/bbb/ccc/ddd 决定和生产回归前置条件全部满足后，才能讨论 canary、运行镜像
   切换与 Gate 状态变化。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run supply-chain:verify-owner-templates
npm run supply-chain:verify-owner-keys
npm run supply-chain:verify-owner-signoffs
npm run test:supply-chain
npm run check
ssh beelink@100.110.127.117 \
  'sha256sum \
     /data/models/yujianAI/evidence/p1-m0-04/owner-signers/owner-key-provision-20260718T131500Z/result.json \
     /data/models/yujianAI/evidence/p1-m0-04/owner-signers/owner-policy-validation-20260718T131500Z/result.json; \
   docker inspect yujian-production-registry yujian-p2-postgres-1 yujian-p2-redis-1 \
     yujian-p2-openbao-a-1 yujian-p2-openbao-b-1 yujian-p2-openbao-c-1 \
     --format "{{.Name}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}} {{.RestartCount}}"'
```

## 📌 SESSION HANDOFF STATUS — 语见 Owner 审批台已部署；五项本人决定仍待签

### Current Work

2026-07-18 已完成并部署独立 `@yujian/owner-approval` 服务与 `apps/owner-approval` 页面。
Owner 现在可通过 `https://beelink.tail1e9cec.ts.net:8093/` 审阅五项任务并提交决定；该地址
只监听 Beelink Tailscale IP，使用 TLS，不再要求日常直接编辑 JSON。

- UI 提供 aaa/bbb/ccc/ddd 筛选、事实与证据展示、批准、驳回、有条件批准、限期例外、
  条件/到期时间和本人确认。页面不使用 localStorage/sessionStorage，提交完成或失败后清空
  wrapped token。
- 后端从冻结模板生成 revision，拒绝未知字段、旧 revision、跨任务决定、少于 20 字符理由、
  重复/并发覆盖和每来源每分钟超过 5 次提交。
- wrapped token 解包后必须只有一个 `yujian-owner-<owner>-signer` policy，metadata 必须匹配
  Owner，TTL 不超过 15 分钟且不可续期；签名、OpenBao verify 和 revoke-self 全部成功才
  原子归档 `decision.json`、`signature.json`、`result.json`，权限为 0700/0600。
- 服务不持有 OpenBao root/admin token，不签发个人 token，不记录请求正文，不在响应/日志/
  evidence 中保存 token，也不自动修改发布 Gate。
- Beelink 部署 release 为
  `/data/models/yujianAI/owner-approval/releases/owner-approval-20260718T132723Z`；容器
  `yujian-owner-approval` 使用固定
  `node:24.18.0-bookworm@sha256:5711a0d445a1af54af9589066c646df387d1831a608226f4cd694fc59e745059`，
  `running/healthy`、`restartCount=0`。host Node 18 不参与运行。
- 容器 read-only、drop all capabilities、no-new-privileges，唯一可写挂载是
  `/data/models/yujianAI/evidence/p1-m0-04/owner-approvals`；当前文件数为 0。
- Owner policy 新增仅限本人 key 的 `verify`，仍保留 read-own-key/sign-own-key/revoke-self，
  不增加跨 key 或系统访问。最终 provision run 为
  `owner-key-provision-20260718T131608Z`，SHA-256
  `f4ff6c560c533615797867f28911bd25810b046d55950e68b6804f84d840d11d`；最终 validation run
  为 `owner-policy-validation-20260718T131609Z`，SHA-256
  `58de37c8ebb1538f7a72dc6ccca09a4f1e2b2ffd51b05cb1aba53e6523076edb`。
- 真实 OpenBao 技术链路使用 1 分钟 wrap/2 分钟技术 token 对 aaa key 执行无害字符串
  sign/verify/revoke，结果 `verified=true`、`credentialRevoked=true`、evidence 新增 0、活动
  自测 token 0、`personalDecisionRecorded=false`、`productionReleaseAuthorized=false`。
- 本机 Chromium 已验证同一构建的五任务列表、Redis 详情、限期例外动态字段和完整表单，
  console 0 error/0 warning；截图为 `output/playwright/owner-approval-console.png`。Beelink TLS
  health/API 已由本机绕过本地开发代理直接验证。

### Verification

- `@yujian/owner-approval`：9/9 通过，包括 204 revoke-self、跨 Owner、附加 policy、旧
  revision、重复决定、token 不落盘和 Gate 保持 false。
- 供应链：35/35 通过；Owner key registry 校验通过。
- OpenAPI YAML、TypeScript lint/build、JavaScript syntax、CSP、favicon 和远端健康检查通过。

### Gate Status

- 五项 API 状态均为 `awaiting-personal-decision`；Owner evidence 目录文件数 0。
- `productionReleaseAuthorized=false`。技术自测不构成人员身份、专业意见或默许批准。
- 因 aaa 安全决定、bbb Redis 与 Registry/KMS 两份决定、ccc 法律决定、ddd 中国分发决定均
  未由本人提交，P1-M0-04、Gate 0、完整 Gate 1、Gate 7 和生产发布继续
  **blocked/not-passed**。

### Background Tasks

- `yujian-owner-approval` 在 Beelink 持续运行，监听 `100.110.127.117:8093`，Docker
  `restart=unless-stopped`；Tailscale TLS 证书当前到期日 2026-10-11。
- `yujian-production-registry` 与 P2 PostgreSQL、Redis、OpenBao A/B/C 保持原运行边界；
  Owner 审批台没有切换这些运行镜像。
- 本机临时浏览器测试服务与 Playwright 浏览器均已停止；无个人 token 或审批后台任务。

### Next Session Priorities

1. 对应 Owner 本人在线后，管理员按人运行 `issue-owner-signing-token.sh`，将 5 分钟 wrapped
   token 通过独立安全通道交付本人。
2. Owner 打开 `https://beelink.tail1e9cec.ts.net:8093/`，选择自己的任务、审阅证据并提交。
   bbb 必须分别完成 Redis 与 Registry/KMS 两项。
3. 维护人核对 receipt、OpenBao audit、secure delivery 和 artifact hash，再回填现有 Gate
   JSON；驳回、条件未满足或过期例外不得授权生产。
4. 在 2026-10-11 前复用 Registry 证书续期/reload 机制更新审批台 TLS，并补正式 OIDC/
   CA 实名或第三方电子签章方案（如商用合规要求）。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run owner-approval:test
npm run supply-chain:verify-owner-keys
npm run test:supply-chain
npm run check
curl --noproxy '*' --fail --silent --show-error \
  --resolve beelink.tail1e9cec.ts.net:8093:100.110.127.117 \
  https://beelink.tail1e9cec.ts.net:8093/api/v1/owner-approvals | \
  jq '{tasks:(.data.tasks|length),statuses:[.data.tasks[].status],release:.data.productionReleaseAuthorized}'
ssh beelink@100.110.127.117 \
  'docker inspect yujian-owner-approval --format \
     "{{.Name}} {{.Config.Image}} {{.State.Status}} {{.State.Health.Status}} {{.RestartCount}}"; \
   find /data/models/yujianAI/evidence/p1-m0-04/owner-approvals -type f | wc -l'
```

## 📌 SESSION HANDOFF STATUS — 本机 Clash 绕行审批入口已启动

### Current Work

2026-07-18 已新增并启动 `tools/owner-approval/bypass-clash-proxy.mjs`。Owner 可在本机打开
`http://127.0.0.1:8094/`，无需让浏览器通过 Clash 访问 Beelink 域名。

- 本地进程只监听 `127.0.0.1:8094`，当前 PID 为 `79424`。
- 上游固定直连 `100.110.127.117:8093`，同时使用
  `beelink.tail1e9cec.ts.net` 做 SNI 与 TLS 证书校验，未关闭证书验证。
- 桥接仅允许审批台静态资源、健康检查、任务查询和五项决定提交路径，请求体上限 16 KiB；
  不记录请求正文或 wrapped token，未知路径返回 404。
- 默认浏览器已经打开本地入口。此改动没有提交任何 Owner 决定，也没有改变 Gate。

### Verification

- `node --check tools/owner-approval/bypass-clash-proxy.mjs`：通过。
- `npm run check`：全仓上游清洁校验、workspace lint 与测试通过；Owner 审批服务 9/9 通过。
- `/healthz`：`status=ok`；审批 API 返回 5 项任务，全部
  `awaiting-personal-decision`，`productionReleaseAuthorized=false`。
- `lsof` 确认仅 `127.0.0.1:8094` 监听；页面返回原 CSP、`X-Frame-Options: DENY`、
  `X-Content-Type-Options: nosniff` 等安全响应头；非允许路径实测返回 404。

### Background Tasks

- 本机 `npm run owner-approval:bypass-clash` 正在当前 Codex PTY 会话中运行；关闭该进程、Codex
  会话或重启 Mac 后需要重新执行命令。
- Beelink `yujian-owner-approval` 继续作为真实审批服务运行；本机进程不保存审批状态。

### Next Session Priorities

1. aaa、bbb、ccc、ddd 本人分别完成五项专业决定；bbb 需完成两项。
2. 每次提交前由管理员单独签发并安全交付 5 分钟 wrapped token。
3. 维护人复核 receipt、OpenBao audit、artifact hash 后再回填 Gate；不得以桥接可用代替审批。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
lsof -nP -iTCP:8094 -sTCP:LISTEN
npm run owner-approval:bypass-clash
curl --fail --silent --show-error http://127.0.0.1:8094/healthz
curl --fail --silent --show-error http://127.0.0.1:8094/api/v1/owner-approvals | \
  jq '{tasks:(.data.tasks|length),statuses:[.data.tasks[].status],release:.data.productionReleaseAuthorized}'
```

## 📌 SESSION HANDOFF STATUS — aaa 凭证曾用于错误 Owner；第二枚凭证已签发

### Current Work

2026-07-18 审批台收到 `aaa / 安全证据确认` 的 4 次提交，均在 OpenBao wrapping unwrap
阶段返回 401；服务仍为 `running/healthy`、`restartCount=0`，Owner evidence 文件数仍为 0，
因此没有误签、残留决定或 Gate 变化。页面在失败后按设计清空 wrapped token 输入框。

已通过既有管理员脚本生成新的 `aaa` 单次凭证，run id 为
`owner-token-aaa-ui-20260718T133927Z`，直接写入本机剪贴板且没有打印 token。OpenBao
`sys/wrapping/lookup` 确认 `creation_ttl=300`、`creation_path=auth/token/create`；未执行 unwrap，
凭证仍只能由 aaa 本人在 5 分钟内提交一次。

随后日志确认该凭证先被提交到 `ddd / 中国分发合规`，OpenBao 成功解包后服务因 Owner 不匹配
返回 403 并撤销个人 token；之后同一凭证再提交到 aaa 返回 401，符合一次性语义。evidence
文件数仍为 0。已生成第二枚 aaa 凭证
`owner-token-aaa-ui-retry-20260718T134148Z` 并只写入本机剪贴板；用户须保持 aaa 任务不切换。

诊断时 `bao audit list` 返回空数组，说明当前 OpenBao 集群未启用 audit device。该缺口不改变
本次签名 API 行为，但在 Gate 回填前必须补齐审计落盘和留存证据，不能声称已有 OpenBao
audit 记录。

### Background Tasks

- 本地 Clash 绕行审批入口继续监听 `127.0.0.1:8094`。
- Beelink Owner 审批服务继续监听 `100.110.127.117:8093`。

### Next Session Priorities

1. aaa 将剪贴板凭证粘贴到当前审批表单并在过期前本人提交。
2. 提交后核对 API 状态、Owner receipt、OpenBao audit 和 evidence 文件，不能只依赖前端提示。
3. 其他 Owner 仍须逐人、逐次签发自己的最小权限凭证；不得复用 aaa 凭证。
4. 在 Gate 复核前启用 OpenBao audit device，使用 `/data` 持久化并验证 HA 节点可写、轮转和
   secret 哈希化边界。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
curl --fail --silent --show-error http://127.0.0.1:8094/api/v1/owner-approvals | \
  jq '{tasks:(.data.tasks|length),statuses:[.data.tasks[].status],release:.data.productionReleaseAuthorized}'
ssh beelink@100.110.127.117 \
  'docker logs --since 15m yujian-owner-approval 2>&1 | tail -80; \
   find /data/models/yujianAI/evidence/p1-m0-04/owner-approvals -type f | wc -l'
```

## 📌 SESSION HANDOFF STATUS — aaa 驳回决定已签名归档；Gate 保持关闭

### Current Work

2026-07-18 `aaa / 安全证据确认` 提交返回 HTTP 201，API 状态更新为
`signed-decision-recorded`。本人选择的决定为 `reject`，不是 approve；决定时间
`2026-07-18T13:44:49.732Z`，归档时间 `2026-07-18T13:44:50.098Z`。

- 远端以 0600 原子归档 `decision.json`、`signature.json`、`result.json`，artifact SHA-256 为
  `abf851983dfdf8be691c4bfdade9131f4eb295a92b5a388f92c3c80960873522`。
- 使用 OpenBao `yujian-owner-aaa` key version 1 对归档 artifact 独立执行 transit verify，结果
  `cryptographicSignatureValid=true`；receipt 为 `signatureVerified=true`、
  `credentialRevoked=true`。
- 活跃的 `purpose=p1-m0-04-owner-signoff, personal_owner=aaa` token 数为 0；本机剪贴板中的
  已使用 wrapped token 已清空。
- 其余 bbb 两项、ccc、ddd 均仍为 `awaiting-personal-decision`；`gateUpdated=false`、
  `productionReleaseAuthorized=false`。aaa 的已归档决定不可由审批台覆盖。
- OpenBao audit device 仍未启用，因此不能声称已具备 OpenBao audit 证据；Gate 继续关闭。

### Background Tasks

- 本地 Clash 绕行审批入口继续监听 `127.0.0.1:8094`。
- Beelink Owner 审批服务 `running/healthy`、`restartCount=0`。

### Next Session Priorities

1. 确认 aaa 的 `reject` 是否为正式专业决定；若只是测试或误选，设计并审批不可覆盖的
   superseding decision 流程，不得修改或删除原始证据。
2. 启用并验证 OpenBao audit device 后，再办理 bbb、ccc、ddd 的本人决定。
3. 只有在全部必要决定、条件和审计证据满足后才可更新 Gate；当前不得授权生产发布。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
curl --fail --silent --show-error http://127.0.0.1:8094/api/v1/owner-approvals | \
  jq '{tasks:[.data.tasks[]|{decisionId,status}],release:.data.productionReleaseAuthorized}'
ssh beelink@100.110.127.117 \
  'find /data/models/yujianAI/evidence/p1-m0-04/owner-approvals \
     -maxdepth 3 -type f -printf "%m %s %p\n" | sort'
```

## 📌 SESSION HANDOFF STATUS — OpenBao audit 已启用；bbb Redis 凭证待本人提交

### Current Work

2026-07-18 按 OpenBao 2.4.1 声明式 audit 合同，在三个节点 HCL 中加入相同的
`audit "file" "yujian-owner"`，路径 `/openbao/data/audit.log`、`mode=0600`、
`log_raw=false`、`hmac_accessor=true`。通过 SIGHUP 在线加载，没有重启容器。

- `bao audit list -detailed` 已返回 `yujian-owner/`；active 节点日志权限为 0600、owner
  `openbao:openbao`，实测包含 HMAC 且不包含 root token 明文。
- OpenBao A/B/C 仍为 `running/healthy`、restart 0；Raft 3 peers/3 voters。
- API 动态 enable 被 2.4.1 正确拒绝，未启用不安全的 `unsafe_allow_api_audit_creation`。
- 已为 `bbb / Redis 发布决定` 签发独立凭证
  `owner-token-bbb-redis-ui-20260718T135348Z`，只写入本机剪贴板；尚未提交本人决定。

### Background Tasks

- 本地审批入口继续监听 `127.0.0.1:8094`；Beelink 服务继续健康运行。
- OpenBao audit 现在写入 `/data/models/yujianAI/p2/openbao-<active>/audit.log` 对应数据卷。

### Next Session Priorities

1. bbb 保持 `Redis 发布决定` 任务，审阅事实后本人选择批准或驳回并粘贴当前一次性凭证。
2. 验收 Redis receipt、密码学签名、token revoke 和 audit request/response 后，清空剪贴板。
3. 再单独签发第二枚 bbb token，办理 `Registry / KMS 冻结`；两项不得复用凭证。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
curl --fail --silent --show-error 'http://127.0.0.1:8094/api/v1/owner-approvals?owner=bbb' | \
  jq '.data.tasks[] | {decisionId,status}'
ssh beelink@100.110.127.117 \
  'docker inspect yujian-p2-openbao-a-1 yujian-p2-openbao-b-1 yujian-p2-openbao-c-1 \
     --format "{{.Name}} {{.State.Status}} {{.State.Health.Status}} {{.RestartCount}}"'
```

## 📌 SESSION HANDOFF STATUS — bbb 两项已签；Redis 批准、Registry/KMS 驳回

### Current Work

2026-07-18 bbb 已依次完成两项独立本人决定，两次请求均返回 HTTP 201，且各使用不同的
5 分钟 wrapped token：

- `p1-m0-04-bbb-redis-20260718`：`approve`，artifact SHA-256
  `bdabadf8958645ace87f20126f1cf8c42c60a343ba2d45c9fe6bf0a03c44ad0e`。
- `p1-m0-04-bbb-registry-kms-freeze-20260718`：`reject`，artifact SHA-256
  `29ace2438d43da0869d51f5f679fb6cf02eec0d2db315fa34b47a3bfa60b28bf`。

每项均原子归档 0600 的 `decision.json`、`signature.json`、`result.json`；独立 OpenBao
transit verify 为 true，receipt 为 `signatureVerified=true`、`credentialRevoked=true`，活跃
bbb owner-signoff token 数为 0。OpenBao audit 对 unwrap、sign、verify、revoke-self 均有
request/response，日志不含 wrapped token 或 root token 明文；本机剪贴板已清空。

当前 API 状态为 aaa、bbb Redis、bbb Registry/KMS 三项 `signed-decision-recorded`，ccc/ddd
两项 `awaiting-personal-decision`。由于 aaa 安全决定为 reject、bbb Registry/KMS freeze 为
reject，`gateUpdated=false`、`productionReleaseAuthorized=false`，Redis approve 不得单独
触发部署或当前 P2 Redis 切换。

README、设计索引、Owner 状态、供应链评审、生产 OCI 合同和 P1 计划已同步上述事实；冻结
模板未被覆盖。`docs/acceptance/p1-redis-release-decision.json` 与
`p1-m0-04-owner-signoffs.json` 仍需在维护人 evidence adapter 接入 receipt/audit 合同后回填，
不得伪造旧 Sigstore bundle 字段。

### Verification

- `@yujian/owner-approval`：9/9 通过；`bash -n infra/p2/beelink/deploy.sh` 和
  `git diff --check` 通过。
- `npm run check`：全仓上游校验、workspace lint 与测试通过。
- OpenBao A/B/C 均 `running/healthy`、restart 0，Raft 3 peers/3 voters；声明式 audit 已通过
  SIGHUP 在线加载并持久化到 `/data`。

### Background Tasks

- 本地 Clash 绕行入口继续监听 `127.0.0.1:8094`。
- Beelink 审批服务与 OpenBao 三节点持续运行；无未撤销的 bbb 个人签名 token。

### Next Session Priorities

1. 办理 ccc LICENSE/NOTICE/source offer 决定和 ddd 中国分发决定，各自独立签发一次性凭证。
2. 为 Owner approval receipt + OpenBao audit 新合同增加 acceptance adapter/verifier，再回填两个
   repo JSON；Gate 必须保持 blocked。
3. 若 aaa 或 bbb 的 reject 是误选/测试，先设计不可覆盖的 superseding decision 合同；不得
   删除或改写现有远端证据。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run owner-approval:test
curl --fail --silent --show-error http://127.0.0.1:8094/api/v1/owner-approvals | \
  jq '{tasks:[.data.tasks[]|{decisionId,status}],release:.data.productionReleaseAuthorized}'
ssh beelink@100.110.127.117 \
  'docker exec yujian-p2-openbao-a-1 sh -c \
     "stat -c \"%a %U:%G %s\" /openbao/data/audit.log"'
```

## 📌 SESSION HANDOFF STATUS — 五项 Owner 决定全部归档；四项驳回阻断发布

### Current Work

2026-07-18 五项 Owner API 状态均为 `signed-decision-recorded`：

| 决定 | Owner | 结果 | artifact SHA-256 |
| --- | --- | --- | --- |
| 安全证据确认 | aaa | reject | `abf851983dfdf8be691c4bfdade9131f4eb295a92b5a388f92c3c80960873522` |
| Redis 发布决定 | bbb | approve | `bdabadf8958645ace87f20126f1cf8c42c60a343ba2d45c9fe6bf0a03c44ad0e` |
| Registry/KMS 冻结 | bbb | reject | `29ace2438d43da0869d51f5f679fb6cf02eec0d2db315fa34b47a3bfa60b28bf` |
| LICENSE/NOTICE/source offer | ccc | reject | `206d304c5c586e859adfcaea0296f139a63b8daa37ca42afc2f5dad66b167ec6` |
| 中国分发合规 | ddd | reject | `bfe38e72216ed2dd677da5062ca73d11d4b54435a017d4a4cd8828fb2a9e1926` |

每项均只有 0600 的 `decision.json`、`signature.json`、`result.json`；五份 artifact 已使用对应
OpenBao Owner key 独立重新验签，结果全部 valid。所有 receipt 均为
`credentialRevoked=true`、`gateUpdated=false`、`productionReleaseAuthorized=false`；当前活跃
owner-signoff token 数为 0，本机剪贴板已清空。

OpenBao audit snapshot run 为 `owner-approval-final-audit-20260718T140644Z`：95 条记录，
`audit.log` SHA-256 `4d672cde765715ba512e5a9f267a69f4fdba809f54b76ffcf3a9796323409991`，
`result.json` SHA-256 `b3cca160b91130ae06ea4978953b1b7a24e23df590bbdd4f66e163a5ace44a83`，
均为 0600 并位于 `/data/models/yujianAI/p2/openbao-a/audit-snapshots/`。

审计覆盖边界必须保持：audit device 在 aaa 决定后才启用，所以 bbb 两项、ccc、ddd 拥有完整
unwrap/sign/verify/revoke request+response；aaa 原始链路无法事后重建，只有 receipt、审批服务
HTTP 201 日志和事后密码学验签。snapshot 明确记录 `signAaa=0`，没有伪造完整覆盖。

README、文档索引、Owner 矩阵、任命表、供应链评审、生产 OCI 合同、P1 计划和完成审计均已
同步为“一项 approve、四项 reject”。冻结模板保持不变；现有 acceptance JSON 仍使用旧
Sigstore 手工签字合同，必须先实现 receipt/audit adapter 才能安全回填。

### Gate Status

- `productionReleaseAuthorized=false`，Gate 0、完整 Gate 1、Gate 7 继续 not-passed/blocked。
- bbb 的 Redis approve 不得覆盖 aaa、bbb freeze、ccc、ddd 四项 reject。
- 不得部署 Redis 候选、切换 Registry/KMS 或宣称中国分发/许可证/安全批准。

### Verification

- `npm run check`：全仓上游校验、workspace lint 与测试通过；Owner 审批服务 9/9 通过。
- 语见审批服务和 OpenBao A/B/C 均 `running/healthy`、restart 0；Raft 为 3/3 voters。
- `git diff --check` 通过；当前 API 为 signed 5、pending 0、release false。

### Background Tasks

- 本地 Clash 绕行入口继续监听 `127.0.0.1:8094`；Beelink 审批服务与 OpenBao HA 持续运行。
- 无未撤销的个人签名 token，无个人 token 写入 Git、日志快照或聊天。

### Next Session Priorities

1. 实现 Owner approval receipt + OpenBao audit 到两个 acceptance JSON 的版本化 adapter 和
   verifier 测试，保留 mixed bbb decisions 与 aaa audit gap。
2. 明确四项 reject 是正式专业决定还是测试/误选；如需改变，设计 superseding decision，
   原证据不可删除、覆盖或改写。
3. 补齐四位 Owner 的实名、联系方式、专业资格和备份人；receipt 不能替代这些材料。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run check
curl --fail --silent --show-error http://127.0.0.1:8094/api/v1/owner-approvals | \
  jq '{tasks:[.data.tasks[]|{decisionId,status}],release:.data.productionReleaseAuthorized}'
ssh beelink@100.110.127.117 \
  'docker exec yujian-p2-openbao-a-1 cat \
     /openbao/data/audit-snapshots/owner-approval-final-audit-20260718T140644Z/result.json | jq .'
```

## 📌 SESSION HANDOFF STATUS — 不覆盖原证据的 superseding decision 已开发并部署

### Current Work

2026-07-18 已将 Owner 决定更正实现为追加式哈希链，不重新开放或改写原任务：

- 原始 `<decisionId>/decision.json`、`signature.json`、`result.json` 仍是一次性只写记录。
- 新的 `POST /api/v1/owner-approvals/{decisionId}:supersede` 必须提交当前
  `expectedReceiptSha256`、替代原因、原证据保留确认和新的 5 分钟 wrapped token。
- 新 artifact 绑定原冻结模板 revision、前一份 receipt/artifact SHA-256、前一归档时间、
  递增序号和替代原因；同一 Owner 独立签名、验签和 revoke-self 后，只写入
  `<decisionId>/supersessions/000001/` 等新目录。
- 服务使用 decision-level 排他锁和 receipt 哈希乐观并发检查；旧页面、重复或并发
  提交返回 409，且在调用 OpenBao 签名前失败。
- `GET /api/v1/owner-approvals` 现在返回当前有效 receipt SHA-256、序号和完整决定链，
  但不返回完整签名。审批台展示原始/替代历史、替代原因和当前有效决定，
  并明示“追加替代，不覆盖原记录”。
- Gate 语义未改：任何原始或替代 receipt 均为 `gateUpdated=false`、
  `productionReleaseAuthorized=false`。

Beelink 新 release 为
`/data/models/yujianAI/owner-approval/releases/owner-approval-20260718T143055Z`；容器
`yujian-owner-approval` 为 `running/healthy`、restart 0。五项现有决定均被新服务识别为
`currentSequence=0`、`historyCount=1`，结论仍为一项 approve/四项 reject。本轮没有签发或使用
任何 Owner 凭据，也没有提交真实 supersession。

### Original Evidence Immutability

部署脚本在重启前后对原层级的 15 个证据文件执行 SHA-256 对比，只有全部相同才
返回成功。部署后再次独立核对，15/15 哈希与部署前基线完全一致，其中五份原决定
artifact 仍为：

- aaa security `abf851983dfdf8be691c4bfdade9131f4eb295a92b5a388f92c3c80960873522`
- bbb Redis `bdabadf8958645ace87f20126f1cf8c42c60a343ba2d45c9fe6bf0a03c44ad0e`
- bbb Registry/KMS `29ace2438d43da0869d51f5f679fb6cf02eec0d2db315fa34b47a3bfa60b28bf`
- ccc legal `206d304c5c586e859adfcaea0296f139a63b8daa37ca42afc2f5dad66b167ec6`
- ddd compliance `bfe38e72216ed2dd677da5062ca73d11d4b54435a017d4a4cd8828fb2a9e1926`

对 `:supersede` 发送空 JSON 的无害路由探测返回 HTTP 400
`必须确认原始证据将保持不变`；远端仍没有任何 `supersessions` 证据文件。

### Verification

- `@yujian/owner-approval`：10/10 通过。新覆盖包括链接哈希、原文件字节不变、
  0600 新文件、token 不落盘/不进日志、跨 Owner 失败、旧 receipt 失败和两个并发请求
  只有一个成功。
- `npm run check`：全仓上游清洁校验、workspace lint/test 全部通过。
- `git diff --check`、`node --check apps/owner-approval/app.js`、
  `node --check tools/owner-approval/bypass-clash-proxy.mjs`、
  `bash -n tools/owner-approval/deploy-beelink.sh` 和 Owner OpenAPI YAML 解析通过。
- Playwright 通过本机 Clash 绕行入口验证真实部署页面：五项均显示“已签名 · 可追加替代”，
  aaa 页面显示原始决定、receipt 哈希、替代原因、两个明确确认项和追加按钮；
  API GET 为 200，console 0 error/0 warning。截图为
  `output/playwright/owner-approval-supersession.png`。

### Background Tasks

- 本地 Clash 绕行入口继续监听 `127.0.0.1:8094`，只转发静态资源、GET 和
  `:decide`/`:supersede`。
- Beelink 审批服务与 OpenBao HA 继续运行；Playwright 浏览器已关闭，本轮无新个人凭据。

### Next Session Priorities

1. 由对应 Owner 明确是否需要改变某一项现有结论；只有本人在审阅新证据后才可签发
   新的 5 分钟凭据并提交 supersession。
2. 实现 Owner approval receipt + OpenBao audit 到旧 acceptance JSON 的版本化 adapter/verifier，
   保留 mixed bbb decisions 和 aaa audit gap。
3. 补齐四位 Owner 的实名、联系方式、专业资格和备份人；不得用 receipt 或 supersession
   代替这些材料。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run owner-approval:test
curl --fail --silent --show-error http://127.0.0.1:8094/api/v1/owner-approvals | \
  jq '{tasks:[.data.tasks[]|{decisionId,currentSequence,historyCount:(.history|length),decision:.receipt.decision}],release:.data.productionReleaseAuthorized}'
ssh beelink@100.110.127.117 \
  'find /data/models/yujianAI/evidence/p1-m0-04/owner-approvals \
     -mindepth 2 -maxdepth 2 -type f -exec sha256sum {} \; | sort'
```

## 📌 SESSION HANDOFF STATUS — P0 文档同步与 Owner acceptance v2 完成

### Current Work

2026-07-18 已完成 P0 文档同步和 receipt/audit acceptance adapter/verifier：

- `tools/supply-chain/adapt-owner-acceptance.mjs` 从 Beelink 不可变
  decision/signature/receipt、可选 supersession 目录、Owner key registry 和 OpenBao audit
  收集证据，验证 artifact/receipt/signature 哈希、Owner/key 映射、凭据撤销和审计覆盖，
  再生成两个非敏感 v2 acceptance 合同。
- `docs/acceptance/p1-m0-04-owner-signoffs.json` 现同时表达四位 Owner、五项决定、每项完整
  history 和 mixed bbb 结果；`docs/acceptance/p1-redis-release-decision.json` 记录 bbb 的真实
  Redis approve receipt，但保持 `deploymentAuthorized=false`。
- acceptance JSON 不复制原始理由或签名，只保留理由长度/SHA-256、文件路径/哈希、公钥哈希、
  验签/撤销状态和 audit coverage；verifier 会拒绝 raw reason/signature/token/secret。
- README、设计索引、P1 关闭计划、完成审计、供应链评审、Redis 决定包、Owner 签字包、真实
  测试方案和兼容矩阵已同步到同一口径：M1 A-C baseline passed；完整 Gate 1 未通过；
  P2-01–06/M2 技术验收通过但正式 Gate 2 未通过；P1-M0-04/Gate 0/7 仍 blocked。

### Live Evidence Replay

本机把 adapter 源码通过 SSH stdin 发送到 Beelink 只读执行，直接读取
`/data/models/yujianAI/evidence/p1-m0-04/owner-approvals`、当前 key registry 和
`owner-approval-final-audit-20260718T140644Z`；收集结果再由本机 adapter 生成 v2 合同。
生成对象与仓库两个 JSON 逐字节结构比较均为 true：

- aaa security：sequence 0，reject；
- bbb Redis：sequence 0，approve；
- bbb Registry/KMS：sequence 0，reject；
- ccc legal：sequence 0，reject；
- ddd compliance：sequence 0，reject；
- 五项 history count 均为 1，无真实 supersession；
- `productionReleaseAuthorized=false`、`deploymentAuthorized=false`。

本轮未写入或覆盖任何 Beelink Owner evidence，未签发/使用 wrapped token，也未把远端理由正文
复制到仓库。

### Verification

- adapter/两个 acceptance verifier 定向测试：11/11 通过。
- `npm run supply-chain:verify-owner-signoffs`：5 decisions，release false，通过。
- `npm run supply-chain:verify-redis-decision`：bbb approve，authorized false，通过。
- `npm run test:supply-chain`：38/38 通过。
- `npm run check`：上游 replay、全部 workspace lint/test 通过；Owner approval 10/10、
  platform-api 20/20、data-rights 3/3、media-ops 4/4、livekit-compat 5/5、contracts 6/6。
- `node --check`：adapter 与两个 verifier 通过。

### Gate Status

- P1-M0-04、Gate 0、完整 Gate 1、Gate 7、生产发布：仍为 blocked/not-passed。
- P2-01–06/M2 指定技术验收：passed；正式 Gate 2：not-passed。
- receipt adapter 只能记录与验证决定，不能自动修改任何正式 Gate。

### Owner Supersede Review

P0 已为四位 Owner 准备独立判断项，但没有替其作出结论：

1. aaa 判断安全 reject 是否因新扫描/回归证据而需要 supersede；生产回归和原始 audit 缺口仍在。
2. bbb 维持或复核 Redis approve，并单独判断 Registry/KMS freeze reject 是否需要 supersede；
   当前回滚接受和 target freeze 仍为 false。
3. ccc 判断 335 个 `NOASSERTION`、LICENSE/NOTICE/source offer 是否足以改变法律 reject。
4. ddd 在 ccc 意见和中国分发/留存边界明确后判断是否改变合规 reject。

不改变结论时无需提交任何新凭据或记录；需要改变时只能由本人追加 hash-linked supersession。

### Background Tasks

- Beelink Owner 审批台、OpenBao HA 和既有本机 Clash 绕行入口维持既有运行状态。
- 本轮没有新后台进程、Owner token 或 supersession。

### Next Session Priorities

1. 由 aaa/bbb/ccc/ddd 本人分别给出“保持当前决定”或“需要 supersede”的判断。
2. 只有对应 Owner 明确需要改变时，才签发新的 5 分钟 wrapped token 并追加下一序号。
3. 若四项 reject 保持不变，转入其对应整改：生产回归、许可证归属、专业资格和中国分发意见。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run supply-chain:verify-owner-signoffs
npm run supply-chain:verify-redis-decision
npm run test:supply-chain
curl --fail --silent --show-error http://127.0.0.1:8094/api/v1/owner-approvals | \
  jq '{tasks:[.data.tasks[]|{decisionId,currentSequence,historyCount:(.history|length),decision:.receipt.decision}],release:.data.productionReleaseAuthorized}'
```

## 📌 SESSION HANDOFF STATUS — aaa supersede 本地桥接恢复

### Current Work

2026-07-18 用户提交 aaa supersede 时，本机 `127.0.0.1:8094` 返回
`本地审批桥接不允许该路径`。根因是监听进程在 `:supersede` 路由加入前已经启动：磁盘代码
允许 `:decide|:supersede`，直连 Beelink 同一路径返回合同校验 400，但旧内存进程返回 404。

旧桥已停止，当前代码已在统一执行 session `92580` 重新启动。无凭据空 JSON 路由探针现在
经本地桥返回预期 400，证明请求已转发至 Beelink；没有解包 token、写入决定或创建
supersession。审批台已刷新并重新停在 aaa 安全替代决定表单。

已重新为 aaa 签发 5 分钟 wrapped token 并直接写入本机剪贴板；仅验证剪贴板内容与远端
新 delivery artifact 的 SHA-256 一致，token 正文未输出到日志或仓库。

### Background Tasks

- 本地 Clash 绕行桥：统一执行 session `92580`，监听 `127.0.0.1:8094`。
- Beelink Owner 审批台与 OpenBao HA 维持既有状态。

### Next Session Priorities

1. aaa 本人审阅并判断是否提交 supersession；不需要改变时不要提交。
2. 若 token 超过 5 分钟，只重新签发 wrapped token，不重启桥、不覆盖原 evidence。

## 📌 SESSION HANDOFF STATUS — aaa sequence 1 approval 已同步 acceptance v2

### Current Work

2026-07-18 aaa 已成功追加第一份 superseding decision：

- 原 sequence 0 `reject` 的 decision/signature/result 保持不变；
- 新 sequence 1 为 `approve`，current receipt SHA-256 为
  `a22499a546afdd343995775975f105881fe6736355f10fa5b55a63ef4cba9dff`；
- history count 从 1 变为 2，supersession 绑定上一份 receipt/artifact SHA-256；
- 新 receipt 为 `credentialRevoked=true`、`gateUpdated=false`、
  `productionReleaseAuthorized=false`；
- 理由正文未复制到仓库，仅在 acceptance v2 保留长度和 SHA-256。

第一次被旧本地桥拦截后遗留的一个未使用 aaa signing token 已按 accessor 主动撤销；实时
复核 `activeOwnerSignoffTokens=0`。

### Audit And Adapter

新的正式 audit run 为 `owner-approval-final-audit-20260718T151351Z`：145 条记录，snapshot
SHA-256 `818eae634dd6f8d7260f82912187f9fdf64e6b6aec9a45db0d9502a2c93a6d77`，summary
SHA-256 `d1eca672e87781aab811814f4a04c1d42231ab9ee472983c04d14e719cfd9341`，均为 0600。
它记录 `signAaa=2`、`unwrap=10`、`revokeSelf=10`、`revokeAccessor=2` 和 active token 0。

adapter/verifier 已升级为逐决定、逐序号 `decisionCoverage`：aaa sequence 0 保留
`receipt-and-posthoc-verify-only-audit-enabled-after-decision`，sequence 1 为 `complete`；
bbb/ccc/ddd 保持 complete。这样不会用新审计反向伪造原始决定覆盖。

中间 run `owner-approval-final-audit-20260718T151219Z` 因把
`auth/token/revoke-accessor` 误计为 `auth/token/revoke` 而显示 `revokeAccessor=0`；该目录未删除、
未覆盖，但没有被 acceptance 引用。正式索引只引用更正后的 `...T151351Z`。

### Acceptance And Gate Status

- 当前五项有效决定：aaa 安全 approve、bbb Redis approve、bbb Registry/KMS reject、
  ccc 法律 reject、ddd 中国分发 reject，即两项批准、三项驳回。
- `highFindingsReviewedByAaa=true`；`registryTargetsFrozen=false`；ccc/ddd approval 仍为 false。
- `allProfessionalApprovalsGranted=false`、`deploymentAuthorized=false`、
  `productionReleaseAuthorized=false`。
- P1-M0-04、Gate 0、完整 Gate 1、Gate 7 和正式 Gate 2 继续 blocked/not-passed。

README、设计索引、完成审计、P1 计划、供应链评审、Owner 矩阵/任命表/签字包、兼容矩阵和
真实测试方案已同步到该状态。

### Verification

- Beelink live collect → adapter 重放与两个仓库 JSON 完全一致。
- adapter/verifier 定向测试：12/12 通过。
- `npm run test:supply-chain`：39/39 通过。
- `npm run check`：上游 replay、全部 workspace lint/test 通过；Owner approval 10/10、
  platform-api 20/20、data-rights 3/3、media-ops 4/4、livekit-compat 5/5、contracts 6/6。

### Background Tasks

- 本地 Clash 绕行桥继续由统一执行 session `92580` 监听 `127.0.0.1:8094`。
- Beelink Owner 审批台与 OpenBao HA 维持运行；当前无 Owner signing token。

### Next Session Priorities

1. bbb 判断 Registry/KMS freeze reject 是否需要 supersede；Redis approve 已保持。
2. ccc 复核 LICENSE/NOTICE、335 个 `NOASSERTION`、source offer 和商标措辞。
3. ddd 在 ccc 意见基础上复核中国分发和留存边界。

## 📌 SESSION HANDOFF STATUS — bbb Registry/KMS freeze 替代决定待本人提交

### Current Work

2026-07-18 本机审批台已切换到 `bbb / Registry / KMS 冻结`，页面明确展示当前 sequence 0
`reject`、不可变决定链、当前 receipt 哈希和“追加替代，不覆盖原记录”约束。Redis sequence 0
`approve` 未改动，也未为其创建新凭据。

已签发新的 5 分钟 wrapped token：
`owner-token-bbb-20260718T152415Z`。凭据只写入本机剪贴板；只验证 token 长度为 26、TTL 为
300 秒且剪贴板内容与 Beelink delivery artifact 的 SHA-256 一致，未输出 token 正文。

本轮没有代替 bbb 选择决定、填写理由、勾选确认或提交 supersession，因此当前有效决定、
acceptance v2 和 Gate 状态均未改变。

### Background Tasks

- 本地 Clash 绕行桥继续由统一执行 session `92580` 监听 `127.0.0.1:8094`。
- Beelink Owner 审批台与 OpenBao HA 维持运行。
- 当前新 bbb wrapped token 仅待本人一次性使用；若超时必须重新签发。

### Next Session Priorities

1. bbb 本人审阅 Registry/KMS 事实，判断保持 reject 或追加 supersession；保持时无需提交。
2. 若追加决定成功，立即验证 sequence/history/receipt 链、凭据撤销和 OpenBao audit，再重放
   acceptance adapter/verifier；不得修改 Redis approve 或 sequence 0 原证据。
3. bbb 处理完成后，再依次交由 ccc 和 ddd 判断是否需要 supersede。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
curl --fail --silent --show-error 'http://127.0.0.1:8094/api/v1/owner-approvals?owner=bbb' | \
  jq '{tasks:[.data.tasks[]|{decisionId,currentSequence,historyCount:(.history|length),decision:.receipt.decision}],release:.data.productionReleaseAuthorized}'
git diff --check
```

## 📌 SESSION HANDOFF STATUS — bbb Registry/KMS sequence 1 reject 已同步 acceptance v2

### Current Work

2026-07-18 bbb 已成功追加 Registry/KMS freeze 的第一份 superseding decision：

- 原 sequence 0 `reject` 的 decision/signature/result 保持不变；
- 新 sequence 1 仍为 `reject`，current receipt SHA-256 为
  `97b140684900e01e15040ce6339b812d719e6748160ca72a24d5a0996d4e8a34`；
- 新 decision artifact SHA-256 为
  `e964c2760fe0bf950a76474985f22dc30a063682aac60a7acc7d944bacd6d134`；
- sequence 1 绑定 sequence 0 receipt/artifact SHA-256，history count 从 1 变为 2；
- 新 receipt 为 `credentialRevoked=true`、`gateUpdated=false`、
  `productionReleaseAuthorized=false`；理由正文和签名值未复制到仓库。

bbb Redis 保持 sequence 0 `approve`，没有创建 Redis supersession。实时 OpenBao 复核没有
活动的 `yujian-owner-signoff` token；已使用的一次性凭据也已从本机剪贴板清除。

### Audit And Acceptance

新的正式 audit run 为 `owner-approval-final-audit-20260718T152817Z`：155 条记录，snapshot
SHA-256 `3f2df84c4d68211bbe7c1b705f7a9b506c7d1f7a62bcaf26d258bb1ae28dc9cc`，summary
SHA-256 `899e106f6441e33c198bf39cb7c5cd7b32d2446ec36bba961adc60ab316420da`，两份文件均为
0600。计数为 `unwrap=12`、`signBbb=6`、`signAaa=2`、`signCcc=2`、`signDdd=2`、
`revokeSelf=12`、`revokeAccessor=2`，active token 为 0。

`decisionCoverage` 已把 bbb Registry/KMS 更新为 `[complete, complete]`；aaa sequence 0 的
早期 audit 缺口仍原样保留。Beelink live collect 经 adapter 生成的两个 JSON 与仓库
`p1-m0-04-owner-signoffs.json`、`p1-redis-release-decision.json` 逐字一致。

当前有效决定仍为 aaa 安全 approve、bbb Redis approve、bbb Registry/KMS reject、ccc 法律
reject、ddd 中国分发 reject，即两项批准、三项驳回。P1-M0-04、Gate 0、完整 Gate 1、
Gate 7 和正式 Gate 2 继续 blocked/not-passed；生产发布未授权。

README、设计索引、兼容矩阵、P1 计划/审计、供应链评审、Owner 矩阵/任命/签字包、
生产 OCI/Redis 决定说明和真实测试方案已同步 sequence 1 状态。

### Verification

- live API：bbb Redis sequence 0 approve；Registry/KMS sequence 1/history 2 reject；release false。
- adapter 输出与两份 acceptance JSON `cmp` 一致。
- Owner/Redis verifier 与定向 adapter/verifier 测试 12/12 通过。
- `npm run test:supply-chain`：39/39 通过。
- `npm run check`：上游 replay、全部 workspace lint/test 通过。
- `git diff --check` 与本地审批台 `/healthz` 通过。

### Background Tasks

- 本地 Clash 绕行桥继续由统一执行 session `92580` 监听 `127.0.0.1:8094`。
- Beelink Owner 审批台与 OpenBao HA 维持运行；当前无 Owner signing token。

### Next Session Priorities

1. ccc 复核 LICENSE/NOTICE、335 个 `NOASSERTION`、source offer 与商标措辞，判断当前 legal
   reject 是否需要 supersede。
2. ccc 完成后，由 ddd 基于法律意见、中国分发与留存边界判断 compliance reject。
3. bbb Registry/KMS 当前 reject 保持有效；只有新证据改变结论时才追加 sequence 2。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run supply-chain:verify-owner-signoffs
npm run supply-chain:verify-redis-decision
curl --fail --silent --show-error http://127.0.0.1:8094/api/v1/owner-approvals | \
  jq '{tasks:[.data.tasks[]|{decisionId,currentSequence,historyCount:(.history|length),decision:.receipt.decision}],release:.data.productionReleaseAuthorized}'
```

## 📌 SESSION HANDOFF STATUS — ccc 法律替代决定待本人提交

### Current Work

2026-07-18 本机审批台已切换到 `ccc / 许可证与源码提供`。页面展示 LICENSE/NOTICE、
OpenBao source offer、Redis/PostgreSQL 许可证、335 个 `NOASSERTION`、商标复核要求，以及
当前 sequence 0 `reject` 的不可变 receipt 链。

已签发新的 5 分钟 wrapped token：`owner-token-ccc-20260718T153655Z`。凭据只写入本机
剪贴板；只验证 token 长度为 26、TTL 为 300 秒且剪贴板内容与 Beelink delivery artifact
的 SHA-256 一致，未输出 token 正文。

本轮没有代替 ccc 选择决定、填写理由、勾选确认或提交 supersession，因此当前有效决定、
acceptance v2 和 Gate 状态均未改变。

### Background Tasks

- 本地 Clash 绕行桥继续由统一执行 session `92580` 监听 `127.0.0.1:8094`。
- Beelink Owner 审批台与 OpenBao HA 维持运行。
- 当前新 ccc wrapped token 仅待本人一次性使用；若超时必须重新签发。

### Next Session Priorities

1. ccc 本人审阅法律证据，判断保持 reject 或追加 supersession；保持时无需提交。
2. 若追加决定成功，验证 sequence/history/receipt 链、凭据撤销和 audit，再重放 acceptance
   adapter/verifier；不得覆盖 sequence 0 原证据。
3. ccc 处理完成后，再交由 ddd 判断中国分发合规决定。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
curl --fail --silent --show-error 'http://127.0.0.1:8094/api/v1/owner-approvals?owner=ccc' | \
  jq '{tasks:[.data.tasks[]|{decisionId,currentSequence,historyCount:(.history|length),decision:.receipt.decision}],release:.data.productionReleaseAuthorized}'
git diff --check
```

## 📌 SESSION HANDOFF STATUS — ccc 法律 sequence 1 reject 已同步 acceptance v2

### Current Work

2026-07-18 ccc 已成功追加法律决定的第一份 superseding decision：

- 原 sequence 0 `reject` 的 decision/signature/result 保持不变；
- 新 sequence 1 仍为 `reject`，current receipt SHA-256 为
  `57891b09f42960a5e526bce92628e43d0f07a681691bed47799114466bf007cd`；
- 新 decision artifact SHA-256 为
  `c4e927a721463cf293925e61d390d69ff1ac183d45aeddb210411ba867e203ae`；
- sequence 1 绑定 sequence 0 receipt/artifact SHA-256，history count 从 1 变为 2；
- 新 receipt 为 `credentialRevoked=true`、`gateUpdated=false`、
  `productionReleaseAuthorized=false`；理由正文和签名值未复制到仓库。

实时 OpenBao 复核没有活动的 `yujian-owner-signoff` token，已使用的一次性凭据已从本机
剪贴板清除。

### Audit And Acceptance

新的正式 audit run 为 `owner-approval-final-audit-20260718T153822Z`：165 条记录，snapshot
SHA-256 `c0ad45e9bde24c8fb966895049ee56d7ce3ed0661034a3b384f602ae8104ee63`，summary
SHA-256 `175ae4ce8f8446a872ec6f2b44c021692a2919788201ce6cb2a6a05bcc9f931e`，两份文件均为
0600。计数为 `unwrap=14`、`signBbb=6`、`signCcc=4`、`signDdd=2`、`signAaa=2`、
`revokeSelf=14`、`revokeAccessor=2`，active token 为 0。

`decisionCoverage` 已把 ccc 法律更新为 `[complete, complete]`；aaa sequence 0 的早期 audit
缺口仍原样保留。Beelink live collect 经 adapter 生成的两个 JSON 与仓库
`p1-m0-04-owner-signoffs.json`、`p1-redis-release-decision.json` 逐字一致。

当前有效决定仍为 aaa 安全 approve、bbb Redis approve、bbb Registry/KMS reject、ccc 法律
reject、ddd 中国分发 reject，即两项批准、三项驳回。P1-M0-04、Gate 0、完整 Gate 1、
Gate 7 和正式 Gate 2 继续 blocked/not-passed；生产发布未授权。

README、设计索引、兼容矩阵、P1 计划/审计、供应链评审、Owner 矩阵/任命/签字包、
Owner 操作说明和真实测试方案已同步 ccc sequence 1 状态。

### Verification

- live API：ccc sequence 1/history 2 reject；credential revoked；release false。
- adapter 输出与两份 acceptance JSON `cmp` 一致。
- Owner/Redis verifier 通过。
- `npm run test:supply-chain`：39/39 通过。
- `npm run check`：上游 replay、全部 workspace lint/test 通过。
- `git diff --check`、本地审批台 `/healthz` 和剪贴板清理通过。

### Background Tasks

- 本地 Clash 绕行桥继续由统一执行 session `92580` 监听 `127.0.0.1:8094`。
- Beelink Owner 审批台与 OpenBao HA 维持运行；当前无 Owner signing token。

### Next Session Priorities

1. ddd 基于 ccc 当前法律 reject、中国分发、证据留存和上线阻断条件，判断当前 compliance
   reject 是否需要 supersede。
2. 若 ddd 追加决定，验证 hash 链、撤销、audit 并重放 acceptance；不得覆盖 sequence 0。
3. 三项当前 reject 均保持发布阻断，后续只能在新整改证据改变结论时追加下一序号。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run supply-chain:verify-owner-signoffs
curl --fail --silent --show-error http://127.0.0.1:8094/api/v1/owner-approvals | \
  jq '{tasks:[.data.tasks[]|{decisionId,currentSequence,historyCount:(.history|length),decision:.receipt.decision}],release:.data.productionReleaseAuthorized}'
```

## 📌 SESSION HANDOFF STATUS — ddd 中国分发合规替代决定待本人提交

### Current Work

2026-07-18 本机审批台已切换到 `ddd / 中国分发合规`。页面展示当前分发形态和部署区域未填写，
证据留存策略、证书续期负责人、单节点 Registry 风险均未接受，`chinaLaunchAuthorized=false`，
以及当前 sequence 0 `reject` 的不可变 receipt 链。

已签发新的 5 分钟 wrapped token：`owner-token-ddd-20260718T154319Z`。凭据只写入本机
剪贴板；只验证 token 长度为 26、TTL 为 300 秒且剪贴板内容与 Beelink delivery artifact
的 SHA-256 一致，未输出 token 正文。

本轮没有代替 ddd 选择决定、填写理由、勾选确认或提交 supersession，因此当前有效决定、
acceptance v2 和 Gate 状态均未改变。

### Background Tasks

- 本地 Clash 绕行桥继续由统一执行 session `92580` 监听 `127.0.0.1:8094`。
- Beelink Owner 审批台与 OpenBao HA 维持运行。
- 当前新 ddd wrapped token 仅待本人一次性使用；若超时必须重新签发。

### Next Session Priorities

1. ddd 本人基于 ccc 当前 legal reject、中国分发、证据留存和上线条件，判断保持 reject 或
   追加 supersession；保持时无需提交。
2. 若追加决定成功，验证 sequence/history/receipt 链、凭据撤销和 audit，再重放 acceptance
   adapter/verifier；不得覆盖 sequence 0 原证据。
3. ddd 处理完成后汇总四位 Owner 当前有效结论和 P1-M0-04 剩余整改任务。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
curl --fail --silent --show-error 'http://127.0.0.1:8094/api/v1/owner-approvals?owner=ddd' | \
  jq '{tasks:[.data.tasks[]|{decisionId,currentSequence,historyCount:(.history|length),decision:.receipt.decision}],release:.data.productionReleaseAuthorized}'
git diff --check
```

## 📌 SESSION HANDOFF STATUS — ddd sequence 1 approval 已同步；Owner 复核轮完成

### Current Work

2026-07-18 ddd 已成功追加中国分发合规的第一份 superseding decision：

- 原 sequence 0 `reject` 的 decision/signature/result 保持不变；
- 新 sequence 1 为 `approve`，current receipt SHA-256 为
  `6a67a1be147224a710a76f87ed8b0b4bba24f43f290124fde34bd26f0be54501`；
- 新 decision artifact SHA-256 为
  `77bb472d07683ceac7998913b4459ad80a4413ab60ca835cc541e7dbcc83231d`；
- sequence 1 绑定 sequence 0 receipt/artifact SHA-256，history count 从 1 变为 2；
- 新 receipt 为 `credentialRevoked=true`、`gateUpdated=false`、
  `productionReleaseAuthorized=false`；理由正文和签名值未复制到仓库。

实时 OpenBao 复核没有活动的 `yujian-owner-signoff` token，已使用的一次性凭据已从本机
剪贴板清除。

### Final Owner State

| 决定 | Owner | 当前序号 | 当前结论 |
| --- | --- | ---: | --- |
| 安全证据 | aaa | 1 | approve |
| Redis 发布 | bbb | 0 | approve |
| Registry/KMS freeze | bbb | 1 | reject |
| LICENSE/NOTICE/source offer | ccc | 1 | reject |
| 中国分发合规 | ddd | 1 | approve |

当前为三项批准、两项驳回。`chinaDistributionApprovedByDdd=true`，但
`registryTargetsFrozen=false`、`licenseNoticeApprovedByCcc=false`，所以
`allProfessionalApprovalsGranted=false`、`productionReleaseAuthorized=false`。

### Audit And Acceptance

新的正式 audit run 为 `owner-approval-final-audit-20260718T154455Z`：175 条记录，snapshot
SHA-256 `834187c1500ceb5d445689c621a65c38eee6f1aff2d530ec783263a991cc4981`，summary
SHA-256 `3ae50e76a99543e626d46419232d1ac57f9e3044b64660740f1b1d4d26719aea`，两份文件均为
0600。计数为 `unwrap=16`、`signBbb=6`、`signCcc=4`、`signDdd=4`、`signAaa=2`、
`revokeSelf=16`、`revokeAccessor=2`，active token 为 0。

`decisionCoverage` 已把 ddd 更新为 `[complete, complete]`；aaa sequence 0 的早期 audit
缺口仍原样保留。Beelink live collect 经 adapter 生成的两个 JSON 与仓库
`p1-m0-04-owner-signoffs.json`、`p1-redis-release-decision.json` 逐字一致。

README、设计索引、兼容矩阵、P1 计划/审计、供应链评审、Owner 矩阵/任命/签字包、
Owner 操作说明和真实测试方案已同步三项批准、两项驳回状态。

### Verification

- live API：五项 receipt 全部 revoked；序号为 1/0/1/1/1；三项 approve、两项 reject；release false。
- adapter 输出与两份 acceptance JSON `cmp` 一致；Owner/Redis verifier 通过。
- `npm run test:supply-chain`：39/39 通过。
- `npm run check`：上游 replay、全部 workspace lint/test 通过。
- `git diff --check`、本地审批台 `/healthz` 和剪贴板清理通过。

### Remaining P1-M0-04 Blockers

1. bbb Registry/KMS freeze 当前 sequence 1 reject；回滚接受、Registry target/KMS URI 和归档
   边界需要新整改证据后才可由 bbb 追加 sequence 2。
2. ccc 法律当前 sequence 1 reject；335 个 `NOASSERTION`、LICENSE/NOTICE、source offer、
   归属和商标意见未关闭。
3. 当前运行镜像仍有 76 个 Critical；安全重建候选仍缺 PostgreSQL/OpenBao 生产回归。
4. aaa 原始 sequence 0 audit 缺口、Owner 联系/备份/专业资格材料、渗透与完整 Gate 1 证据仍缺。

### Background Tasks

- 本地 Clash 绕行桥继续由统一执行 session `92580` 监听 `127.0.0.1:8094`。
- Beelink Owner 审批台与 OpenBao HA 维持运行；当前无 Owner signing token。

### Next Session Priorities

1. 不再重复签发 Owner token；先处理 bbb/ccc 两项 reject 对应的实质整改证据。
2. 优先补齐 ccc 法律清单和 bbb Registry/KMS 回滚/冻结包，再由本人判断是否追加下一序号。
3. Owner 决定不关闭 P1-M0-04、Gate 0、完整 Gate 1、Gate 7 或正式 Gate 2。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
npm run supply-chain:verify-owner-signoffs
npm run supply-chain:verify-redis-decision
curl --fail --silent --show-error http://127.0.0.1:8094/api/v1/owner-approvals | \
  jq '{tasks:[.data.tasks[]|{decisionId,currentSequence,historyCount:(.history|length),decision:.receipt.decision}],release:.data.productionReleaseAuthorized}'
```

## 📌 SESSION HANDOFF STATUS — Owner 审批台功能验收与 PostgreSQL/OpenBao 隔离生产回归通过

### Current Work

2026-07-18 用户确认 Owner 审批台真实功能验收通过。bbb Registry/KMS 与 ccc 法律的
sequence 1 reject 是故意执行的负向路径；按用户“无需追加”的要求，没有签发新 token 或
追加新决定。专业 receipt 仍为三项 approve、两项 reject，
`productionReleaseAuthorized=false`。

P1-M0-04 PostgreSQL/OpenBao 安全重建候选正式隔离生产回归
`p1-m0-04-remediated-regression-20260718T162844Z` 已在 Beelink `/data` 通过：

- PostgreSQL：001–011 共 11 条 migration；usage/audit/outbox 事务提交并可见；stale CAS
  writer 被拒绝；custom-format `pg_dump` 隔离恢复 RTO 722 ms，迁移、outbox、audit、usage
  和 revoked API-key metadata 全部恢复；候选容器删除重建后持久化可用。
- OpenBao：2.4.1 三节点保存 Raft snapshot 后逐节点升级到 `2.5.4-yujian.2`；升级前、
  升级后和 snapshot restore 后均为 3 peers/3 voters；TLS、Transit 旧签名、snapshot restore、
  leader 停止后 survivor secret 读取通过。
- Node 24 下 platform-api 真实启动；API key create/rotate grace/revoke/restart recovery 和
  secret 不落 PostgreSQL snapshot 通过；隔离 Redis 100/20 rate-limit、30/3 quota、AOF
  删除重建通过。
- report SHA-256：`b3592a9863a002e0480f1af70b85985481e6ae1909b3394b9b05e88cc2345169`；
  runner SHA-256：`8f20f319a1554abd3a30ec2cbc51989d674834ab725c5e5fef52b1e45cacf242`；
  platform acceptance SHA-256：`d59da85d79bc18130f4b4cdc2d1cdb279dee715fa2aa763cc8588ffe6f9373bc`。
  原始文件全部 mode 0600。

runner 在 fail-closed 迭代中修复了基础镜像 UID 写死、`docker exec` stdin 未透传、HA leader
固定为 A、jq false fallback、Docker 29 internal network 端口行为和合同包构建顺序问题。

### Isolation And Gate Boundary

候选使用独立 bridge/容器名、仅 `127.0.0.1` 端口和独立 `/data` 目录；完成后候选容器和网络
均已删除。当前 P2 PostgreSQL、Redis、OpenBao A/B/C 的 container ID、image ID、healthy 和
`restartCount=0` 前后相同，未修改 Compose、固定 digest 或运行服务。

`docs/acceptance/p1-remediated-candidate-evidence.json` 已把 `runtimeRegression` 更新为
`passed`，同时强制 `deploymentAllowed=false`、`runtimeSwitch=not-authorized`、
`productionRelease=blocked`。技术回归通过不覆盖 bbb/ccc reject。

### Verification

- Beelink 正式 run exit 0；清理后无候选容器/网络。
- `npm run supply-chain:verify-remediated-evidence` 通过：Critical 0、High 0、deployment false。
- `npm run test:supply-chain`：40/40；`npm run check`：全部 workspace lint/test 通过。
- platform-api 20/20、Owner approval 10/10、contracts 6/6、LiveKit compat 5/5。
- runner `bash -n`、Node `--check` 和 `git diff --check` 通过。

### Remaining P1-M0-04 Blockers

1. 当前运行镜像仍有 76 个 Critical；Owner/Gate 允许前不得切换安全重建候选。
2. ccc 当前 reject；335 个 `NOASSERTION`、LICENSE/NOTICE、source offer、归属和商标意见未关闭。
3. bbb Registry/KMS freeze 当前 reject；回滚接受、冻结和归档边界未批准。
4. aaa 原始 sequence 0 audit、Owner 联系/备份/专业资格、渗透测试和完整 Gate 1 证据仍缺。

### Background Tasks

- Beelink P2 PostgreSQL、Redis、OpenBao A/B/C 与 Owner 审批台继续运行。
- 无候选回归容器、网络、runner 或构建进程遗留；失败/正式 run 证据保留在 `/data`。

### Next Session Priorities

1. 不再把 PostgreSQL/OpenBao 生产回归列为 blocker；先关闭 335 个 `NOASSERTION` 与实际
   LICENSE/NOTICE/source offer 整改包。
2. bbb/ccc 只在实质结论改变时追加下一 sequence；原证据永不覆盖。
3. Owner/Gate 获批后才计划 canary、固定 digest 切换、回滚和切换后重扫；当前不部署。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
npm run supply-chain:verify-remediated-evidence
npm run test:supply-chain
git diff --check
ssh beelink@100.110.127.117 \
  'jq "{runId,status,deploymentAllowed,postgres,openbao,isolation,gate}" /data/models/yujianAI/evidence/p1-m0-04/p1-m0-04-remediated-regression-20260718T162844Z/report.json'
```

## 📌 SESSION HANDOFF STATUS — LICENSE/NOTICE、source offer 与 NOASSERTION 工程整改包完成

### Current Work

2026-07-19 已完成 P1-M0-04 许可证工程整改，不覆盖原始 SBOM 或任何 Owner receipt。真实
Beelink run 为 `p1-m0-04-license-remediation-20260718T165733Z`，证据根：

`/data/models/yujianAI/evidence/p1-m0-04/p1-m0-04-license-remediation-20260718T165733Z`

原始 PostgreSQL/OpenBao SPDX 共 405 个包，335 条 `licenseDeclared=NOASSERTION`；结论层保留
全部原始声明，只补 `licenseConcluded` 与 REVIEW annotation，最终两个结论层 SPDX 的
`licenseConcluded=NOASSERTION` 均为 0。335 条分类为：

- 331 条固定许可证证据；
- 1 条无独立内容的 Alpine 虚拟依赖包；
- 2 条指向逐包 SPDX/NOTICE 的 OCI 镜像聚合记录；
- 1 条 `github.com/yeqown/reedsolomon@v1.0.0` 显式 pending-legal。

`reedsolomon v1.0.0` tag commit `5441098c...` 不含 LICENSE/COPYING/NOTICE；上游直到
2026-03-08 commit `c5f4bc9...` 才增加 MIT 文件。整改包保存后续 MIT 文本与 upstream blob
SHA-256 `58fb0c85...24f69`，但没有静默追溯适用，而是写入
`LicenseRef-Yujian-ReedSolomon-Pending-Legal`，等待 ccc 专业判断。

### Actual Package And Integrity

整改包包含原始/结论层 SPDX、335 条 inventory、NOTICE、PostgreSQL/gosu/x-sys/OpenBao/
openbao-template 许可证、OpenBao 342 段依赖许可证、stubbolt 证据、构建 runner，以及实际
37,337,832 字节 `openbao-dist-2.5.4.tar.xz` 源码归档和固定 Dockerfile。

- report SHA-256：`85ed50b65b2d87f3f8818920966c589b28945748d4bc3c57c54cfe1c6bc788c7`
- inventory SHA-256：`60c45e17f381a36fc6c22b430c5a714d37e22de59bbe72f8c0f452dc3bf353aa`
- manifest SHA-256：`b8ed96caebb64f3121d0ab9f33bb33d8e27eb0f0aa7e62d3a287c9f2ac043d79`
- signature bundle SHA-256：`01cf40b0b0b7af9adcdd2a450a167e1802751714794af92f3d3d59ad2a2c2ab9`
- OpenBao source SHA-256：`5dd8bc003fcb8b1b601f0e75827df3819a9d5021b3094729c4d375508fd844b7`

`SHA256SUMS` 全量复核通过；cosign engineering-evidence blob 验签通过。证据目录设为 mode
0500、文件 mode 0400。当前 P2 PostgreSQL、Redis、OpenBao A/B/C 的 container ID、image、
healthy 和 `restartCount=0` 前后完全相同；没有切换、重启或重建运行容器。

### Repository Changes And Verification

- 新增 `tools/supply-chain/remediate-noassertion.mjs`、真实 runner、policy、NOTICE/source
  offer 模板、证据 verifier 和 fail-closed 测试。
- 新增 `docs/acceptance/p1-license-remediation-evidence.json`；
  `p1-remediated-candidate-evidence.json` 已引用该结论层，但仍保留 335 条原始声明和
  `deploymentAllowed=false`。
- README、设计索引、供应链评审、关闭计划、完成审计、Owner 包、上游 LICENSE/NOTICE/
  source offer 与真实运行方案已同步。
- `npm run test:supply-chain`：49/49；
  `npm run supply-chain:verify-remediated-evidence`：通过；
  `npm run supply-chain:verify-license-remediation`：通过；
  远端 manifest/signature 二次验证：通过；`git diff --check`：通过。

### Gate Status

许可证 `NOASSERTION` 的工程清单整改已完成，但法律/发布 Gate 没有被自动改写：ccc 当前
sequence 1 reject、bbb Registry/KMS 当前 sequence 1 reject 均保持有效；唯一 pending-legal
依赖仍需 ccc 判断。当前运行镜像仍有 76 个 Critical，aaa 原始 sequence 0 audit、Owner
联系/备份/专业资格和完整 Gate 1 证据仍缺。P1-M0-04、Gate 0、完整 Gate 1、Gate 7、正式
Gate 2 和生产发布继续 **blocked/not-passed**。

### Background Tasks

- Beelink P2 PostgreSQL、Redis、OpenBao A/B/C 与 Owner 审批台继续运行。
- 无许可证 runner 或候选容器进程遗留；只读整改证据保留在 `/data`。

### Next Session Priorities

1. ccc 基于新整改包判断 `reedsolomon v1.0.0`、source offer、NOTICE 与商标证据是否足以
   改变当前 legal reject；只有本人改变结论时才追加下一 sequence。
2. bbb Registry/KMS reject 的回滚接受、冻结和归档整改包仍需单独处理；不得由许可证包覆盖。
3. 两项 Owner reject 未改变前不得 canary、切换固定 digest 或重扫后宣称生产通过。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
npm run supply-chain:verify-license-remediation
npm run supply-chain:verify-remediated-evidence
npm run test:supply-chain
ssh beelink@100.110.127.117 \
  'cd /data/models/yujianAI/evidence/p1-m0-04/p1-m0-04-license-remediation-20260718T165733Z && sha256sum -c SHA256SUMS'
```

## 📌 SESSION HANDOFF STATUS — Registry/KMS freeze、恢复与 key lifecycle 开发完成，运行待执行

### Current Work

2026-07-19 已完成 bbb Registry/KMS reject 对应的技术整改实现，不覆盖 sequence 0/1 的
decision、signature、receipt 或 OpenBao audit。新增
`infra/registry/beelink/freeze-policy.json`，固定：

- Registry host/bind、Tailscale TLS/basic-auth、四个生产 OCI digest、TLS 30 天续期窗口、
  delete 禁用和手动 GC 边界；
- 全部 data/backup/evidence 路径落到 Beelink `/data/models/yujianAI`；
- Registry 与 OpenBao recovery 的 RPO 24 小时、RTO 4 小时目标和 loopback isolated restore；
- `openbao://yujian-oci-release`、当前三 voter 单 Beelink 故障域、ECDSA P-256 非导出 key、
  90 天轮换策略和禁止自动退役旧版本；
- bbb sequence 1 reject 的 exact receipt path/hash，`productionReleaseAuthorized=false`。

新增的 append-only 工具包括：

- `prepare-registry-kms-freeze.mjs`：以 `wx` 创建只读计划，目标存在即失败；
- `run-registry-recovery.sh`：显式维护确认后 quiesced backup，保存 registry data 与自举 OCI
  image archive；恢复只启动 `127.0.0.1:55443` 临时 Registry，校验四个 manifest、所有 blob、
  Cosign signature 和 SPDX attestation，没有生产覆盖 action；
- `run-kms-recovery.sh`：保存 OpenBao 加密 Raft snapshot 与脱敏 key metadata/public key，
  在 `127.0.0.1:19200` 临时单节点执行 restore，临时 init/unseal token 不归档；
- `create-registry-kms-freeze-authorization.mjs`：只有 bbb 追加 sequence 2+ approve/
  approve-with-conditions 且 aaa 当前批准时，才能生成绑定 exact policy hash 的维护授权；
- `run-kms-key-lifecycle.sh`：轮换前强制要求 Registry/KMS 恢复通过和 superseding
  authorization；轮换只给冻结 digest 添加 `candidate-not-authorized` probe 签名，保留旧 public
  key 和旧签名回滚校验；
- `create-kms-retirement-authorization.mjs`：旧版本 `min_available_version` 退役不可逆，必须在
  rotation 后由 bbb 和 aaa 分别追加新 receipt，再显式输入 `RETIRE`；发布仍不自动授权。

Registry compose 的运行镜像引用已改为签名后的 immutable digest；发生冷恢复时必须先从备份的
OCI bootstrap archive `docker load`，避免自托管 Registry 的循环依赖。机器状态文件
`docs/acceptance/p1-registry-kms-freeze-implementation.json` 明确记录“实现完成、运行未执行、测试
未执行、Owner reject 仍有效”。README、设计索引、生产 OCI 合同和开发完成审计已同步。

### Verification Boundary

用户本轮明确“测试先略过”，因此未运行 Node test、verifier、shell runner、Docker/Beelink
恢复或 key rotation。新增测试文件只作为后续验收合同保存，不能宣称 passed。未访问、未暂停、
未重启或修改 Beelink 当前容器，服务器当前运行状态本轮未刷新。

### Gate Status

本项开发实现不改变专业决定：bbb Registry/KMS sequence 1 `reject`、ccc 法律 sequence 1
`reject` 仍有效。Registry/KMS runtime evidence 全部为 `not-executed`；当前镜像 Critical、唯一
pending-legal、Owner 专业资格和完整 Gate 1 等缺口仍在。P1-M0-04、Gate 0、完整 Gate 1、
Gate 7、正式 Gate 2 和生产发布继续 **blocked/not-passed**。

### Background Tasks

- 本轮未启动任何本地或 Beelink background process。
- 已存在的 Beelink 服务未被本轮探测，不能从历史状态推断当前健康。

### Next Session Priorities

1. 继续按开发计划区分“代码未实现”和“仅待测试/审批”；下一开发切片优先关闭 M3-01/02 的
   生产 HA/TURN/capacity exporter 合同和部署实现，不把 24/72 小时运行证据提前写为通过。
2. bbb 仅在审阅本冻结 policy 和未来真实恢复证据后决定是否 supersede；当前无需签发 token。
3. 用户恢复测试授权后，先运行 policy/authorization verifier，再在 Beelink `/data` 依次执行
   Registry backup/isolated restore、KMS snapshot/isolated restore；key rotation 必须最后且需要
   bbb superseding approval。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short
sed -n '1,220p' infra/registry/README.md
cat docs/acceptance/p1-registry-kms-freeze-implementation.json
# 测试仍暂停时不要执行 npm、Docker、Beelink 或 key lifecycle 命令。
```

## 📌 SESSION HANDOFF STATUS — M3-01/02 HA、TURN、capacity 与 drain 开发完成，运行待执行

### Current Work

2026-07-19 已完成 M3-01/02 的生产实现切片：

- 新增 `@yujian/rtc-capacity-exporter`，通过官方 `RoomServiceClient` 汇总 Room、participant、
  publisher 和 track，并以 `participants × published tracks` 记录 subscription 保守上界；
  报告带短 TTL、单调 sequence、healthy/draining 状态，SIGTERM/SIGINT 在退出前尝试发送最终
  drain 报告。
- platform-api 新增独立认证的 `POST /internal/v1/rtc/capacity`、
  `RedisRtcCapacityProvider` Lua 原子 publish/reserve/release，以及 token 签发前的节点和租户
  quota 双重准入。报告过期、不健康、draining、Redis 不可用或全部节点超限时 fail-closed；
  票据签发失败会释放 lease。
- 新增 `POST /platform/v1/rtc/turn-credentials` 和 v1 合同，使用 coturn REST HMAC-SHA1
  短期凭据。shared secret 仅由部署 runtime 通过 `YUJIAN_TURN_SECRET_REF` 从 OpenBao/KMS
  解析，不进入 API 响应、chart values 或数据库。
- Helm 生产默认切换为 `dataServices.mode=external-ha`，要求 PostgreSQL/Redis URL Secret key
  和 NetworkPolicy CIDR；内置单副本数据库只在 `embedded-single` 开发模式渲染。新增双副本
  digest-pinned coturn Deployment、TLS/config Secret、PDB、zone spread、UDP/TCP/TLS 及有限
  relay 端口 Service；RTC 新增 PDB、90 秒 grace 和 capacity sidecar。
- 新增 `values-production.example.yaml`、OpenAPI、配置合同、README 和机器状态
  `docs/acceptance/m3-01-02-implementation.json`。package-lock 只更新了新 workspace 元数据。

### Verification Boundary

用户明确“测试先略过”，因此本切片未运行 TypeScript build/lint/unit tests、OpenAPI verifier、
Helm schema/template/lint、Docker、Kubernetes 或 Beelink 命令。仅执行了
`npm install --package-lock-only --ignore-scripts` 以登记 workspace；当前本机 Node v25.8.2
不满足仓库声明的 `>=22 <25`，npm 输出 engine warning，该命令不构成测试通过证据。

未运行 PostgreSQL/Redis HA、TURN UDP/TCP/TLS、容量竞争、过期报告、pod drain、AZ failover
或自动扩缩。新增测试文件仅保存验收合同，所有 runtime/test 状态均为 `not-executed`。

### Gate Status

M3-01/02 的代码与部署合同已实现，但 Gate 3 仍为 **not-passed**。bbb Registry/KMS sequence 1
reject、ccc 法律 sequence 1 reject 和其他 Gate 0/1/7 阻断未被本切片覆盖；
`productionReleaseAuthorized=false`。

### Background Tasks

- 本轮未启动任何本地或 Beelink background process。
- 未探测、暂停、重启或修改 Beelink 当前服务，不能从历史证据推断当前健康。

### Next Session Priorities

1. 测试继续暂停时，进入 M3-03/04：补生产入口/WAF-DDoS adapter 合同、证书轮换门禁，以及
   低基数 RTC 质量指标持久化/导出和面板 provisioning；保持 provider/集群证据未执行。
2. 随后开发 M3-06/07/08 的备份编排、Preview entitlement/usage 和 support ticket 闭环；
   M3-05/09/10 主要依赖外部运营商、设计伙伴与 24/72 小时运行，保留为验收待执行。
3. 恢复测试授权后先使用仓库要求的 Node 22/24，依次执行 build/unit/OpenAPI/Helm，再进入
   Beelink `/data` 的真实 HA、TURN、capacity/drain/AZ 验收。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short
cat docs/acceptance/m3-01-02-implementation.json
sed -n '1,260p' services/rtc-capacity-exporter/README.md
sed -n '1,300p' infra/helm/yujian-platform/README.md
# 测试仍暂停时不要执行 npm test/check/build、Helm、Docker、Kubernetes 或 Beelink 命令。
```

## 📌 SESSION HANDOFF STATUS — M3-03/04 入口安全与 RTC 质量观测开发完成，运行待执行

### Current Work

2026-07-19 继续完成 M3-03/04 开发切片：

- 新增 `infra/gateway/edge-security-contract.json`，冻结公网只暴露 `/platform/*` 与
  `/healthz`，禁止公开 `/internal/*`、`/metrics`、`/readyz`；Helm 新增受控 Ingress，必须提供
  精确 ingress controller namespace/pod selector、TLS Secret、WAF/DDoS policy 和证书 rollover
  evidence ref。NetworkPolicy 同时补 KMS 与可选外部 HTTPS CIDR，避免生产 runtime 被默认拒绝
  或反向放开全部 egress。
- 新增 `verify-certificate-rollover.mjs`：只读当前/下一张 X.509 公钥证书，校验 immutable
  SHA-256 fingerprint、SAN、有效期、激活/回滚 overlap 和证书不同；计划必须声明
  `privateKeyReadRequired=false`。工具不会读取私钥、更新 Secret、切流或回写“已轮换”。
- platform-api 在 RTC telemetry 成功持久化后输出全局低基数 RTT、jitter、packet loss、bitrate、
  audio level histogram，不携带 tenant/project/environment、node、Room 或 participant 标签；
  production 缺 durable `telemetryPersistence` 时启动 fail-closed。
- 新增 P50/P95/P99 recording/alert rules、只读 Grafana dashboard provisioning、Kubernetes scrape
  和 private remote-write 示例。remote-write token 只从挂载文件读取。
- 新增 `RtcTelemetryRetentionWorker`，对带 participant identity 的 PostgreSQL 原始样本按 1–90
  天策略分批删除；P2 runtime 默认 7 天并纳入可停止的 composite worker。Helm 同步
  `observability.rtcTelemetryRetentionDays`。
- 机器状态写入 `docs/acceptance/m3-03-04-implementation.json`；README、设计索引、Helm 和开发
  完成审计已同步。

### Verification Boundary

按用户“测试先略过”要求，未运行新写入的 Node tests、TypeScript build/lint、JSON/YAML parser、
Prometheus rule check、Grafana provisioning、Helm schema/template/lint、证书 verifier、Kubernetes、
云 WAF/DDoS、Docker 或 Beelink 命令。当前只进行源码和文件范围只读核对；不能宣称配置可渲染、
告警已触发、retention 已删除数据或证书 rollover 已通过。

### Gate Status

M3-03/04 的代码和配置合同已实现，所有 provider/runtime 验收均为 `not-executed`，Gate 3 继续
**not-passed**。bbb Registry/KMS sequence 1 reject、ccc 法律 sequence 1 reject 及 Gate 0/1/7
阻断仍有效；`productionReleaseAuthorized=false`。

### Background Tasks

- 本轮未启动本地或 Beelink background process。
- 未探测或修改 Beelink 服务，历史健康状态不作为当前证据。

### Next Session Priorities

1. 测试继续暂停时开发 M3-06/07/08：可恢复 backup orchestration、Preview entitlement/usage
   enforcement、support ticket 与短期授权/脱敏 bundle 证据闭环。
2. 对 M3-05/09/10 只补执行合同和证据适配器；运营商矩阵、设计伙伴、容量与 24/72 小时属于
   外部运行验收，不能用代码代替。
3. M3 剩余开发收口后进入 M4 5090 Agent/provider 的生产 registry、分布式 quota 和运行合同。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short
cat docs/acceptance/m3-03-04-implementation.json
sed -n '1,260p' infra/gateway/README.md
sed -n '1,280p' infra/observability/README.md
# 测试仍暂停时不要运行 verifier、npm test/check/build、Helm、云网关或 Beelink 命令。
```

## 📌 SESSION HANDOFF STATUS — M3-06/07/08 备份恢复、Preview entitlement 与支持闭环开发完成，运行待执行

### Current Work

2026-07-19 继续完成 M3-06/07/08 开发切片：

- 新增 `012_preview_operations.sql`，当前源码 schema 为 001–012；历史 P2/P1 的
  001–011 已验收证据保持原样，新 migration 本轮未执行。现行 P2/私有化/
  供应链回归脚本已对齐 12 migrations，历史 evidence verifier 仍允许 11 的不可变记录。
- `PostgresControlPlaneBackupCoordinator` 实现 planned/running/verified/failed 持久状态、
  CAS transition、KMS reference、无凭据对象 URI/sha256、RPO/RTO 和隔离 restore drill；
  类型与 PostgreSQL CHECK 都禁止 production overwrite。新增无 userinfo/query/fragment
  的 HTTPS provider adapter 和 `ops:control-plane-backup` 运维入口。
- 新增 `preview-v1` 非 overage 计划、环境 entitlement PostgreSQL 真值、version CAS、
  admin upsert/环境 read API/OpenAPI；RTC token 和 TURN credential 在 quota/签发前检查
  status、validity 和 feature，缺失/暂停/过期/未授权时 fail-closed。P2 closure 将在
  首个真实 Room 前显式创建 entitlement。
- `PostgresSupportService` 实现工单 idempotency fingerprint、version CAS、脱敏 no-media
  bundle，以及 hash-only、60–3600 秒、单 permission、ticket-bound 的一次性临时访问、
  原子消费、admin 撤销和不记 token 的 audit。首次 token 响应设置
  `Cache-Control: no-store`。`create-support-bundle.mjs` 仅保留 allowlist readiness，以
  0600/exclusive create 写入 bundle 和 digest manifest。
- 静态控制台已增加 Preview entitlement/配额/用量查看和支持工单创建/列表；
  响应脱敏扩展到 `accessToken`/credential/authorization/cookie。OpenAPI、README、runbook、
  开发完成审计和 `m3-06-08-implementation.json` 已同步。

### Verification Boundary

按用户“测试先略过”要求，本轮未运行 TypeScript build/lint/unit tests、OpenAPI
verifier、JSON/YAML parser、migration apply、PostgreSQL/Redis/OpenBao、backup provider、对象存储、
隔离恢复、浏览器、Docker、Helm、Kubernetes 或 Beelink 命令。新增测试文件只保存
合同，不是通过证据。本轮只做文件范围和源码静态阅读。

### Gate Status

M3-06/07/08 实现状态为 **completed / not-executed**，Gate 3 继续 **not-passed**。
M3-05/09/10 的运营商、设计伙伴、24/72 小时与故障注入仍是外部运行验收；
bbb Registry/KMS sequence 1 reject、ccc legal sequence 1 reject 及 Gate 0/1/7 阻断未被覆盖，
`productionReleaseAuthorized=false`。

### Background Tasks

- 本轮未启动任何本地或 Beelink background process。
- 未探测、停止、重启或修改 Beelink 当前服务。

### Next Session Priorities

1. 测试继续暂停时，补 M3-05/09/10 的运营商 probe evidence adapter、设计伙伴
   feedback/defect 状态机和长稳/故障注入报告 verifier；真实网络、客户和 24/72 小时仍留待执行。
2. M3 开发合同收口后进入 M4：5090 Agent provider credentials、artifact registry/SBOM/signature、
   distributed dispatch quota 与 canary/rollback 运行接线。
3. 恢复测试授权后先用 Node 22/24 执行 build/unit/OpenAPI/migration dry-run，再进入
   Beelink `/data` 的 provider、backup/restore、support/entitlement 真实验收。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short
cat docs/acceptance/m3-06-08-implementation.json
sed -n '1,280p' infra/runbooks/backup-restore.md
sed -n '1,280p' services/platform-api/src/postgres-support.ts
# 测试仍暂停时不要运行 npm test/check/build、OpenAPI verifier、migration、Docker、Helm 或 Beelink 命令。
```

## 📌 SESSION HANDOFF STATUS — M3–M7 计划内开发范围收口，测试与生产验收待执行

### Current Work

2026-07-19 按开发计划继续完成 M4–M7，并统一当前源码 schema 为 001–016：

- M4 已实现 Agent artifact receipt、canary/rollback、Redis dispatch quota、短期 provider
  workload identity、OpenAI-compatible provider/usage/cost、高风险工具审批与加密结果、Node/
  Python 取消传播和 Agent 网络边界。
- M5 已实现 SIP provider attestation、safe trunk/fraud/cost/capacity、入呼采用/外呼/DTMF/
  转接/挂断、Ingress/Egress 合规留存删除、不可变 usage/reconcile、质量指标和控制台。
- M6 已实现 CRD/Operator、digest Helm executor、离线包、external-HA、OpenBao Transit、
  SAML/SCIM/审计导出、License、远程协助、国内 provider、HarmonyOS/小程序受限 bridge 和
  客户验收归档。
- M7 已实现 PostgreSQL finalized-usage 事务计费、发票 CAS 与不可变 approval transition、
  provider statement/reconciliation/finance adjustment、内容寻址导出；健康观测过期失败关闭的
  多区域 RTC 路由；error budget normal/slowdown/freeze 与 on-call 严格状态机；八类安全审计
  manifest；LTS/迁移/status；Gate 0–10 RC freeze 和绑定 RC artifact digest/八类 Owner receipt
  的不可覆盖 GA 决策。
- 新增 `016_ga_commerce.sql`，历史 M6 的 001–015 实现快照保持不变；现行 migration/preflight/
  runtime smoke/供应链回归和备份默认值已对齐 16。
- `docs/planning/DEVELOPMENT_COMPLETION_AUDIT.md`、README、设计索引、M6/M7 实现文档和
  `m7-ga-implementation.json` 已同步为 development implemented / runtime not executed。

### Verification Boundary

按用户“测试先略过”要求，本轮未运行 TypeScript build/lint/unit/contract、OpenAPI/JSON/YAML
verifier、migration、PostgreSQL/Redis/OpenBao、财务/对象存储、RTC 区域故障、Prometheus、
安全扫描/渗透、Helm/Operator/Kubernetes、商业压测、灾备、Beelink、浏览器、RC 或 GA 工具。
新增测试文件、verifier 和实现 JSON 仅是合同，不是通过证据。

### Gate Status

- M0–M7 计划内开发范围：`implemented-not-run`。
- M1 A–C 历史运行基线保持通过；完整 Gate 1 未通过，D/E 未执行。
- Gate 6/8/9/10：代码已实现，真实验收未通过；Gate 7 继续 blocked。
- bbb Registry/KMS sequence 1 reject、ccc legal sequence 1 reject 和其他 Owner/合规阻断保持
  有效；`productionReleaseAuthorized=false`，未创建 RC，未作 GA 决定。

### Background Tasks

- 本轮未启动本地或 Beelink background process。
- 未探测、停止、重启或修改 Beelink 当前服务；历史健康状态不作为当前证据。

### Next Session Priorities

1. 用户恢复测试授权后，先使用受支持 Node 22/24 执行 workspace build/lint/unit/contract、
   OpenAPI、migration/preflight 和静态配置门禁，修复所有编译/合同问题。
2. 在 Beelink `/data` 与本机/手机按 M1、M3–M7 顺序执行真实 RTC/TURN、Agent 5090、provider、
   SIP/媒体、私有化、财务、长稳、压测、灾备和安全验收。
3. 只有 Gate 0–10 均有当前版本 passed evidence 且八类 Owner receipt 齐全时，才生成 frozen RC
   和 GA approve；任一缺口必须生成 rejected/blocked 记录。

### Resume Checklist

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short
cat docs/acceptance/m7-ga-implementation.json
sed -n '1,260p' docs/acceptance/M7_GA_IMPLEMENTATION_AND_EVIDENCE.md
sed -n '145,220p' docs/planning/DEVELOPMENT_COMPLETION_AUDIT.md
# 测试授权恢复前不要运行 npm test/check/build、verifier、migration、Docker/Helm/Kubernetes 或 Beelink 命令。
```
