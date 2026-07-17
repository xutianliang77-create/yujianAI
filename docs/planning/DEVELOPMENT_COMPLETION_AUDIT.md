# 开发完成审计基线

版本：v1.0  
日期：2026-07-17  
审计范围：`docs/planning/01-development-tasks-and-plan.md` 的 M0-M7 任务，以及
`docs/acceptance/01-acceptance-tasks-and-plan.md` 的 Gate 要求。  
审计方式：检查当前工作区的源码、配置、文档及 2026-07-17 A-C 运行证据；服务器端报告
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
| M0-02 冻结上游版本 | done | `infra/upstream/livekit-versions.json` 含 11 个组件 tag/commit 和镜像 digest；2026-07-17 Beelink acceptance 已完成联网 manifest 校验 | 保留可复现 clean mirror 报告 |
| M0-03 mirror/fork/patch queue | partial | clean mirror sync、patch queue replay guard、周度 GitHub workflow | 工作区外首次同步、fork 权限和冲突报警仍无运行证据 |
| M0-04 许可证/NOTICE/商标评审 | partial | `infra/upstream/THIRD_PARTY_NOTICES.md`、上游策略文档 | 法律签字、商标边界、SBOM 归档和发布检查未完成 |
| M0-05 平台 ID/OpenAPI/事件/矩阵 | partial | `packages/platform-contracts`、OpenAPI、`tools/api/verify-openapi.rb` 门禁、兼容矩阵、事件合同和审批模板 | 完整 SDK 矩阵和变更审批运行证据仍缺 |
| M0-06 语言、数据库、分析仓、队列、部署选型 | partial | ADR-0003、PostgreSQL migration、Redis/OTel/Prometheus、Helm 边界 | 首区云厂商、生产 HA 和具体队列/分析仓仍待冻结 |
| M0-07 首区、网络资源、私有化拓扑 | partial | Beelink 双节点 compose 和 runbook | 首个托管区域、TURN、生产网络、私有化拓扑未确定 |
| M0-08 合规适用性清单 | partial | `docs/compliance/APPLICABILITY.md` 已列 PIPL/等保/ICP/AI/SIP owner 和 blocker | 法律结论、资质和签字仍缺 |
| M0-09 移出翻译合同 | done | `docs/archive/translation-v1/`；历史 `packages/contracts` 已从根 workspace、默认构建和发布流程移除，当前新服务无引用 | 继续防止历史包进入新发布流程 |
| M0-10 ADR/威胁模型/分类/DoD | partial | ADR-0001..0004、数据分类、`docs/governance/DOD.md` 和审批矩阵 | 评审签字和当前版本威胁演练仍缺 |

**M0 结论：partial；Gate 0 未通过。** 主要阻断是合规清单、ADR 决策和可复现上游
mirror/许可证证据。

## 3. M1：上游发行版与兼容实验室

| 任务 | 状态 | 当前证据 | 缺口/后续 |
| --- | --- | --- | --- |
| M1-01 镜像 LiveKit 组件 | partial | 版本 manifest 覆盖 Server/Protocol/SIP/Ingress/Egress/Agents/SDK | 未提供所有组件的构建/发布镜像和运行配置 |
| M1-02 clean upstream 镜像 | partial | Beelink/local compose 使用官方固定 digest、无语见媒体 patch | clean mirror 构建产物和 digest 复现报告缺失 |
| M1-03 单区 RTC、Redis、TURN、观测 | partial | 双 Server+Redis healthcheck、2026-07-17 双节点 ready 和 Node PCM 音频通过、TURN 配置边界、Prometheus/OTel 配置和 SLO | TURN 集群真实镜像、生产 TLS、指标端点和告警运行证据 |
| M1-04 JS/Flutter/iOS/Android/Node/Python 矩阵 | partial | Web/Flutter/Node A-C baseline passed；Node/Web/Flutter synthetic media/lifecycle harness、Python official Room join/leave smoke harness、iOS/Android target README、机器可读矩阵 | iOS/Android/Python 实际运行和完整 SDK Gate 证据 |
| M1-05 Token/RoomService/Webhook/Data/RPC 合同 | partial | Node/Web/Flutter baseline 的 token、RoomService、Data/RPC 通过；官方 WebhookReceiver 签名/replay adapter；新增 publisher HMAC/成功/失败/DLQ/requeue 单测 | 完整 webhook 生命周期/错误矩阵和运行证据 |
| M1-06 音频/视频/屏幕/弱网基线 | partial | Node/Web/Flutter 已加入合成 camera/screen、mute/unpublish、receiver quality sample、SDK-internal synthetic reconnect；Linux netem runner 已加入，但新增路径尚未重新运行 | 视频/屏幕运行证据、TURN/弱网注入、真实 reconnect 和服务端质量聚合 |
| M1-07 自动重放 patch queue | partial | patch queue replay guard、clean mirror sync 和 CI workflow | 非空 patch 的冲突失败、clean build 和报告未建立 |
| M1-08 周期上游同步 | partial | `.github/workflows/upstream-sync.yml` 周度任务 | owner、差异通知和升级演练缺失 |
| M1-09 许可证/SBOM/漏洞/签名流水线 | partial | SBOM generator/verifier、cosign blob verifier、supply-chain/release workflow、NOTICE/license policy | 容器 SBOM、签名验证、漏洞门禁和当前运行证据 |
| M1-10 nightly sandbox | partial | `infra/sandbox` profile/README、digest/credential lifecycle runner 和 scheduled workflow | 实际租户隔离、自动销毁、失败告警和访问入口运行证据 |

**M1 结论：partial；A-C baseline passed，完整 Gate 1 未通过。** 已有 Beelink 双节点
Node 与本机 Web/Flutter Web 音频、Data、RPC 证据；不能替代完整 SDK、TURN、视频、
屏幕共享、reconnect、Webhook、iOS/Android/Python 和安全矩阵。

## 4. M2：中国控制面最小闭环

| 任务 | 状态 | 当前证据 | 缺口/后续 |
| --- | --- | --- | --- |
| M2-01 Tenant/Member/RBAC | partial | `PlatformStore`、成员管理 API、角色合同、管理员门禁、静态 credential role→permission 白名单、创建幂等请求指纹、`PlatformStoreSnapshot`/`PostgresPlatformStorePersistence` 恢复边界、可注入 `PlatformIdentityProvider` OIDC/SAML bridge | 部署侧身份 provider、SSO/会话和持久化 RBAC 细粒度策略未完成 |
| M2-02 Project/Environment | partial | CRUD、状态、默认 quota/region/retention、Tenant/Project/Environment GET、Environment PATCH version CAS、PostgreSQL migrations、quota policy 表、`PostgresPlatformPersistence` 和 `PlatformStoreSnapshot` version 字段 | runtime 外部接线、删除/恢复策略未完成 |
| M2-03 API key/KMS/轮换 | partial | 只显示一次、hash 校验、轮换/撤销、API key metadata/list GET、可配置双 key grace period、Local envelope KMS adapter、SQL schema、snapshot 只保存 hash；Beelink OpenBao 2.4.1 runtime token 读取与 32-byte secret round-trip 通过 | API key rotate/revoke 端到端传播、KMS TLS/HA 和真实恢复演练未完成 |
| M2-04 Token issuer/endpoint discovery | partial | issuer、endpoint discovery、region router、nodeId 和 grant ceiling | 撤销传播、持久化 region policy 和跨节点容量状态未完成 |
| M2-05 Region/Quota | partial | region/residency/capacity router、token quota snapshot、可注入 `PlatformResourceUsageProvider`/`PlatformTokenQuotaProvider`、`CompositePlatformResourceUsageProvider` 字段 owner 合并校验、Redis token reservation/lease adapter；Beelink Redis 7.2.7 runtime atomic-counter smoke 与重启通过 | 多副本竞争不超限、participant/Room/data/媒体实时 provider wiring、Redis 故障演练未完成 |
| M2-06 Room/Participant 查询 adapter | partial | `YujianRoomServiceAdapter`、可注入 `PlatformRoomService` 和授权后的 rooms/participants 查询、更新、移除 API | 多节点一致性、审计细节和完整 Room mutation 矩阵未完成 |
| M2-07 Audit/outbox/webhook | partial | SQL outbox schema、`PostgresPlatformPersistence` 事务/`SKIP LOCKED`、`OutboxPublisher` HMAC/指数退避/动态 `WebhookDestinationProvider`/持久化 retry+dead-letter metadata、`OutboxPublisherWorker` 可停止批量消费循环、失败状态写入异常保护、`requeueDeadLetter()`、`PostgresWebhookDestinationPersistence`/`007_webhook_destinations.sql`、环境 scoped webhook destination GET/PUT/DELETE API、`PersistentWebhookDestinationProvider` + `WebhookSecretResolver` KMS 边界、admin-auth `POST /platform/v1/admin/outbox/{eventId}:requeue`、`PlatformStoreSnapshot`、API 可注入持久化并原子写 usage+audit/outbox、runtime module 注入入口、`tools/database/migrate.mjs` advisory-lock migration runner；Beelink runtime wiring/build 和受限 OpenBao resolver smoke 通过 | 真实 webhook 签名/重试/DLQ/replay、业务事务 outbox 和跨副本恢复验收未完成 |
| M2-08 控制台 onboarding/quickstart | partial | `apps/console` 静态健康/就绪/token quickstart、environment webhook destination 列出/保存/禁用、浏览器内存凭据和脱敏、`quickstart.http` 与 `tools/cli/yujian.mjs` | 注册/邀请、完整错误引导和 Beelink 浏览器证据未完成 |
| M2-09 usage 原始记录 | partial | token usage dedupe、SQL ledger schema、`PostgresPlatformPersistence` usage upsert + `listUsage/listAudit` durable read projection（含审计枚举恢复校验）、`PostgresPlatformResourceUsageProvider` durable counters、`PlatformStoreSnapshot`、billing ledger、quota/usage 查询和 telemetry 汇总、API 可注入事务写入 | 生产 wiring、保留/归档和 provider 对账 |
| M2-10 OpenAPI/CLI/中文文档 | partial | `docs/api/openapi.yaml` 已覆盖控制面/RTC/媒体、webhook destination、billing statement、invoice adjustment 和 data-rights 路径，`tools/api/verify-openapi.rb` 唯一 operationId/$ref 门禁，中文 README、`tools/cli/yujian.mjs`（含 webhook-list/save/disable）和 quickstart | 发布 CLI 包和完整上游响应 schema 未完成 |

**M2 结论：partial；Gate 2 未通过。** 控制面最小 API、迁移执行器、Beelink 外部
PostgreSQL/Redis/OpenBao 部署切片、runtime module 和 adapter smoke 已实现，但仍缺分布式 quota、webhook、SSO
及业务流和恢复演练证据。

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
| M6-05 备份/恢复/升级/回滚预检 | partial | SQL migration 001–008、backup/restore runbook、release/private preflight、`tools/private-deployment/upgrade-preflight.mjs` 的连续迁移/schema skew/上一版镜像策略校验、production runtime module chart gate | 自动备份工具、兼容检查和演练记录 |
| M6-06 License/离线策略 | partial | 严格 Ed25519 license verifier（payload 字段、tenant/feature/node/grace/expiry/base64url 校验）、offline manifest and grace period | 签发服务、客户 license distribution 和离线演练 |
| M6-07 支持包/巡检/远程协助审批 | partial | redacted support bundle、private preflight、短期授权文档 | 客户巡检报告、审批存储和真实操作审计 |
| M6-08 国内模型 provider | partial | ProviderCapability/Adapter contracts、KMS/secret policy、cost/quality SLO | 至少一个国内 provider implementation 和审批证据 |
| M6-09 HarmonyOS/小程序 adapter | partial | `docs/ecosystem/harmonyos-mini-program-feasibility.md` 冻结可行性评估和非承诺边界 | 原型、权限/审核结论和最小 adapter |
| M6-10 客户环境验收工具 | partial | Beelink preflight/acceptance + `tools/private-deployment/preflight.sh` 的 001–008 migration、离线/release manifest、artifact root 路径/digest 校验、chart schema 和 helm lint 门禁 | 通用客户安装、离线校验和报告归档仍需实现 |

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
| Gate 0 设计/上游 | partial | 章程、版本 manifest、ADR、合规清单、OpenAPI/矩阵和 DoD | 法律签字、生成门禁和评审记录 |
| Gate 1 LiveKit 兼容 | partial（A-C baseline passed） | Beelink 双节点 Node 与本机 Web/Flutter Web 的 token、join、音频、Data/RPC、RTP bytes 证据；报告 run id `20260717T075738Z` / `20260717T080332Z`；新增 Web/Flutter 覆盖仍为 implemented-deferred | Webhook、视频、屏幕共享、TURN/弱网、真实 reconnect、iOS/Android/Python、SBOM/签名 |
| Gate 2 控制面 | partial | scoped token、CRUD、API key/KMS boundary、quota、`PostgresPlatformPersistence`、`PostgresPlatformStorePersistence`、Redis lease/token reservation、outbox/webhook、usage、Room adapter、`YUJIAN_PLATFORM_RUNTIME_MODULE` 注入入口、migration runner、静态 console 和 OpenAPI 门禁；Beelink P2-01/02/03 8/8 migration、runtime build、Redis atomic counter、OpenBao secret round-trip 与重启 smoke | 事务 outbox/CAS 业务流、多副本 quota、真实 webhook 投递/replay、SSO、注册/邀请、备份恢复和 owner 签字 |
| Gate 3 媒体/容量 | partial | Helm/PG/Redis/TURN boundary、telemetry、capacity/probe/runbook | 真实 TURN/网络矩阵、24/72h、容量和质量指标 |
| Gate 4 Agent | partial | worker、deployment、provider、tool policy、deadline/circuit skeleton | 全部 Agent 生命周期、真实 provider/GPU 和故障场景 |
| Gate 5 SIP/Ingress/Egress | partial | official media adapters、state/idempotency、Postgres media snapshot boundary、compliance gate | provider/运营商、录制删除、电话质量和真实验收 |
| Gate 6 计量/账单 | partial | UsageLedger、PricePlan/Invoice、provider reconcile contract | 财务对账、冲正、真实数据和签字 |
| Gate 7 安全 | partial | 安全基线和静态策略 | 当前版本安全测试、漏洞门禁、渗透和供应链证据 |
| Gate 8 私有化 | partial | Helm、offline manifest、license verifier、adapter contracts、preflight | Operator、安装/升级/恢复/轮换/卸载验收 |
| Gate 9 可靠性/灾备 | partial | fault injection plan、backup/restore runbook、SLO/capacity artifacts | 节点/Redis/PG/provider/AZ 实际故障和 RPO/RTO |
| Gate 10 合规/发布 | partial | applicability list、release manifest/preflight、LTS policy | 适用结论、协议/DPA、资质、签字和发布冻结 |

## 11. 当前交付判定和推荐顺序

当前仓库是 **M0-M7 的合同、服务骨架、适配器边界和部署/发布骨架，加上 M1 A-C
运行基线**，仍不是可宣称 Gate 全部通过的生产“开发完毕”。A-C 只能证明已覆盖的
Node/Web/Flutter Web 音频场景；不能替代法律签字、真实 provider、HA 运维和生产持久化证据。

建议下一轮实现顺序：

1. 先补齐 M0/M1：ADR/合规 owner、clean upstream 可复现证据、完整 SDK、视频/屏幕、TURN/弱网、reconnect、Webhook、SBOM/签名和 nightly sandbox。
2. 在已完成 Beelink P2-01/02/03 部署切片上，继续完成注册/邀请/SSO/onboarding、持久化 RBAC、分布式限流、Webhook 和备份恢复演练。
3. 再接入真实 TURN/观测、5090 Agent/provider、运营商和对象存储，逐个关闭 M3-M7 Gate。
4. 法律/合规、财务、SRE 和发布负责人完成签字后，才可进入 Preview/GA。

## 12. 本轮恢复清单

```text
1. 保留并归档 Beelink `20260717T075738Z` 服务器报告，不含 secret。
2. 以 `20260717T080332Z` 客户端报告回写 Web/Flutter baseline 证据。
3. 将 Gate 1 缺口拆成视频/屏幕、TURN/弱网/reconnect、Webhook、SDK、SBOM 五组可审查任务。
4. 以本文件为基线，将 partial/deferred 任务拆成可审查 PR，并在每个 PR 绑定 Gate 和证据路径。
```
