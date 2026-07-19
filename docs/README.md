# 语见AI设计文档索引

版本：v2.2
日期：2026-07-19
状态：M1 A-C 运行基线通过；完整 Gate 1 未通过；D/E 尚未执行

## 目标

语见AI已重置为中国本土化、LiveKit 兼容的实时音视频与 AI Agent 平台。设计基线
已获批准，M0-M7 的合同、服务骨架、适配器边界和部署/发布骨架已展开。2026-07-17
已完成 Beelink A/B 服务器端和本机 C 客户端基线；完整 Gate 1 仍因视频、屏幕共享、
TURN/弱网、reconnect、Webhook、iOS/Android/Python、SBOM/签名等缺口未通过，D/E
尚未执行。运行证据见 [PROGRESS_LOG.md](../PROGRESS_LOG.md) 和
[真实运行测试方案](acceptance/REAL_RUNTIME_TEST_PLAN.md)。

P1 implementation slice 已补入 Web/Flutter/Node 媒体生命周期、Python Room smoke、Linux
netem、SBOM/签名校验、上游 patch replay、nightly sandbox 和 P1 evidence schema；其中
clean upstream 与供应链已形成下述真实报告，其余入口仍必须在 Beelink/声明设备/CI 生成
脱敏报告，不能直接升级 Gate 状态。

2026-07-18 已在 Beelink `/data` 完成真实 clean upstream mirror/fsck/replay 和 11
component 冻结构建或静态测试证据；同日完成 4 个当前固定镜像的 SPDX、漏洞扫描和
Cosign bundle 验签。供应链证据仍因当前运行镜像 76 个未豁免 Critical、许可证和两项当前
有效签名驳回而阻断；aaa 已通过 supersession 批准安全证据，角色代号已指定，
但联系、备份与专业资格材料待补。
这些结果均不关闭完整 Gate 0/1。
同日只拉取并扫描了 Redis/PostgreSQL/OpenBao 补丁候选，未切换任何运行容器；Redis
7.2.14-alpine 达到零 Critical，并已在独立容器通过竞争、quota、重启和删除重建回归，
bbb 已签名批准 Redis 候选，但未部署；随后 PostgreSQL/OpenBao 最小安全重建达到 Critical
0、High 0；
Beelink 私有 Registry、OpenBao transit key、四个 OCI 签名/SPDX attestation 和本机外部
逐 blob 校验均通过。bbb Redis、aaa 安全与 ddd 中国分发当前为 approve；bbb Registry/KMS
与 ccc 法律均为 sequence 1 reject。PostgreSQL/OpenBao 隔离生产回归也已通过，且当前 P2
未切换；335 条原始许可证声明已由独立签名结论层全部分类，实际 OpenBao 源码随包，
`reedsolomon v1.0.0` 保留 1 个法律待判项。两项驳回和专业资格材料仍是阻断项。
Registry/KMS freeze 的技术整改代码已补齐冻结 policy、`/data` append-only plan、Registry
备份/回环隔离恢复、OpenBao Raft snapshot/隔离恢复、key rotation、旧版本不可逆退役双 Owner
门禁和 rollback digest verification；本轮未运行这些工具。bbb sequence 1 reject 保持有效，
只能在新证据审阅后追加 superseding authorization。

2026-07-19 的 M3-01/02 开发切片新增 external-HA PostgreSQL/Redis chart 门禁、digest-pinned
双副本 TURN/TLS/relay 拓扑、RTC capacity exporter、短 TTL/drain 报告、Redis 原子 capacity
lease 和 KMS-backed TURN REST 临时凭据。当前仅为实现状态：未执行 Helm 渲染、真实 TURN、
容量竞争、AZ failover 或 drain 验收，不能升级 Gate 3。

同日 M3-03/04 开发切片增加只公开 `/platform/*`/`healthz` 的生产 Ingress、精确 controller
NetworkPolicy、WAF/DDoS/证书 rollover 证据引用、只读双证书 overlap/SAN/fingerprint 校验、
低基数 RTC 质量 Prometheus rules/Grafana dashboard/private remote-write 和 PostgreSQL 原始样本
保留 worker。所有云网关、证书切换和观测运行状态仍为未执行。

同日 M3-06/07/08 开发切片新增 PostgreSQL 备份/隔离恢复状态机、无凭据 HTTPS provider
adapter、RPO/RTO 记录、Preview entitlement CAS/API 与 RTC/TURN fail-closed、持久 support
ticket、脱敏 bundle 登记，以及哈希存储、单 permission、ticket-bound 的一次性临时访问和撤销。
当前源码 migration 为 001–016；本轮未执行 migration、provider、对象存储、恢复、API 或测试，
因此只是实现完成，Gate 3 未通过。

M3-05/09/10 开发切片进一步增加移动/联通/电信 × 华北/华东/华南的九格
policy、可重复 HTTP sampler、24/72 小时 append-only/fsync runner、不可伪造 partial
pass 的综合 verifier，以及设计伙伴 version CAS、P0/P1 自动暂停和关闭门禁状态机。
仓库不提供一键破坏生产的 fault runner；真实运营商、客户、长稳和故障注入均未执行。

M4-01–10 开发切片已补全异步制品验证回执、canary/回滚 runtime 边界、Redis
分布式 dispatch 配额、workload identity 凭据换取、provider 协议/usage/成本、高风险工具
审批和加密持久化、Node/Python 取消传播、Agent 专用网络策略和 quickstart。
全部状态为 `implemented-not-run`；本轮按用户要求没有运行任何测试或服务。

M5-01–10 开发切片已补全 provider edge attestation/sequence、safe trunk/fraud policy、Redis
SIP 频率/并发/费用与 Ingress/Egress capacity、录制合规/留存删除、不可变 usage/对账、SIP
质量 lifecycle、平台 entitlement/quota/audit 和控制台。状态仍为 `implemented-not-run`；
真实运营商/SBC、法务、对象存储、账单和电话质量尚未执行，Gate 5 未通过。

M6-01–10 与 M7-01–10 开发切片已收口。M6 提供 Operator、离线包、License、企业 adapter、
远程协助和客户验收；M7 提供生产计费/对账、健康感知区域路由、error budget/on-call、
安全审计、LTS/迁移/status、RC 冻结和 GA 决策账本。当前均为 `implemented-not-run`；
migration 015–016、真实依赖、客户环境、财务、安全、压测、灾备和 Owner 发布决定未执行。

## 核心交付

| 文档 | 内容 |
| --- | --- |
| [品牌与产品章程](product/BRAND_AND_PRODUCT_CHARTER.md) | 定位、用户、产品线、差异化和非目标 |
| [平台边界](architecture/01-platform-boundaries.md) | 上游、语见控制面、数据面和外部系统职责 |
| [统一数据模型](architecture/02-unified-data-model.md) | 租户、项目、Room、Agent、SIP、媒体和账单对象 |
| [交付基线](architecture/03-delivery-baseline.md) | 托管云、私有部署、区域、安全和 SLO 基线 |
| [平台合同 v1](architecture/04-platform-contracts-v1.md) | 标识、API、事件、幂等、兼容和演进规则 |
| [技术架构](architecture/05-technical-architecture.md) | 六个平面、组件、数据流、部署和容灾 |
| [功能详细设计](design/01-functional-detailed-design.md) | 控制台、RTC、Agent、SIP、媒体、计费和运维流程 |
| [技术设计](design/02-technical-design.md) | API、表、Token、dispatch、计量、状态机和可观测 |
| [开发任务与计划](planning/01-development-tasks-and-plan.md) | 里程碑、WBS、Gate、依赖和人员建议 |
| [P1 M0/M1 关闭计划](planning/P1_M0_M1_CLOSURE_PLAN.md) | owner、Gate 退出条件和当前缺口 |
| [P2/P3 运行时与发布门禁](planning/P2_P3_RUNTIME_CLOSURE_PLAN.md) | M2/P2-01–06 技术验收已通过；正式 Gate 2 前置条件与 M3-M7 顺序门禁 |
| [P2 Beelink runtime](../infra/p2/README.md) | PostgreSQL、Redis、OpenBao 数据目录部署与恢复烟测 |
| [验收任务与计划](acceptance/01-acceptance-tasks-and-plan.md) | 兼容、功能、媒体质量、负载、安全和交付验收 |
| [真实运行测试方案](acceptance/REAL_RUNTIME_TEST_PLAN.md) | Beelink 双节点、Web/Flutter、RTX 5090 Agent 和生产留存分层执行命令 |
| [P1 clean upstream 证据](acceptance/p1-upstream-evidence.json) | 真实 mirror/replay、工具链、重复构建和 artifact digest 索引 |
| [P1 供应链证据](acceptance/p1-supply-chain-evidence.json) | 当前固定镜像 SPDX、漏洞计数、签名和 Gate 判定索引 |
| [P1 候选镜像证据](acceptance/p1-supply-chain-candidate-evidence.json) | Redis 隔离回归、补丁候选对比与未获部署授权边界 |
| [P1 安全重建证据](acceptance/p1-remediated-candidate-evidence.json) | PostgreSQL/OpenBao 零 Critical 复扫、High/许可证与 pre-registry 边界 |
| [P1 LICENSE/NOTICE 整改证据](acceptance/p1-license-remediation-evidence.json) | 335 条逐项结论、实际 OpenBao 源码、NOTICE、签名 manifest 与唯一法律待判项 |
| [P1 生产 OCI 证据](acceptance/p1-production-oci-evidence.json) | Beelink Registry、OpenBao KMS、四个签名/attestation 与外部逐 blob 校验 |
| [Registry/KMS 冻结与恢复](../infra/registry/README.md) | 四个 digest、备份/隔离恢复、RPO/RTO、KMS 轮换/退役和 superseding Owner 门禁 |
| [Registry/KMS 实现状态](acceptance/p1-registry-kms-freeze-implementation.json) | 开发完成、运行与测试未执行、发布未授权的机器边界 |
| [生产 Helm 拓扑](../infra/helm/yujian-platform/README.md) | external-HA 数据服务、双 RTC/TURN、capacity sidecar、PDB/NetworkPolicy 和生产门禁 |
| [RTC capacity exporter](../services/rtc-capacity-exporter/README.md) | RoomService 保守容量计数、短 TTL、drain 和内部上报边界 |
| [M3-01/02 实现状态](acceptance/m3-01-02-implementation.json) | HA/TURN/capacity/drain 已开发、全部运行验证未执行的机器边界 |
| [M6 私有化实现状态](acceptance/M6_PRIVATE_DEPLOYMENT_IMPLEMENTATION.md) | Operator、离线包、OpenBao、企业身份、License、远程协助、国内 provider、受限客户端和客户报告的 implemented-not-run 边界 |
| [M7 GA 实现与证据](acceptance/M7_GA_IMPLEMENTATION_AND_EVIDENCE.md) | 计费、区域健康、SLO/值班、安全、LTS、status、RC/GA 的 implemented-not-run 与真实证据合同 |
| [私有化升级迁移](migration/PRIVATE_DEPLOYMENT_UPGRADE.md) | digest、migration、备份、atomic upgrade 与 forward-only rollback 边界 |
| [公网入口安全合同](../infra/gateway/README.md) | 公共/内部路径隔离、WAF/DDoS 证据、证书轮换和 origin 防绕过边界 |
| [RTC 质量观测](../infra/observability/README.md) | 低基数指标、P50/P95/P99 rules、Grafana、remote-write 和原始样本保留 |
| [M3-03/04 实现状态](acceptance/m3-03-04-implementation.json) | 入口安全与质量观测已开发、provider/runtime 验收未执行的机器边界 |
| [M3-06/07/08 实现状态](acceptance/m3-06-08-implementation.json) | 备份恢复、Preview entitlement 与支持闭环已开发、运行与测试未执行的机器边界 |
| [M3-05/09/10 实现状态](acceptance/m3-05-09-10-implementation.json) | 运营商矩阵、试用状态机、长稳与 fault 证据门禁已开发，外部执行未开始 |
| [M3 Preview 执行与证据](acceptance/M3_PREVIEW_EXECUTION_AND_EVIDENCE.md) | 九格运营商、设计伙伴、24/72 小时和五类故障证据合同 |
| [M4 Agent Runtime 实现](acceptance/M4_AGENT_RUNTIME_IMPLEMENTATION.md) | 制品、发布、配额、Provider、Tool、取消和观测的实现/运行边界 |
| [M4 实现状态](acceptance/m4-agent-runtime-implementation.json) | `implemented-not-run`、Gate 4 未通过的机器可读边界 |
| [M5 媒体 Runtime 实现](acceptance/M5_MEDIA_RUNTIME_IMPLEMENTATION.md) | SIP/Ingress/Egress 准入、生命周期、计量、质量和控制台的实现/运行边界 |
| [M5 实现状态](acceptance/m5-media-runtime-implementation.json) | `implemented-not-run`、Gate 5 未通过的机器可读边界 |
| [Agent quickstart](api/agent-quickstart.md) | workload identity、制品验证、Node/Python handler 和 Helm 接线顺序 |
| [P1 Owner key registry](acceptance/p1-owner-key-registry.json) | 四把独立不可导出 key、最小 policy、ACL 负向测试和未签发个人凭据边界 |
| [P1 Owner acceptance v2](acceptance/p1-m0-04-owner-signoffs.json) | 四位 Owner、五项不可变 receipt/history、OpenBao audit 与 fail-closed Gate 归一化合同 |
| [Owner 本人决定与模板](governance/owner-decisions/README.md) | 五项已签 receipt、审计覆盖边界及 5 分钟 wrapped token 操作流程 |
| [Redis 发布决定](acceptance/p1-redis-release-decision.json) | bbb 已签批准但因 freeze/回滚前置条件不足仍 fail-closed 的 v2 决定合同 |
| [Owner 专业签字包](governance/P1_M0_04_OWNER_SIGNOFF_PACKET.md) | aaa/bbb/ccc/ddd 各自的证据、决定和密码学签字要求 |
| [生产 OCI 签名合同](governance/P1_M0_04_PRODUCTION_OCI_SIGNING.md) | registry digest、KMS/OpenBao identity、SBOM attestation 与验签流程 |
| [P1 供应链 Owner 评审](compliance/P1_M0_04_SUPPLY_CHAIN_REVIEW.md) | LICENSE/NOTICE、漏洞修复、签名边界、五项决定及 supersede 前置条件 |
| [P1-M0-04 个人 Owner 任命表](governance/P1_M0_04_OWNER_NOMINATION.md) | security/release/legal/compliance 的实名指定、职责分离和待补联系/签字字段 |
| [上游与源码复用策略](migration/SOURCE_REUSE_AND_UPSTREAM_STRATEGY.md) | LiveKit fork、同步、许可证和旧项目白名单门禁 |
| [开发完成审计](planning/DEVELOPMENT_COMPLETION_AUDIT.md) | 任务逐项实现证据、缺口和 Gate 判定 |
| [OpenAPI v1](api/openapi.yaml) | 控制面与媒体入口合同最小描述 |
| [Owner Approval OpenAPI](api/owner-approval.openapi.yaml) | Owner 审批台查询、原始决定、哈希链接的 supersession、一次性凭据和失败关闭合同 |
| [兼容矩阵](compatibility/MATRIX.md) | Web/Flutter/Node 及后续 SDK 运行证据边界 |
| [合规适用性](compliance/APPLICABILITY.md) | PIPL/等保/ICP/AI/SIP owner 与 blocker |
| [Owner 责任矩阵](governance/OWNERS.md) | 角色责任、签字 Gate 和个人 owner 状态 |
| [媒体 quickstart](api/media-quickstart.md) | Ingress/Egress/SIP 幂等、保留和合规约束 |
| [LTS 与支持](operations/LTS_AND_SUPPORT.md) | 版本支持、升级窗口和发布边界 |
| [On-call 与 Error Budget](operations/ONCALL_AND_ERROR_BUDGET.md) | release policy、事故状态机、状态页和 RC 阻断条件 |
| [GA 安全审计](security/GA_SECURITY_AUDIT.md) | 当前 RC 八类安全证据、零 High/Critical 和不可覆盖归档合同 |

## 已冻结基线

- 正式品牌为语见AI；“中国的 LiveKit”只描述产品方向。
- LiveKit 协议、Room API、Token grant 和主流 SDK 兼容优先。
- 语见控制面拥有租户、项目、API key、套餐、计费、审计和部署业务真值。
- LiveKit 承担媒体、Room、SIP、Ingress/Egress 和 Agent dispatch。
- 语见专有扩展必须使用 `yujian.*` 命名空间，并可与上游能力解耦。
- 托管云和私有部署使用同一平台合同和兼容性测试。
- 当前翻译合同只作为历史原型保存，不得继续扩展。
- 新平台代码只依赖 `@yujian/platform-contracts` 和固定版本 LiveKit 官方 SDK。

## 评审顺序

1. 品牌与产品章程。
2. 平台边界、统一数据模型和平台合同。
3. 技术架构与技术设计。
4. 上游与源码复用策略。
5. 开发任务与计划。
6. 验收任务与计划。

旧翻译版设计已归档到 [archive/translation-v1/](archive/translation-v1/)，不再是规范。
