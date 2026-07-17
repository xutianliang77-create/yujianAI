# 语见AI Helm 私有化拓扑

此 chart 提供控制面、官方 LiveKit RTC 双副本、PostgreSQL/Redis 单副本、可选媒体控制面和
Agent Control/单 GPU worker 的私有化拓扑。生产环境仍必须由客户提供存储类、Ingress/WAF、
证书、备份和节点故障域；RTC 媒体核心保持官方镜像，不在 chart 内改写。

安装前必须创建 `yujian-platform-secrets`，至少包含：

- `YUJIAN_PLATFORM_CREDENTIALS_JSON`、`YUJIAN_PLATFORM_ADMIN_CREDENTIAL`。
- `LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET` 和 `LIVEKIT_CONFIG`（后者包含 RTC 的 Redis、keys、
  TCP/UDP 与 node_ip 配置）。
- `POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB`、`REDIS_PASSWORD`。
- 启用媒体或 Agent Control 时，分别提供 `YUJIAN_MEDIA_INTERNAL_CREDENTIAL`、
  `YUJIAN_AGENT_INTERNAL_CREDENTIAL`；启用 Agent Control 时还必须提供独立的
  `YUJIAN_AGENT_ADMIN_CREDENTIAL`，用于 artifact、deployment、dispatch 和 rule 管理，不能与
  worker credential 复用。

`rtc.primaryWsUrl` 必须是客户端可达的 `wss://` 地址。启用 `mediaOpsEnabled` 或
`agentControlEnabled` 时，必须同时启用对应 TLS secret，并将 `mediaOps.baseUrl` /
`agentControl.baseUrl` 设置为 `https://` 服务地址。chart 会拒绝以明文 HTTP 暴露这两个内部
控制面。

`tools/private-deployment/preflight.sh` 会检查 001–008 migration、离线 manifest、release
manifest 和 production runtime module 路径；它不会替代集群安装、备份恢复或回滚演练。

此 chart 将 `NODE_ENV` 固定为 `production`。生产控制面必须设置 `platformRuntime.modulePath`，指向平台镜像内由部署方维护的 ESM runtime
module。该 module 负责注入 PostgreSQL/Redis/KMS、实时 RTC/Agent/Media 资源用量、分布式 token quota、计费和数据权利 adapter；可用
`postgresUrlSecretKey`、`redisUrlSecretKey` 将连接地址从现有 Secret 传入。未设置时 API 使用
内存 adapter，只适合开发和静态合同检查，不能作为生产持久化方案。生产 runtime 必须提供
`resourceUsage.snapshot(scope)` 和 `tokenQuota.reserve(scope, policy)`，否则平台拒绝启动，
避免用零计数或进程内并发计数错误放行配额。
同一 runtime module 还必须返回 `storePersistence`，由 `006_platform_store.sql` 的 snapshot
表恢复并保存控制面资源；快照只含 API key hash，不含明文 secret。

Agent Control 生产环境应设置 `agentControl.persistenceModulePath`，指向导出
`createAgentControlPersistence()` 的部署侧 ESM module，并依赖 `003_agent_control.sql` 的
snapshot 表恢复 artifact/deployment/dispatch/worker 状态；`NODE_ENV=production` 会拒绝缺少该
adapter 的进程。
同时设置 `agentControl.artifactVerifierModulePath`，指向导出
`createAgentArtifactVerifier()` 的部署侧 ESM module；它负责 OCI digest、签名引用和 SBOM
校验，生产进程缺少 verifier 会 fail-closed。

`features.sipEnabled` 和 `features.egressEnabled` 默认关闭，只有完成 provider、号码、录制
保留和合规 Gate 后才能打开。SIP 调用必须携带 `sipTrunkId`，或通过
`mediaOps.defaultSipTrunkId` 提供默认 trunk；trunk 凭据不进入 chart values。启用
`mediaOps.providerEnabled` 时填写 `mediaOps.rtcPrimaryUrl`（可选 secondary URL）并从
secret 注入官方 LiveKit API key/secret。`features.agentWorkerEnabled` 只允许声明一个 GPU 副本，默认
请求 `nvidia.com/gpu: 1`；Beelink 的唯一 RTX 5090 仍须先通过预检。

启用 `mediaOpsEnabled` 时生产必须设置 `mediaOps.persistenceModulePath`，由部署侧模块提供
`MediaOpsPersistence`；media-ops 会在缺少该模块时拒绝启动。若同时启用
`features.egressEnabled`，同一模块还必须导出 `createMediaOpsRetentionWorker({ control, persist })`，
由部署侧对象存储 adapter 执行删除并返回 deletion evidence；缺少 worker 时生产进程拒绝启动。
`features.sipEnabled` 或 `features.egressEnabled` 未启用 `features.mediaOpsEnabled` 时，chart 会直接拒绝渲染。
