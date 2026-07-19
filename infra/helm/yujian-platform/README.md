# 语见AI Helm 私有化拓扑

此 chart 提供控制面、官方 LiveKit RTC 双副本、可选 RTC capacity sidecar、生产 TURN、
外部 PostgreSQL/Redis HA 接线、可选媒体控制面和 Agent Control/单 GPU worker 的私有化拓扑。
生产环境仍必须由客户提供存储类、Ingress/WAF、
证书、备份和节点故障域；RTC 媒体核心保持官方镜像，不在 chart 内改写。

安装前必须创建 `yujian-platform-secrets`，至少包含：

- `YUJIAN_PLATFORM_CREDENTIALS_JSON`、`YUJIAN_PLATFORM_ADMIN_CREDENTIAL`。
- `LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET` 和 `LIVEKIT_CONFIG`（后者包含 RTC 的 Redis、keys、
  TCP/UDP 与 node_ip 配置）。
- `POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB`、`REDIS_PASSWORD`。
- `YUJIAN_RTC_CAPACITY_CREDENTIAL`；启用 capacity 时必须是独立的 32+ 字符内部凭据。
- 启用媒体或 Agent Control 时，分别提供 `YUJIAN_MEDIA_INTERNAL_CREDENTIAL`、
  `YUJIAN_AGENT_INTERNAL_CREDENTIAL`。媒体还必须提供独立
  `YUJIAN_MEDIA_PROVIDER_CALLBACK_CREDENTIAL`，不能与 platform-api 内部凭据复用；启用 Agent Control 时还必须提供独立的
  `YUJIAN_AGENT_ADMIN_CREDENTIAL`，用于 artifact、deployment、dispatch 和 rule 管理，不能与
  worker credential 复用。

`rtc.primaryWsUrl` 必须是客户端可达的 `wss://` 地址。启用 `mediaOpsEnabled` 或
`agentControlEnabled` 时，必须同时启用对应 TLS secret，并将 `mediaOps.baseUrl` /
`agentControl.baseUrl` 设置为 `https://` 服务地址。chart 会拒绝以明文 HTTP 暴露这两个内部
控制面。

`tools/private-deployment/preflight.sh` 会检查 001–016 migration、离线 manifest、release
manifest 和 production runtime module 路径；它不会替代集群安装、备份恢复或回滚演练。

此 chart 将 `NODE_ENV` 固定为 `production`。生产控制面必须设置 `platformRuntime.modulePath`，指向平台镜像内由部署方维护的 ESM runtime
module。该 module 负责注入 PostgreSQL/Redis/KMS、实时 RTC/Agent/Media 资源用量、分布式 token quota、计费和数据权利 adapter；可用
`postgresUrlSecretKey`、`redisUrlSecretKey` 将连接地址从现有 Secret 传入。未设置时 API 使用
内存 adapter，只适合开发和静态合同检查，不能作为生产持久化方案。生产 runtime 必须提供
`resourceUsage.snapshot(scope)` 和 `tokenQuota.reserve(scope, policy)`，否则平台拒绝启动，
避免用零计数或进程内并发计数错误放行配额。
chart 的生产默认 `dataServices.mode=external-ha`，不会创建单副本 PostgreSQL/Redis；必须设置
两个 runtime URL secret key 和实际 HA 服务 CIDR。`embedded-single` 只保留本地开发用途，
不能用于 Gate 3。RTC capacity sidecar 以 5 秒周期上报 15 秒 TTL 的保守用量，Redis Lua
原子清理过期 lease 并在 token 签发前执行 participant/publisher admission；未上报、过期、
unhealthy 或 draining 的节点不会接收新 ticket。

生产公网入口应启用 `gateway.enabled`，并提供精确 ingress controller selector、TLS Secret、
WAF/DDoS policy 证据引用和证书 rollover plan 引用。chart 只公开 `/platform` 与 `/healthz`，
不会把 `/internal`、`/metrics` 或 `/readyz` 放到公网 Ingress。provider-specific annotation 由部署方
提供；引用字段本身不代表云防护已开通。RTC 原始质量样本默认保留 7 天，可通过
`observability.rtcTelemetryRetentionDays` 设置 1–90 天。

启用 TURN 时必须提供 digest-pinned coturn image、两个以上副本、TLS/config Secret、公开
TURN URL、OpenBao secret reference 和匹配的 relay 端口范围。完整生产覆盖示例见
`values-production.example.yaml`。Secret 中的 coturn `static-auth-secret` 与 platform runtime
读取的 KMS secret 必须是同一值；明文不得进入 values。
同一 runtime module 还必须返回 `storePersistence`，由 `006_platform_store.sql` 的 snapshot
表恢复并保存控制面资源；快照只含 API key hash，不含明文 secret。

Agent Control 生产环境应设置 `agentControl.persistenceModulePath`，指向导出
`createAgentControlPersistence()` 的部署侧 ESM module，并依赖 `003_agent_control.sql` 的
snapshot 表恢复 artifact/deployment/dispatch/worker 状态；`NODE_ENV=production` 会拒绝缺少该
adapter 的进程。
同时设置 `agentControl.artifactVerifierModulePath`，指向导出
`createAgentArtifactVerifier()` 的部署侧 ESM module；它负责 OCI digest、签名引用和 SBOM
校验，生产进程缺少 verifier 会 fail-closed。
该 runtime module 还必须导出 `createAgentDispatchQuota()`，或用
`agentControl.dispatchQuotaModulePath` 指定独立模块；生产缺少 Redis 分布式准入时拒绝启动。
启用 worker 时还必须启用 `agent.workloadIdentity`、指定已由集群管理的 ServiceAccount；
chart 关闭默认 service-account token，只投影 600–3600 秒、固定 audience 的 token。
Agent Control 只能访问 PG/Redis/KMS/制品校验 CIDR，worker 只能访问 DNS、Agent Control、
RTC、KMS 和 `agent.providerEgressCidrs:443`。

`features.sipEnabled` 和 `features.egressEnabled` 默认关闭，只有完成 provider、号码、录制
保留和合规 Gate 后才能打开。SIP 调用必须携带 `sipTrunkId`，或通过
`mediaOps.defaultSipTrunkId` 提供默认 trunk；trunk 凭据不进入 chart values。启用
`mediaOps.providerEnabled` 和 RTC URL/API key/secret 仅用于非生产开发启动。生产必须由
`mediaOps.persistenceModulePath` 指向的部署模块基于 workload identity 返回请求级 provider
credential，chart 不向 media-ops 注入长期 LiveKit secret。`features.agentWorkerEnabled` 只允许声明一个 GPU 副本，默认
请求 `nvidia.com/gpu: 1`；Beelink 的唯一 RTX 5090 仍须先通过预检。

启用 `mediaOpsEnabled` 时生产必须设置 `mediaOps.persistenceModulePath`，由部署侧模块提供
`MediaOpsPersistence`；media-ops 会在缺少该模块时拒绝启动。若同时启用
`features.egressEnabled`，同一模块还必须导出 `createMediaOpsRetentionWorker({ control, persist })`，
由部署侧对象存储 adapter 执行删除并返回 deletion evidence；缺少 worker 时生产进程拒绝启动。
`features.sipEnabled` 或 `features.egressEnabled` 未启用 `features.mediaOpsEnabled` 时，chart 会直接拒绝渲染。

生产媒体 runtime module 还必须导出 `createMediaOpsProvider()`、
`createMediaOpsReconciliationWorker()`、`createMediaProviderStatusVerifier()`；启用 SIP 时必须导出
`createMediaOperationAdmission()`，执行签名合规回执、风险决策和 Redis 原子预算预留。启用
SIP 还必须提供 `createMediaLifecycleObserver()` 持久化终态质量。Admission 必须声明生产就绪，
并接入 Redis SIP 频率/并发和 Ingress/Egress active capacity。启用 Egress 时继续要求

生产 values 必须设置 `dataServices.enforceProductionTopology=true`，此时 schema 强制
external-HA、PostgreSQL/Redis TLS、至少三个故障域和稳定的 topology evidence reference。
`npm run private:capacity-plan` 可生成 RTC/PG/Redis 初始容量与 RPO/RTO 目标，但输出只是规划，
不能替代真实压测、主从切换和恢复演练。
`createMediaOpsRetentionWorker()`。media-ops Service 保持集群内部；外部
provider webhook 应先进入客户私有 webhook adapter，再用独立 callback credential 调内部状态端点。
NetworkPolicy 只允许 PG/Redis/KMS、RTC 和显式 `mediaOps.externalHttpsEgressCidrs`。
