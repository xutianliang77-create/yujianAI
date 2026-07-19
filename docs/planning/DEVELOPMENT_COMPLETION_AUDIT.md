# 开发完成审计基线

版本：v1.1
日期：2026-07-19
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
| M0-04 许可证/NOTICE/商标评审 | blocked | 当前/官方候选/安全重建 SPDX、Grype、Cosign 证据已归档；安全重建 Critical 0/High 0；四个生产 OCI 签名/attestation 与外部读取通过；PostgreSQL/OpenBao 隔离生产回归通过且当前 P2 未切换；335 条安全重建原始 `NOASSERTION` 已由独立签名结论层全部分类，结论层 `NOASSERTION=0`，实际 OpenBao 源码随包提供；Owner 审批台真实功能验收通过；五份原始 receipt、aaa 与 ddd sequence 1 approval、bbb Registry/KMS 与 ccc 法律 sequence 1 reject、逐序号 audit 和 acceptance v2 已归档；Registry/KMS freeze policy、`/data` append-only plan、Registry/OpenBao 备份和隔离恢复、key rotation/不可逆退役及 rollback verifier 已开发 | 当前运行镜像仍为 76 Critical/465 原始 `NOASSERTION`；`reedsolomon v1.0.0` 有 1 个显式法律待判项；Registry/KMS 新工具尚未运行，bbb Registry/KMS 与 ccc 两项驳回、aaa 原始决定 audit 缺口及 Owner 联系/备份/专业资格材料未关闭；功能验收不等同于专业批准 |
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
| M1-03 单区 RTC、Redis、TURN、观测 | partial | 双 Server+Redis healthcheck、2026-07-17 双节点 ready 和 Node PCM 音频通过；双副本 coturn Helm/PDB/TLS/relay、KMS-backed REST 临时凭据合同、Prometheus/OTel 配置和 SLO 已实现 | TURN digest/TLS/UDP-TCP fallback、指标端点和告警的真实运行证据 |
| M1-04 JS/Flutter/iOS/Android/Node/Python 矩阵 | partial | Web/Flutter/Node A-C baseline passed；Node/Web/Flutter synthetic media/lifecycle harness、Python official Room join/leave smoke harness、iOS/Android target README、机器可读矩阵 | iOS/Android/Python 实际运行和完整 SDK Gate 证据 |
| M1-05 Token/RoomService/Webhook/Data/RPC 合同 | partial | Node/Web/Flutter baseline 的 token、RoomService、Data/RPC 通过；官方 WebhookReceiver 签名/replay adapter；新增 publisher HMAC/成功/失败/DLQ/requeue 单测 | 完整 webhook 生命周期/错误矩阵和运行证据 |
| M1-06 音频/视频/屏幕/弱网基线 | partial | Node/Web/Flutter 已加入合成 camera/screen、mute/unpublish、receiver quality sample、SDK-internal synthetic reconnect；Linux netem runner 已加入，但新增路径尚未重新运行 | 视频/屏幕运行证据、TURN/弱网注入、真实 reconnect 和服务端质量聚合 |
| M1-07 自动重放 patch queue | partial | patch queue actual-apply、metadata/digest/path 门禁、成功/冲突失败测试、CI 归档与 2026-07-18 真实 LiveKit mirror replay/clean build 均通过 | owner 审批、fork 权限和差异通知演练仍缺 |
| M1-08 周期上游同步 | partial | `.github/workflows/upstream-sync.yml` 周度任务 | owner、差异通知和升级演练缺失 |
| M1-09 许可证/SBOM/漏洞/签名流水线 | blocked | Syft/Grype/Cosign 当前、官方候选及安全重建证据均可验证；安全重建 Critical 0/High 0；335 条原始声明已形成零 `licenseConcluded=NOASSERTION` 的签名结论层和实际源码包；生产 OCI 签名、Redis 与 PostgreSQL/OpenBao 隔离生产回归、bbb Redis、aaa 安全和 ddd 中国分发批准均完成；Registry/KMS 备份恢复、轮换和 fail-closed superseding authorization 工具已开发；acceptance verifier 强制保持部署未授权 | 当前运行镜像 76 Critical；`reedsolomon v1.0.0` 法律待判；Registry/KMS 新工具未运行；bbb Registry/KMS 与 ccc 两项驳回及专业资格材料 |
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
| M2-05 Region/Quota | partial | region/residency/capacity router、token quota snapshot、可注入资源/配额 provider、字段 owner 合并校验、Redis token reservation；新增 RoomService capacity exporter、短 TTL/drain 报告和 Redis Lua 节点/租户原子 admission；Beelink production acceptance 已验证两个 Redis client 的 100 次限流竞争严格 20 次放行、30 次 token quota 仅 3 个并发、release 无泄漏和 Redis rm/up 重建 | 新增 RTC capacity 路径未运行；data/媒体完整实时 provider 和跨主机 Redis 故障域仍未完成 |
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
| M3-01 Kubernetes/数据库/Redis/TURN 生产化 | partial | Helm API/双 RTC/探针/NetworkPolicy/HPA/PDB；生产默认 external-HA PostgreSQL/Redis 且要求连接 Secret/CIDR；`embedded-single` 仅开发；双副本 digest-pinned coturn、TLS/config Secret、UDP/TCP/TLS+relay Service、PDB 和 KMS-backed REST credential issuer 已实现 | chart 尚未渲染；真实 HA 数据服务、TURN image/TLS/UDP-TCP fallback 和升级证据未执行 |
| M3-02 多可用区、容量准入、drain | partial | topology spread、90 秒 termination grace、RTC capacity exporter 通过 RoomService 保守计数、SIGTERM drain、短 TTL/单调 sequence 上报、Redis Lua 原子节点/租户 quota lease、token fallback/fail-closed 和 sidecar NetworkPolicy 已实现 | 容量竞争、报告过期、pod drain、AZ failover 和自动扩缩运行验证未执行 |
| M3-03 WAF/DDoS/限流/网络/证书 | partial | HTTP 16KiB/timeout/Bearer、Redis limiter；edge contract 与 Helm Ingress 仅公开 `/platform`/`healthz`，精确 controller selector、KMS/外部 HTTPS egress、WAF/DDoS/rollover evidence refs；X.509 verifier 检查 fingerprint/SAN/有效期/重叠且不读私钥 | provider WAF/DDoS、origin bypass、真实证书 Secret 双证书切换/回滚和外部扫描未执行 |
| M3-04 SDK telemetry/质量面板 | partial | RTC quality contract/API/PostgreSQL P50/P95/P99；新增无 scope/identity label 的 RTT/jitter/loss/bitrate histogram、recording/alert rules、Grafana provisioning、private remote-write 示例和 1–90 天分批 raw retention worker；生产缺 telemetry persistence fail-closed | 客户端全矩阵 stats、Prometheus/Grafana/remote-write、告警和 retention worker 真实运行未执行 |
| M3-05 synthetic/运营商测试 | implemented-not-run | 可配置重复样本的安全 HTTP probe、移动/联通/电信 × 华北/华东/华南九格 policy、join/分位数/RTT/丢包/UDP-TCP-TLS 不可 partial-pass verifier | 九格真实网络、SDK 媒体和 immutable artifact 均未执行 |
| M3-06 incident/backup/restore/runbook | implemented-not-run | PostgreSQL planned/running/verified/failed 状态机、HTTPS provider adapter、KMS ref/sha256、隔离恢复类型与 DB 双重禁止 production overwrite、RPO/RTO 持久化和 runbook | migration/provider/对象存储/真实隔离恢复未执行，无 RPO/RTO 运行证据 |
| M3-07 Preview 套餐/配额/用量 | implemented-not-run | `preview-v1`、环境 entitlement PostgreSQL 真值/version CAS、admin/read API、RTC token/TURN 在 quota 前按状态/有效期/feature fail-closed，控制台展示 entitlement/配额/用量 | migration/API/浏览器/竞争未执行；真实账单和限额运行证据仍缺 |
| M3-08 support 工单/脱敏 bundle | implemented-not-run | PostgreSQL 工单/idempotency fingerprint/CAS、控制台创建/列表、脱敏 no-media bundle、一次性 hash-only 单 permission ticket-bound token、消费/撤销与 audit API | migration/API/浏览器/导出/访问/审计运行未执行 |
| M3-09 设计伙伴试用 | implemented-not-run | 伪名 partner、独立 tenant/environment、version CAS 的 planned→closed 状态机；P0/P1 自动暂停、fix/regression digest、七个核心流程与清理关闭门禁 | 至少两个真实授权 trial、反馈和缺陷关闭证据未执行 |
| M3-10 性能/长稳/故障注入 | implemented-not-run | 24/72h 独立 run directory、fsync NDJSON、中断只能 aborted、coverage/availability verifier；五类 fault 要求 release-owner 维护 receipt、零账本丢失/零残留/禁生产覆盖 | 24/72h、容量、fault 和 RTC 质量运行报告未执行 |

**M3 结论：partial；Gate 3 未通过。** 已有 region router、external-HA 数据服务门禁、生产
TURN、分布式 capacity/drain、公网最小路径/证书轮换合同、RTC 质量观测/保留、备份恢复状态机、
Preview entitlement、支持闭环、运营商矩阵 policy、试用状态机和长稳/fault 证据门禁实现；
本轮按用户要求未执行 migration、API、provider、chart、云网关、证书、观测、TURN、AZ、
真实运营商/客户、24/72 小时或故障注入测试，不能把实现状态写成运行通过。

## 6. M4：Agent Platform Preview

| 任务 | 状态 | 当前证据 | 缺口/后续 |
| --- | --- | --- | --- |
| M4-01 Python/Node worker 基线 | implemented-not-run | Node/Python register/heartbeat/claim/handler/complete/fail，官方 RTC connector，heartbeat cancel 传播，Python 只取消当前 handler task | 真实 Room token/provider job 和 Beelink 5090 运行证据 |
| M4-02 artifact registry/SBOM/签名 | implemented-not-run | 异步 `HttpsAgentArtifactVerifier`、exact image/digest/signature/SBOM 回显、policy/receipt digest 固化和失败关闭 | 真实 OCI verifier、签名产物与回执 |
| M4-03 deployment controller/canary/rollback | implemented-not-run | `AgentDeploymentReconciler`、generation 观测、健康 canary 才 promote、terminal failure 持久化后 runtime rollback | 真实 rolling rollout/回滚运行证据 |
| M4-04 dispatch rule/配额 | implemented-not-run | Redis Cluster 同-slot Lua environment/deployment 原子准入、deadline lease、幂等重放、snapshot 启动重建 | Redis 多副本竞争/重启和队列运行证据 |
| M4-05 provider plugin 合同 | implemented-not-run | 严格 HTTPS JSON adapter、逐请求 credential lease、workload exchange、OpenAI-compatible chat/usage 映射、deadline/circuit/failover | 经审批的真实国内/国际 provider 配置和运行证据 |
| M4-06 secret binding/network policy | implemented-not-run | projected workload token、默认 automount 关闭、Agent Control/worker 独立 PG/Redis/KMS/RTC/provider egress allowlist | 真实 KMS binding、ServiceAccount 和网络拒绝证据 |
| M4-07 trace/成本/延迟/错误观测 | implemented-not-run | 内容无关 observation、固定价格版本 micros 归因、PostgreSQL 数值明细、低基数 metrics/alerts/Grafana | migration/metrics pipeline/dashboard 真实加载和对账 |
| M4-08 tool risk/授权/审计 | implemented-not-run | `ToolApprovalVerifier` 回执门禁、subject/tool/idempotency 哈希、KMS codec 密文 insert-once、PostgreSQL append-only audit | 真实人工审批 provider/KMS 与运行证据 |
| M4-09 取消/drain/provider 降级 | implemented-not-run | Node AbortSignal、Python handler-task cancel、heartbeat cancel IDs、Redis queue budget、deadline/circuit/failover | 分布式取消/drain/provider 故障演练 |
| M4-10 Agent quickstart/示例 | implemented-not-run | `docs/api/agent-quickstart.md` 冻结 runtime exports、workload identity、Helm 和验收边界 | end-to-end 复现报告 |

**M4 结论：development implemented-not-run；Gate 4 未通过。** 制品、发布、分布式配额、
provider、workload identity、成本观测、tool 审批/持久化与取消传播已有源码边界；
本轮未运行任何测试或服务，真实 OCI/KMS/provider、Redis 竞争、Room job、rollout、仪表盘和
Beelink RTX 5090 证据均为空。

## 7. M5：SIP、Ingress 与 Egress Preview

| 任务 | 状态 | 当前证据 | 缺口/后续 |
| --- | --- | --- | --- |
| M5-01 provider/运营商/合规 Gate | technical-gate-implemented-not-run | 独立 callback auth、签名 compliance/edge receipt verifier、生产 fail-closed feature gate | 运营商合作书面条件、适用资质和法律签字 |
| M5-02 SBC/ACL/credential/反欺诈 | implemented-not-run | safe trunk policy、KMS refs、TLS-SRTP/provider-managed profile、目的前缀/国内/国际策略、fraud provider、workload identity | 真实 SBC/ACL/TLS/SRTP、号码和反欺诈 provider |
| M5-03 inbound trunk/Room dispatch | implemented-not-run | 入呼不主动 dial、已认证/attested callback adoption、dispatch policy ref、provider sequence/乱序保护、Room participant identity | 真实 trunk/dispatch/provider webhook |
| M5-04 outbound 幂等/授权/预算/熔断 | implemented-not-run | hash-scoped idempotency、compliance/risk、Redis 原子频率/并发/daily micros lease、平台 entitlement/quota | 真实外呼、Redis 竞争和费用/异常熔断证据 |
| M5-05 DTMF/转接/挂断/对账 | implemented-not-run | DTMF hash、official transfer/hangup、operation idempotency、终态/跨副本 lease release、乱序状态对账 | 真实 DTMF/转接/挂断与 webhook 重放 |
| M5-06 Ingress 创建/状态/配额 | implemented-not-run | official adapter、HTTPS source SSRF guard、平台 entitlement/quota、Redis active capacity、CAS snapshot、verified callback | provider 运行、容量竞争和协议矩阵 |
| M5-07 Egress 录制/转推/对象存储/删除 | implemented-not-run | recording compliance receipt、official adapter、稳定 object URI、Redis capacity、retention worker/deletion evidence、CAS snapshot | 对象存储、真实播放/校验和/删除证据 |
| M5-08 SIP/media usage/provider 对账 | implemented-not-run | migration 014 immutable usage、numeric cost、deterministic reconciliation、CAS provider checkpoint、冲突检测 | provider invoice ingestion、差异阈值和真实冲正 |
| M5-09 电话质量/失败/灾备 | implemented-not-run | durable terminal summary、PDD/接通时长/DTMF attempt、provider allowlist metrics/rules/dashboard、failure reason | 真实运营商质量、无声/丢包/DTMF 成功率和灾备演练 |
| M5-10 控制台/文档/示例 | implemented-not-run | 控制台媒体/SIP 创建查询、号码/DTMF 清除、`media-quickstart.md`、Helm runtime contract | 真实 provider 示例和端到端复现报告 |

**M5 结论：development implemented-not-run；Gate 5 未通过，SIP/Egress 必须保持禁用。**
技术准入、官方 adapter、生命周期、容量、计量、质量与控制台已有源码闭环；真实运营商/SBC、
法务、对象存储、provider 账单和运行验收仍为空。

## 8. M6：私有化与国内生态

| 任务 | 状态 | 当前证据 | 缺口/后续 |
| --- | --- | --- | --- |
| M6-01 Helm/Operator/离线包/镜像仓 | implemented-not-run | CRD/RBAC/Operator、digest-verified Helm executor、atomic upgrade/approved rollback、真实文件离线 bundle builder | 未运行 Operator、registry、OCI bundle 与安装升级 |
| M6-02 最小/高可用拓扑/容量计算器 | implemented-not-run | production topology contract 强制 external-HA/TLS/3 zones/evidence ref；私有化 capacity planner 覆盖 RTC/TURN/PG/Redis | 未运行容量压测、HA 切换或 RPO/RTO 验证 |
| M6-03 国内 IaaS/KMS/对象存储/日志 adapter | implemented-not-run | HTTPS gateway adapters + OpenBao Transit derived-key KMS 实现，context/短期 token/响应校验 fail-closed | 未在客户 KMS/对象存储/日志环境运行 |
| M6-04 OIDC/SAML/审计导出 | implemented-not-run | RS256 OIDC、Ed25519-attested SAML gateway、SCIM cursor sync、对象存储 JSONL audit export | 未接真实企业 IdP/SCIM 或导出运行验收 |
| M6-05 备份/恢复/升级/回滚预检 | implemented-not-run | SQL migration 001–015、backup provider、连续迁移/schema skew/previous-image、digest chart、atomic upgrade 与 forward-only rollback | 未运行 migration 015、安装升级恢复回滚演练 |
| M6-06 License/离线策略 | implemented-not-run | canonical Ed25519 issuer/verifier、feature/node/validity/grace policy、无私钥 distribution manifest | 未做 HSM custody、客户分发和断网 grace 演练 |
| M6-07 支持包/巡检/远程协助审批 | implemented-not-run | 脱敏支持包、审批 receipt 绑定、一次性 grant/session、命令类别门禁、command digest audit 与 migration 015 | 未运行客户巡检或真实远程操作审计 |
| M6-08 国内模型 provider | implemented-not-run | 国内 `cn-*` region compatible LLM provider、短期凭据、deadline/限长/usage/熔断/telemetry | 未执行真实 provider 调用与审批验收 |
| M6-09 HarmonyOS/小程序 adapter | implemented-not-run | 受限 client adapter 请求短期 Room token、校验 WSS/expiry 并门禁原生 RTC bridge 能力 | 未执行真机权限、审核、媒体性能与 SDK parity |
| M6-10 客户环境验收工具 | implemented-not-run | 通用 report generator、digest manifest、对象存储 archive + PG scope/outcome index、offline/preflight tools | 未在客户环境执行、签署或归档真实报告 |

**M6 结论：development implemented；Gate 6/私有化 Gate 8 未通过。** 十项代码与合同已补齐，但所有 build/test、真实依赖、集群、设备、客户安装和验收均按用户要求未执行。

## 9. M7：商业与 GA 加固

| 任务 | 状态 | 当前证据 | 缺口/后续 |
| --- | --- | --- | --- |
| M7-01 价格/账单/合同/发票/对账 | implemented-not-run | PostgreSQL 事务草稿、finalized usage、CAS 签发/付款/作废、不可变 approval transition、内容寻址发票导出、statement digest 幂等对账和 finance-approved adjustment | migration/财务系统/对象存储、真实账单和签字未运行 |
| M7-02 多区域调度/区域故障 | implemented-not-run | monotonic/expiry health registry、healthy/degraded/draining/unavailable、capacity/failure-domain 路由、region/residency fail-closed | 未运行多区域节点、数据驻留和故障切换 |
| M7-03 SLO/error budget/on-call | implemented-not-run | error budget consumed ratio 与 normal/slowdown/freeze、PG window ledger、P0-P3 incident 严格状态机和不可变 transition evidence | Prometheus/OTel/Grafana、值班升级和复盘未运行 |
| M7-04 安全测试/渗透/等保/供应链审计 | implemented-not-run | 八类安全审计 manifest 生成/失败关闭、PG manifest/check archive、release forbidden states | 当前版本 secret/SAST/依赖/镜像/渗透/合规均未执行 |
| M7-05 数据权利/删除/导出/证据 | implemented-not-run | PostgreSQL 幂等 request/lease recovery、export/delete/rectify executor、保护证据和平台 API | 当前版本真实数据扫描/删除和证据归档未执行 |
| M7-06 LTS/升级窗口/支持政策 | implemented-not-run | preview/stable/lts 生命周期、升级通知/兼容/退出和 P0-P3 支持目标 | 合同审批、on-call、SLA 和实际发布未执行 |
| M7-07 文档/迁移/status page | implemented-not-run | forward-only 私有化迁移指南、公开 status 事件生成器与敏感字段拒绝、M7 evidence verifier | 生成 API、真实状态页和发布文档验收未执行 |
| M7-08 商业压测/灾备 | implemented-not-run | load/DR/fault 场景、M7 十项真实证据合同和 release freeze 条件 | 真实容量、恢复、区域故障和签字未执行 |
| M7-09 RC 冻结 | implemented-not-run | Gate 0–10 完整快照；非全 passed 只能 rejected；`wx` 不可覆盖产物与 PostgreSQL archive | 未生成/签署真实 RC，镜像未做当前版本验证 |
| M7-10 GA 评审 | implemented-not-run | approve 要求 frozen RC、11 Gate passed、八类 Owner receipt 和 gate snapshot digest；reject 至少一位 Owner receipt；PG immutable decision | 未执行 GA 评审或 Owner 签字 |

**M7 结论：development implemented；GA Gate 未通过。** 十项源码、合同和运维入口已补齐；本轮按用户要求未运行测试、migration、真实依赖、财务、安全、压测、灾备、RC 或 GA 签字。

## 10. 验收 Gate 审计摘要

| Gate | 状态 | 当前证据 | 主要缺口 |
| --- | --- | --- | --- |
| Gate 0 设计/上游 | partial（供应链 blocked） | 章程、manifest、ADR、合规、当前/候选/安全重建/生产 OCI/license-remediation 证据及 Redis/PostgreSQL/OpenBao 隔离回归；重建 Critical 0/High 0，335 条声明已分类、实际源码随包、四个签名/attestation/外部读取通过；五项原始 receipt、aaa 与 ddd sequence 1 approval、bbb Registry/KMS 与 ccc 法律 sequence 1 reject 及逐序号 audit 已归档；Registry/KMS freeze/recovery/key lifecycle 工具已开发 | 当前运行镜像 76 Critical；Registry/KMS 工具尚未运行；1 个法律待判项、bbb Registry/KMS 与 ccc 两项驳回、aaa 原始决定 audit 及专业资格材料缺失 |
| Gate 1 LiveKit 兼容 | partial（A-C baseline passed；供应链 blocked） | Beelink 双节点 Node 与本机 Web/Flutter Web 的 token、join、音频、Data/RPC、RTP bytes 证据；报告 run id `20260717T075738Z` / `20260717T080332Z`；当前固定镜像 SPDX/扫描/验签已执行 | Webhook、视频、屏幕共享、TURN/弱网、真实 reconnect、iOS/Android/Python，以及 Critical/许可证供应链阻断 |
| Gate 2 控制面 | partial（P2-01–06 技术验收通过） | scoped token、CRUD、API key/KMS、quota、持久化、Room adapter、migration/OpenAPI；Beelink/Mac 已验证事务 outbox/CAS、production API、Redis 竞争/重建、API key 传播、OpenBao HTTPS/Raft failover、OIDC/邀请/onboarding/持久 RBAC、Webhook、data-rights 与 `pg_dump` restore | Gate 0/1、两项 Owner 驳回、跨主机 HA、auto-unseal、完整企业身份/产品矩阵和生产签字 |
| Gate 3 媒体/容量 | partial | external-HA PG/Redis、双副本 TURN、capacity/drain、公网路径/证书合同、低基数质量 rules/dashboard/retention、probe/runbook | chart/provider/observability 未执行；真实 TURN/网络矩阵、证书、AZ/drain、24/72h、容量和质量指标 |
| Gate 4 Agent | partial（development implemented-not-run） | exact artifact receipt、canary/rollback boundary、Redis quota、workload credential、provider/cost/tool/cancel 实现和 quickstart | build/migration/Helm/OCI/KMS/provider/Room/rollout/metrics 未运行；无 5090 和故障证据 |
| Gate 5 SIP/Ingress/Egress | partial | official media adapters、state/idempotency、Postgres media snapshot boundary、compliance gate | provider/运营商、录制删除、电话质量和真实验收 |
| Gate 6 计量/账单 | implemented-not-run | finalized usage 事务计费、CAS 发票生命周期、不可变审批、provider statement/reconcile/adjustment 和内容寻址导出 | migration、真实用量/财务/对象存储、对账和签字未执行 |
| Gate 7 安全 | blocked | 安全基线、当前/候选/安全重建 SBOM/扫描、私有 Registry、OpenBao KMS、四个 OCI 签名/attestation、外部逐 blob 校验及 Redis/PostgreSQL/OpenBao 隔离回归；重建 Critical 0/High 0；Registry/KMS append-only freeze、备份/隔离恢复、轮换/退役门禁和 rollback 工具已开发；aaa 与 ddd sequence 1 批准、bbb Registry/KMS 与 ccc sequence 1 驳回、逐序号 audit 和 acceptance v2 已归档 | 当前运行镜像仍有 76 Critical；Registry/KMS 工具尚未运行；渗透、bbb Registry/KMS 与 ccc 驳回、aaa 原始决定 audit 缺口及专业资格材料 |
| Gate 8 私有化 | implemented-not-run | Helm、Operator、offline bundle builder、license issuer/verifier、OpenBao/SAML/SCIM/provider adapters、升级/回滚、远程审计和客户报告 | 安装/升级/恢复/轮换/卸载及真实客户验收均未执行 |
| Gate 9 可靠性/灾备 | implemented-not-run | health-aware region router、error budget/on-call ledger、fault/load/DR plan、backup/restore runbook | 节点/Redis/PG/provider/AZ 实际故障、长稳和 RPO/RTO 未执行 |
| Gate 10 合规/发布 | implemented-not-run | applicability、LTS/migration/status、security manifest、Gate 0–10 RC freeze、八 Owner GA decision | 适用结论、协议/DPA、资质、真实 Gate 证据、签字和冻结未执行 |

## 11. 当前交付判定和推荐顺序

当前仓库的 **M0-M7 计划内开发范围已实现，加上 M1 A-C 运行基线**，但尚未完成本轮
代码测试和生产验收，不能宣称 Gate 全部通过或 GA 发布。A-C 只能证明已覆盖的
Node/Web/Flutter Web 音频场景；不能替代法律签字、真实 provider、HA 运维和生产持久化证据。

下一轮执行顺序：

1. 使用受支持 Node 版本执行 build/lint/unit/contract/OpenAPI/Helm/migration 静态门禁。
2. 在 Beelink `/data` 和本机/手机客户端依次执行 M1、M3–M7 真实集成、兼容、长稳、压测和灾备。
3. 修复运行缺陷并重跑当前版本安全审计、SBOM/签名、渗透和合规检查。
4. Gate 0–10 全部通过并收齐 Owner receipt 后生成 RC freeze，再进入 GA 决策。

## 12. 本轮恢复清单

```text
1. 保留并归档 Beelink `20260717T075738Z` 服务器报告，不含 secret。
2. 以 `20260717T080332Z` 客户端报告回写 Web/Flutter baseline 证据。
3. 将 Gate 1 缺口拆成视频/屏幕、TURN/弱网/reconnect、Webhook、SDK、SBOM 五组可审查任务。
4. 以本文件为基线，将 partial/deferred 任务拆成可审查 PR，并在每个 PR 绑定 Gate 和证据路径。
```
