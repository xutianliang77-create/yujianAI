# 开发完成审计基线

版本：v1.0  
日期：2026-07-18
审计范围：`docs/planning/01-development-tasks-and-plan.md` 的 M0-M7 任务，以及
`docs/acceptance/01-acceptance-tasks-and-plan.md` 的 Gate 要求。  
审计方式：检查当前工作区的源码、配置、文档、本地回归及 2026-07-17 A-C 运行证据；服务器端报告
位于 Beelink 的 `outputs/beelink/20260717T075738Z`，客户端 summary 位于本仓库的
`outputs/client/20260717T080332Z/`。本审计不把 A-C 证据扩展为完整 Gate 1，也不把它扩展为
D/E 证据。

## 1. 状态定义

- **done**：工作区已有与任务直接对应的实现或正式记录；运行验证仍需单独看验收状态。
- **partial**：只实现了任务的一部分，或只有设计/脚本，没有完整可运行闭环。
- **missing**：没有可证明任务已实现的当前工作区产物。
- **baseline-passed**：指定范围的可重复运行证据已通过，但不代表该里程碑或 Gate 全部通过。
- **deferred**：实现已存在，但仍缺指定环境、外部依赖或目标 SDK 的运行证据。

`done` 或 `baseline-passed` 都不等于 Gate 通过。必须按 Gate 的完整验收条件判断发布状态。

## 2. M0：决策与治理

| 任务 | 状态 | 当前证据 | 缺口/后续 |
| --- | --- | --- | --- |
| M0-01 品牌、模式和非目标 | done | `README.md`、`docs/product/BRAND_AND_PRODUCT_CHARTER.md`；明确不做翻译 | 正式商标、域名和商业边界仍待决策 |
| M0-02 冻结上游版本 | done | `infra/upstream/livekit-versions.json` 含 11 个组件 tag/commit 和镜像 digest；2026-07-18 Beelink 已完成真实 mirror/fsck/replay 与重复 clean build | 持续保留每次升级报告 |
| M0-03 mirror/fork/patch queue | partial | 10 个工作区外 bare mirror fsck 通过，11 component 真实 replay `status=passed`，冻结构建重复后产物哈希一致；冲突 fail-closed 与周度 workflow 已有 | 真实 fork 权限、差异通知和 `rtc-owner`/`release-owner` 审批仍缺 |
| M0-04 许可证/NOTICE/商标评审 | blocked | 当前/官方候选/安全重建 SPDX、Grype、Cosign 证据已归档；安全重建 Critical 0/High 0；四个生产 OCI 签名/attestation 与外部读取通过；PostgreSQL/OpenBao 隔离生产回归通过且当前 P2 未切换；335 条安全重建原始 `NOASSERTION` 已由独立签名结论层全部分类，结论层 `NOASSERTION=0`，实际 OpenBao 源码随包提供；Owner 审批台真实功能验收通过；五份原始 receipt、aaa 与 ddd sequence 1 approval、bbb Registry/KMS 与 ccc 法律 sequence 1 reject、逐序号 audit 和 acceptance v2 已归档 | 当前运行镜像仍为 76 Critical/465 原始 `NOASSERTION`；`reedsolomon v1.0.0` 有 1 个显式法律待判项；bbb Registry/KMS 与 ccc 两项驳回、aaa 原始决定 audit 缺口及 Owner 联系/备份/专业资格材料未关闭；功能验收不等同于专业批准 |
| M0-05 平台 ID/OpenAPI/事件/矩阵 | partial | `packages/platform-contracts`、OpenAPI、`tools/api/verify-openapi.rb` 门禁、兼容矩阵、事件合同和审批模板 | 完整 SDK 矩阵和变更审批运行证据仍缺 |
| M0-06 语言、数据库、分析仓、队列、部署选型 | partial | ADR-0003、PostgreSQL migration、Redis/OTel/Prometheus、Helm 边界 | 首区云厂商、生产 HA 和具体队列/分析仓仍待冻结 |
| M0-07 首区、网络资源、私有化拓扑 | partial | Beelink 双节点 compose 和 runbook | 首个托管区域、TURN、生产网络、私有化拓扑未确定 |
| M0-08 合规适用性清单 | partial | `docs/compliance/APPLICABILITY.md` 已列 PIPL/等保/ICP/AI/SIP owner 和 blocker | 法律结论、资质和签字仍缺 |
| M0-09 移出翻译合同 | done | `docs/archive/translation-v1/`；历史 `packages/contracts` 已从根 workspace、默认构建和发布流程移除，当前新服务无引用 | 继续防止历史包进入新发布流程 |
| M0-10 ADR/威胁模型/分类/DoD | partial | ADR-0001..0004、数据分类、`docs/governance/DOD.md` 和审批矩阵 | 评审签字和当前版本威胁演练仍缺 |

**M0 结论：partial 且 M0-04 blocked；Gate 0 未通过。** clean upstream、供应链原始
证据、335 条许可证工程结论、实际源码包、五项原始决定、aaa sequence 1 approval、bbb
Registry/KMS 与 ccc 法律 sequence 1 reject 均已补；当前镜像漏洞、唯一法律待判项、ADR
决策、fork/通知权限、两项签名驳回及 Owner 专业资格材料仍阻断。

## 3. M1：上游发行版与兼容实验室

| 任务 | 状态 | 当前证据 | 缺口/后续 |
| --- | --- | --- | --- |
| M1-01 镜像 LiveKit 组件 | partial | 版本 manifest 覆盖 Server/Protocol/SIP/Ingress/Egress/Agents/SDK，11 component 冻结源码 clean build/核心包静态测试已通过 | 未提供全部运行镜像、发布仓库和运行配置 |
| M1-02 clean upstream 镜像 | baseline-passed | Beelink `/data` 中 10 个 bare mirror 和 11 component replay 通过；Server/Protocol/SIP/Ingress/Egress/Agents/Node/Web/Flutter 冻结构建或静态测试已重复校验 | 不替代上游发布镜像运行、语见发行版对照和 owner 审批 |
| M1-03 单区 RTC、Redis、TURN、观测 | partial | 双 Server+Redis healthcheck、2026-07-17 双节点 ready 和 Node PCM 音频通过、TURN 配置边界、Prometheus/OTel 配置和 SLO | TURN 集群真实镜像、生产 TLS、指标端点和告警运行证据 |
| M1-04 JS/Flutter/iOS/Android/Node/Python 矩阵 | partial | Web/Flutter/Node A-C baseline passed；Node/Web/Flutter synthetic media/lifecycle harness、Python official Room join/leave smoke harness、iOS/Android target README、机器可读矩阵 | iOS/Android/Python 实际运行和完整 SDK Gate 证据 |
| M1-05 Token/RoomService/Webhook/Data/RPC 合同 | partial | Node/Web/Flutter baseline 的 token、RoomService、Data/RPC 通过；官方 WebhookReceiver 签名/replay adapter；新增 publisher HMAC/成功/失败/DLQ/requeue 单测 | 完整 webhook 生命周期/错误矩阵和运行证据 |
| M1-06 音频/视频/屏幕/弱网基线 | partial | Node/Web/Flutter 已加入合成 camera/screen、mute/unpublish、receiver quality sample、SDK-internal synthetic reconnect；Linux netem runner 已加入，但新增路径尚未重新运行 | 视频/屏幕运行证据、TURN/弱网注入、真实 reconnect 和服务端质量聚合 |
| M1-07 自动重放 patch queue | partial | patch queue actual-apply、metadata/digest/path 门禁、成功/冲突失败测试、CI 归档与 2026-07-18 真实 LiveKit mirror replay/clean build 均通过 | owner 审批、fork 权限和差异通知演练仍缺 |
| M1-08 周期上游同步 | partial | `.github/workflows/upstream-sync.yml` 周度任务 | owner、差异通知和升级演练缺失 |
| M1-09 许可证/SBOM/漏洞/签名流水线 | blocked | Syft/Grype/Cosign 当前、官方候选及安全重建证据均可验证；安全重建 Critical 0/High 0；335 条原始声明已形成零 `licenseConcluded=NOASSERTION` 的签名结论层和实际源码包；生产 OCI 签名、Redis 与 PostgreSQL/OpenBao 隔离生产回归、bbb Redis、aaa 安全和 ddd 中国分发批准均完成；acceptance verifier 强制保持部署未授权 | 当前运行镜像 76 Critical；`reedsolomon v1.0.0` 法律待判；bbb Registry/KMS 与 ccc 两项驳回及专业资格材料 |
| M1-10 nightly sandbox | partial | `infra/sandbox` profile/README、digest/credential lifecycle runner 和 scheduled workflow | 实际租户隔离、自动销毁、失败告警和访问入口运行证据 |

**M1 结论：partial；A-C baseline passed，完整 Gate 1 未通过。** 已有 Beelink 双节点
Node 与本机 Web/Flutter Web 音频、Data、RPC 证据；不能替代完整 SDK、TURN、视频、
屏幕共享、reconnect、Webhook、iOS/Android/Python 和安全矩阵。

## 4. M2：中国控制面最小闭环

| 任务 | 状态 | 当前证据 | 缺口/后续 |
| --- | --- | --- | --- |
| M2-01 Tenant/Member/RBAC | partial | `PlatformStore`、成员管理 API、角色合同、管理员门禁、持久化 snapshot；P2-04 已真实验证 OIDC onboarding、邀请、持久 RBAC、重启恢复和跨 tenant IDOR 拒绝 | 完整企业身份 provider/会话、细粒度管理策略和多租户规模验收仍缺 |
| M2-02 Project/Environment | partial | CRUD、状态、默认 quota/region/retention、Environment version CAS、PostgreSQL migrations 与 runtime 接线；P2-04 已验证 onboarding 到真实 RTC 首房间闭环 | 删除/恢复全矩阵、区域策略持久化和多副本一致性仍缺 |
| M2-03 API key/KMS/轮换 | partial | 只显示一次、hash 校验、轮换/撤销、API key metadata/list GET、可配置双 key grace period、SQL schema、snapshot 只保存 hash；Beelink production acceptance 已验证 API key rotate grace/revoke 传播、三节点 OpenBao HTTPS/Raft、leader 停止后 resolver 读回和 secret 不落库 | 当前为单主机 quorum；auto-unseal、跨主机 HA、生产 KMS 合规签字仍缺 |
| M2-04 Token issuer/endpoint discovery | partial | issuer、endpoint discovery、region router、nodeId 和 grant ceiling；P2-04 已由 Beelink 服务端与本机 Mac RTC 客户端验证首次入房和 scope/IDOR 门禁 | 持久化 region policy、跨节点容量状态和完整撤销矩阵未完成 |
| M2-05 Region/Quota | partial | region/residency/capacity router、token quota snapshot、可注入 `PlatformResourceUsageProvider`/`PlatformTokenQuotaProvider`、`CompositePlatformResourceUsageProvider` 字段 owner 合并校验、Redis token reservation/lease adapter；Beelink production acceptance 已验证两个 Redis client 的 100 次限流竞争严格 20 次放行、30 次 token quota 仅 3 个并发、release 无泄漏和 Redis rm/up 重建 | participant/Room/data/媒体实时 provider wiring、跨主机 Redis 故障域仍未完成 |
| M2-06 Room/Participant 查询 adapter | partial | `YujianRoomServiceAdapter`、可注入 `PlatformRoomService` 和授权后的 rooms/participants 查询、更新、移除 API；P2-04 已通过真实 RTC participant 首房间链路 | 多节点一致性、审计细节和完整 Room mutation 矩阵未完成 |
| M2-07 Audit/outbox/webhook | partial | SQL outbox、事务 persistence、HMAC、指数退避、heartbeat claim、DLQ/requeue、KMS secret resolver 和 migration runner；P2-01 验证事务可见性，P2-05 验证真实 HMAC/重试/DLQ/requeue、重启去重和 secret 引用 | 业务多副本发布、跨主机恢复和外部 webhook provider 对账仍缺 |
| M2-08 控制台 onboarding/quickstart | partial | `apps/console` quickstart、webhook destination UI、CLI；P2-04 已验证 OIDC、邀请、onboarding、RBAC 和真实 RTC 首房间 API 工作流 | 完整浏览器产品体验、错误引导和企业身份源验收未完成 |
| M2-09 usage 原始记录 | partial | token usage dedupe、SQL ledger、durable usage/audit projection、billing ledger、quota/telemetry；P2-06 已验证 data-rights export/delete receipt、崩溃恢复、隔离 `pg_dump` restore 和 Redis 从 PostgreSQL 重建 | 保留/归档策略、实际数据 provider 执行和账单对账仍缺 |
| M2-10 OpenAPI/CLI/中文文档 | partial | `docs/api/openapi.yaml` 已覆盖控制面/RTC/媒体、webhook destination、billing statement、invoice adjustment 和 data-rights 路径，`tools/api/verify-openapi.rb` 唯一 operationId/$ref 门禁，中文 README、`tools/cli/yujian.mjs`（含 webhook-list/save/disable）和 quickstart | 发布 CLI 包和完整上游响应 schema 未完成 |

**M2 结论：功能仍为 partial；P2-01–06/M2 技术验收范围通过，正式 Gate 2 未通过。**
Beelink 服务端和本机 Mac 客户端已验证真实 PostgreSQL/Redis/OpenBao、事务 outbox/CAS、
OIDC/邀请/onboarding/持久 RBAC、Webhook 生命周期、数据权利、备份恢复和 Redis 重建。
正式 Gate 2 仍受 Gate 0/1、两项 Owner 驳回、单主机 quorum、跨主机 HA、auto-unseal 及
完整产品/企业身份 provider 范围约束。

## 5. M3：单区域托管 RTC Preview

| 任务 | 状态 | 当前证据 | 缺口/后续 |
| --- | --- | --- | --- |
| M3-01 Kubernetes/数据库/Redis/TURN 生产化 | partial | Helm API/双 RTC/PG/Redis Service/探针/NetworkPolicy/HPA/PDB、TURN boundary 和 offline manifest | HA PostgreSQL/Redis、真实 TURN image/TLS、upgrade evidence |
| M3-02 多可用区、容量准入、drain | partial | topology spread、termination grace、worker drain、region router、`YujianRtcCapacityController`、可注入平台 API admission | RTC SFU capacity exporter、AZ failover 和自动扩缩运行验证 |
| M3-03 WAF/DDoS/限流/网络/证书 | partial | HTTP payload/timeout、Bearer 校验、单进程 rate-limit guard、可注入 Redis Lua `RedisRateLimiter` 和 TLS/网关边界文档 | 无公网 WAF/DDoS、生产 Redis 接线和证书轮换 |
| M3-04 SDK telemetry/质量面板 | partial | RTC quality sample 合同、`/telemetry/rtc` 上报/窗口 P50/P95/P99 汇总、`PostgresRtcTelemetryPersistence`/`008_rtc_telemetry.sql`、SLO 目标 | 客户端全矩阵 stats、分析仓、面板和长期保留未完成 |
| M3-05 synthetic/运营商测试 | partial | synthetic probe、兼容矩阵和网络/TURN边界 | 移动/联通/电信、华北/华东/华南真实数据 |
| M3-06 incident/backup/restore/runbook | partial | backup/restore/runbook、support bundle、Beelink runbook | 控制面真实备份恢复演练和 RPO/RTO 证据 |
| M3-07 Preview 套餐/配额/用量 | partial | PricePlan/UsageLedger、quota contracts、Preview plan | entitlement API、真实账单展示和限额运行证据 |
| M3-08 support 工单/脱敏 bundle | partial | support bundle generator、短期授权/审计边界文档 | 工单系统和真实导出审计证据 |
| M3-09 设计伙伴试用 | partial | `docs/preview/design-partner-trial.md` 冻结 tenant 隔离、反馈和 P0/P1 流程 | 真实客户环境、反馈和缺陷关闭证据 |
| M3-10 性能/长稳/故障注入 | partial | capacity calculator、fault injection/long-stability plans、Beelink acceptance entry | Beelink 24/72h、容量、故障注入和报告 |

**M3 结论：partial；Gate 3 未通过。** 已有 region router、RTC telemetry、Helm 最小部署和容量计算器骨架；生产 Kubernetes/数据库/Redis/TURN、长稳和故障注入仍缺失。

## 6. M4：Agent Platform Preview

| 任务 | 状态 | 当前证据 | 缺口/后续 |
| --- | --- | --- | --- |
| M4-01 Python/Node worker 基线 | partial | Node worker deadline/cancel/drain、环境变量驱动 register/heartbeat、Node/Python `WorkerControlClient` 的 register/heartbeat/start/complete/fail/claim、Node/Python `AgentDispatchRunner`、Node `YUJIAN_AGENT_HANDLER_MODULE` handler 注入、Python `LiveKitAgentRoomConnector`（官方 `livekit.rtc.Room`，依赖锁定 `livekit-agents==1.6.5`）、Node `YujianAgentRoomConnector`（兼容别名 `LiveKitAgentRoomConnector`）官方 `@livekit/rtc-node` join/leave 边界、可选 Python Agent Dockerfile | 真实 provider/token job lifecycle 和 Beelink 运行证据 |
| M4-02 artifact registry/SBOM/签名 | partial | AgentArtifact digest/signature contract、SBOM/release policy、可注入 `createAgentArtifactVerifier()` runtime module、production fail-closed 和 Helm 模块路径门禁 | OCI registry、签名验证服务和实际构建产物 |
| M4-03 deployment controller/canary/rollback | partial | `AgentControlPlane` desired/observed generation、canary/rollback、artifact/deployment/dispatch 内部 HTTP API、worker lifecycle HTTP API、`AgentControlSnapshot`/`PostgresAgentControlPersistence` version CAS、persistence+artifact verifier production runtime module fail-closed | rolling rollout 和运行证据 |
| M4-04 dispatch rule/配额 | partial | AgentDispatch contract、dedupe/deadline/controller state、环境绑定与 dispatch create/cancel API、rule/trigger API、worker 原子 claim 和并发上限 | distributed capacity/quota backend、真实队列运行证据 |
| M4-05 provider plugin 合同 | partial | ProviderCapability contract、ProviderAdapter、按 capability/region/streaming 过滤的 `ProviderRegistry`、每 binding 独立 circuit/deadline runtime、仅对可重试错误 failover 的 HTTPS JSON provider adapter | 具体国内/国际 provider credentials、协议映射和运行证据 |
| M4-06 secret binding/network policy | partial | KMS adapter、Agent GPU compose boundary、Helm 单卡 worker 与 Agent Control TLS/NetworkPolicy | workload identity、真实 KMS binding 和 egress enforcement |
| M4-07 trace/成本/延迟/错误观测 | partial | traceId/deadline contracts、OTel/Prometheus config、SLO、platform-api 受控路由 label + request duration histogram、Node `AgentDispatchObserver`（claim/complete/fail/poll error、traceId、duration）、`AgentDispatchMetricsObserver` 低基数 sink、provider-runtime `ObservedProviderAdapter` | provider cost attribution、统一 metrics pipeline and dashboards |
| M4-08 tool risk/授权/审计 | partial | L0-L3 tool contract、`ToolPolicyEngine` 显式审批/幂等/角色门禁、部署侧 `ToolResultStore`/`ToolAuditSink` 持久化边界 | persistent provider、human handoff and运行证据 |
| M4-09 取消/drain/provider 降级 | partial | Node worker AbortSignal/cancel/drain、注册 heartbeat、`WorkerControlClient` lifecycle、`AgentDispatchRunner`、ProviderCircuitBreaker/deadline/failover | queue budget、Python client and distributed runtime evidence |
| M4-10 Agent quickstart/示例 | partial | Node/Python quickstart and worker references | end-to-end deployment reproduction |

**M4 结论：partial；Gate 4 未通过。** 已有 Agent artifact/deployment/dispatch 状态机合同、可恢复
snapshot controller、规则触发、原子 claim、Node/Python handler runner 和官方 Node/Python RTC
join/leave adapter；registry/provider、网络策略、真实 job lifecycle 和 Beelink RTX 5090 运行时仍缺失。

## 7. M5：SIP、Ingress 与 Egress Preview

| 任务 | 状态 | 当前证据 | 缺口/后续 |
| --- | --- | --- | --- |
| M5-01 provider/运营商/合规 Gate | partial | `docs/compliance/APPLICABILITY.md`、media feature gate、provider boundary | 运营商合作书面条件和法律签字 |
| M5-02 SBC/ACL/credential/反欺诈 | partial | TURN/gateway security boundary、SIP 默认禁用、secret adapter | SBC/TLS/SRTP、号码白名单、反欺诈 provider |
| M5-03 inbound trunk/Room dispatch | partial | `SipCallV1`、`sipTrunkId` 选择、MediaOps state machine、可注入官方 `MediaOpsLiveKitProvider`、platform/media lifecycle query API、内部 provider status callback | trunk/dispatch provider、provider webhook 对账 |
| M5-04 outbound 幂等/授权/预算/熔断 | partial | SIP idempotency、quota gate、ProviderCircuitBreaker、COMPLIANCE gate | 真实外呼 API、预算账本和 provider circuit |
| M5-05 DTMF/转接/挂断/对账 | partial | official SipClient DTMF/transfer boundary、RoomService hangup、participant identity contract、平台/media-ops transfer/hangup routes、operation idempotency | DTMF replay、状态对账和运行证据 |
| M5-06 Ingress 创建/状态/配额 | partial | official IngressClient adapter、可选 provider 激活/失败迁移、IngressJob contract、platform-api authorized route、请求指纹幂等/quota、内部 status callback、可恢复 media snapshot/version CAS | provider 对账、状态运行证据 |
| M5-07 Egress 录制/转推/对象存储/删除 | partial | official EgressClient adapter、可选 provider 激活/失败迁移、EgressJob contract、`MediaRetentionWorker` 到期对象删除/deletion evidence、严格 retention/deletion 快照恢复、platform-api authorized route、retention boundary、内部 status callback、Postgres media snapshot/version CAS | object storage provider、真实删除证据和运行验收 |
| M5-08 SIP/media usage/provider 对账 | partial | UsageLedger、media contracts、reconcile API boundary | provider invoice ingestion、冲正和真实对账 |
| M5-09 电话质量/失败/灾备 | partial | RTC telemetry/SLO、call lifecycle and backup runbook boundaries | PDD/接通率/DTMF/运营商质量采集和故障演练 |
| M5-10 控制台/文档/示例 | partial | `docs/api/media-quickstart.md`、media boundary、platform/media 查询 API、media-ops HTTP(S) service、platform client 的稳定 4xx/5xx 错误映射、创建幂等指纹与目标字段合同 | 控制台 UI、全量 provider 示例和运行证据 |

**M5 结论：partial；Gate 5 未通过，SIP 能力必须保持禁用。** 已有 SIP/Ingress/Egress 合同和幂等状态机骨架；provider、SBC、LiveKit Ingress/Egress adapter、录制存储与合规证据仍缺失。

## 8. M6：私有化与国内生态

| 任务 | 状态 | 当前证据 | 缺口/后续 |
| --- | --- | --- | --- |
| M6-01 Helm/Operator/离线包/镜像仓 | partial | Helm chart 已含双 RTC、PG/Redis Service、可选媒体/Agent Control TLS、单卡 worker；新增统一 workspace Node service Dockerfile、offline manifest、private preflight 和 release manifest | Operator、真实离线镜像包、升级 hook/registry |
| M6-02 最小/高可用拓扑/容量计算器 | partial | capacity calculator、RTC 双副本、topology spread/HPA/PDB、双节点 Beelink topology | HA RTC/PG/Redis topology and capacity evidence |
| M6-03 国内 IaaS/KMS/对象存储/日志 adapter | partial | `services/platform-adapters` 冻结 KMS、对象存储、身份和日志接口，并新增 HTTPS gateway adapters、canonical base64/算法/subject/key/URI 响应校验 | 至少一个真实 provider、KMS 加密实现和私有替换验收 |
| M6-04 OIDC/SAML/审计导出 | partial | enterprise identity/SCIM adapter contracts、audit export boundary、内置严格 RS256/JWKS `OidcIdentityAdapter`（含 exp/nbf finite 校验）、`OidcPlatformIdentityBridge` scope resolver、平台 API `PlatformIdentityProvider` runtime 接线 | SAML/SCIM provider、真实身份映射与审计导出运行验收 |
| M6-05 备份/恢复/升级/回滚预检 | partial | SQL migration 001–011、backup/restore runbook、release/private preflight、`tools/private-deployment/upgrade-preflight.mjs` 的连续迁移/schema skew/上一版镜像策略校验、production runtime module chart gate | 自动备份工具、兼容检查和演练记录 |
| M6-06 License/离线策略 | partial | 严格 Ed25519 license verifier（payload 字段、tenant/feature/node/grace/expiry/base64url 校验）、offline manifest and grace period | 签发服务、客户 license distribution 和离线演练 |
| M6-07 支持包/巡检/远程协助审批 | partial | redacted support bundle、private preflight、短期授权文档 | 客户巡检报告、审批存储和真实操作审计 |
| M6-08 国内模型 provider | partial | ProviderCapability/Adapter contracts、KMS/secret policy、cost/quality SLO | 至少一个国内 provider implementation 和审批证据 |
| M6-09 HarmonyOS/小程序 adapter | partial | `docs/ecosystem/harmonyos-mini-program-feasibility.md` 冻结可行性评估和非承诺边界 | 原型、权限/审核结论和最小 adapter |
| M6-10 客户环境验收工具 | partial | Beelink preflight/acceptance + `tools/private-deployment/preflight.sh` 的 001–011 migration、离线/release manifest、artifact root 路径/digest 校验、chart schema 和 helm lint 门禁 | 通用客户安装、离线校验和报告归档仍需实现 |

**M6 结论：partial；Gate 6 未通过。** 已有 Helm 最小 chart、离线包边界和容量计算器；Operator、完整离线镜像包、KMS/对象存储/OIDC/升级恢复仍缺失。

## 9. M7：商业与 GA 加固

| 任务 | 状态 | 当前证据 | 缺口/后续 |
| --- | --- | --- | --- |
| M7-01 价格/账单/合同/发票/对账 | partial | PricePlan/Invoice contracts、`UsageLedger` 的价格校验、`PostgresBillingReadModel` 严格发票/明细/冲正 SQL 投影、draft→issued→paid/void 生命周期、provider reconcile 和平台 API billing statement/invoice 查询 | 财务系统、真实账单导出和签字 |
| M7-02 多区域调度/区域故障 | partial | `YujianRegionRouter`、capacity/residency metadata、无满足区域/驻留策略候选时显式拒绝、readiness | region health state、故障迁移、生产数据驻留 enforcement |
| M7-03 SLO/error budget/on-call | partial | `infra/observability/slo.yaml` 冻结服务目标、预算和告警条件 | Prometheus/OTel、值班升级、错误预算自动化和复盘流程 |
| M7-04 安全测试/渗透/等保/供应链审计 | partial | 安全基线、依赖锁定和历史扫描记录 | 无当前版本安全测试、渗透报告、SBOM/签名审计 |
| M7-05 数据权利/删除/导出/证据 | partial | `DataRightsService` 的带 subject/kind 指纹幂等 submit/get/list、`PostgresDataRightsService` 条件 upsert 和 process、received→processing→completed/rejected 状态、evidence URI 和 export/delete/rectify executor contracts，平台 API data-rights 路由 | 实际数据扫描/删除执行和证据归档 |
| M7-06 LTS/升级窗口/支持政策 | partial | `docs/operations/LTS_AND_SUPPORT.md`、release manifest/preflight | 版本服务、SLA/status page 和实际发布流程 |
| M7-07 文档/迁移/status page | partial | 架构、设计、计划、验收、API、运维/LTS 和 status page 模板 | 完整生成 API、迁移手册、真实 status page 和发布证据 |
| M7-08 商业压测/灾备 | partial | `docs/commercial/load-and-dr-plan.md`、fault injection plan 和 backup runbook | 真实容量、备份恢复、区域故障演练和签字 |
| M7-09 RC 冻结 | partial | release manifest、evidence preflight、手动 release workflow、SBOM workflow | 镜像签名/验证、实际 RC artifact 和冻结记录 |
| M7-10 GA 评审 | partial | `docs/commercial/ga-readiness-review.md` 冻结角色和阻断条件 | 实际 Gate 证据与签字记录 |

**M7 结论：partial；GA Gate 未通过。** 已有价格/发票、数据主体和 SLO 合同；计费账本、SLO/值班管线、安全审计、RC 冻结和 GA 签字仍缺失。

## 10. 验收 Gate 审计摘要

| Gate | 状态 | 当前证据 | 主要缺口 |
| --- | --- | --- | --- |
| Gate 0 设计/上游 | partial（供应链 blocked） | 章程、manifest、ADR、合规、当前/候选/安全重建/生产 OCI/license-remediation 证据及 Redis/PostgreSQL/OpenBao 隔离回归；重建 Critical 0/High 0，335 条声明已分类、实际源码随包、四个签名/attestation/外部读取通过；五项原始 receipt、aaa 与 ddd sequence 1 approval、bbb Registry/KMS 与 ccc 法律 sequence 1 reject 及逐序号 audit 已归档 | 当前运行镜像 76 Critical；1 个法律待判项、bbb Registry/KMS 与 ccc 两项驳回、aaa 原始决定 audit 及专业资格材料缺失 |
| Gate 1 LiveKit 兼容 | partial（A-C baseline passed；供应链 blocked） | Beelink 双节点 Node 与本机 Web/Flutter Web 的 token、join、音频、Data/RPC、RTP bytes 证据；报告 run id `20260717T075738Z` / `20260717T080332Z`；当前固定镜像 SPDX/扫描/验签已执行 | Webhook、视频、屏幕共享、TURN/弱网、真实 reconnect、iOS/Android/Python，以及 Critical/许可证供应链阻断 |
| Gate 2 控制面 | partial（P2-01–06 技术验收通过） | scoped token、CRUD、API key/KMS、quota、持久化、Room adapter、migration/OpenAPI；Beelink/Mac 已验证事务 outbox/CAS、production API、Redis 竞争/重建、API key 传播、OpenBao HTTPS/Raft failover、OIDC/邀请/onboarding/持久 RBAC、Webhook、data-rights 与 `pg_dump` restore | Gate 0/1、两项 Owner 驳回、跨主机 HA、auto-unseal、完整企业身份/产品矩阵和生产签字 |
| Gate 3 媒体/容量 | partial | Helm/PG/Redis/TURN boundary、telemetry、capacity/probe/runbook | 真实 TURN/网络矩阵、24/72h、容量和质量指标 |
| Gate 4 Agent | partial | worker、deployment、provider、tool policy、deadline/circuit skeleton | 全部 Agent 生命周期、真实 provider/GPU 和故障场景 |
| Gate 5 SIP/Ingress/Egress | partial | official media adapters、state/idempotency、Postgres media snapshot boundary、compliance gate | provider/运营商、录制删除、电话质量和真实验收 |
| Gate 6 计量/账单 | partial | UsageLedger、PricePlan/Invoice、provider reconcile contract | 财务对账、冲正、真实数据和签字 |
| Gate 7 安全 | blocked | 安全基线、当前/候选/安全重建 SBOM/扫描、私有 Registry、OpenBao KMS、四个 OCI 签名/attestation、外部逐 blob 校验及 Redis/PostgreSQL/OpenBao 隔离回归；重建 Critical 0/High 0；aaa 与 ddd sequence 1 批准、bbb Registry/KMS 与 ccc sequence 1 驳回、逐序号 audit 和 acceptance v2 已归档 | 当前运行镜像仍有 76 Critical；渗透、bbb Registry/KMS 与 ccc 驳回、aaa 原始决定 audit 缺口及专业资格材料 |
| Gate 8 私有化 | partial | Helm、offline manifest、license verifier、adapter contracts、preflight | Operator、安装/升级/恢复/轮换/卸载验收 |
| Gate 9 可靠性/灾备 | partial | fault injection plan、backup/restore runbook、SLO/capacity artifacts | 节点/Redis/PG/provider/AZ 实际故障和 RPO/RTO |
| Gate 10 合规/发布 | partial | applicability list、release manifest/preflight、LTS policy | 适用结论、协议/DPA、资质、签字和发布冻结 |

## 11. 当前交付判定和推荐顺序

当前仓库是 **M0-M7 的合同、服务骨架、适配器边界和部署/发布骨架，加上 M1 A-C
运行基线**，仍不是可宣称 Gate 全部通过的生产“开发完毕”。A-C 只能证明已覆盖的
Node/Web/Flutter Web 音频场景；不能替代法律签字、真实 provider、HA 运维和生产持久化证据。

建议下一轮实现顺序：

1. 先补齐 M0/M1：ADR/合规 owner、clean upstream 可复现证据、完整 SDK、视频/屏幕、TURN/弱网、reconnect、Webhook、SBOM/签名和 nightly sandbox。
2. 保持已通过的 P2-01–06/M2 技术证据不变，补正式 Gate 2 的跨主机 HA、auto-unseal、企业身份/产品矩阵和签字前置条件。
3. P0/P1 阻断关闭后，再接入真实 TURN/观测、5090 Agent/provider、运营商和对象存储，逐个关闭 M3-M7 Gate。
4. 法律/合规、财务、SRE 和发布负责人完成签字后，才可进入 Preview/GA。

## 12. 本轮恢复清单

```text
1. 保留并归档 Beelink `20260717T075738Z` 服务器报告，不含 secret。
2. 以 `20260717T080332Z` 客户端报告回写 Web/Flutter baseline 证据。
3. 将 Gate 1 缺口拆成视频/屏幕、TURN/弱网/reconnect、Webhook、SDK、SBOM 五组可审查任务。
4. 以本文件为基线，将 partial/deferred 任务拆成可审查 PR，并在每个 PR 绑定 Gate 和证据路径。
```
