# 语见AI

> 中国本土化、LiveKit 兼容的实时音视频与 AI Agent 平台

语见AI面向中国开发者和企业，提供开放的实时音视频基础设施、AI Agent 运行平台、
SIP/电话与媒体处理能力，以及托管云和私有化部署。产品方向可以概括为“做中国的
LiveKit”，但正式品牌仍使用“语见AI”。

本版本不建设翻译产品，也不把旧翻译业务合同作为新平台基础。

## 项目标识

| 类型 | 值 |
| --- | --- |
| 中文品牌 | 语见AI |
| 英文工程名 | Yujian Realtime |
| 仓库名 | `yujianAI` |
| npm scope | `@yujian/*` |
| 服务命名空间 | `yujian.*` |
| App 标识前缀 | `ai.yujian.*` |
| 暂定定位语 | 让实时智能，连接每一次互动 |

品牌、英文名和定位语在商标与市场评审前均为工作名称。

## 产品组成

1. RTC Engine：Room、Participant、Track、Data、RPC、弱网与跨平台 SDK。
2. Realtime Cloud：中国大陆优化的托管服务、区域调度、控制台、用量和人民币结算。
3. Agent Platform：Agent dispatch、worker 生命周期、模型插件、工具调用和可观测。
4. Telephony & Media：SIP/PSTN、Ingress、Egress、录制、转推流和媒体处理。
5. Private Deployment：单租户、专有云和离线环境的可验证部署。

## 建设原则

1. 以 LiveKit 协议、Token、Room API 和主流 SDK 兼容为第一基线。
2. 中国网络、数据驻留、等保与企业交付能力作为本土化控制面建设重点。
3. 上游代码优先采用、最小修改并持续同步；语见扩展使用独立命名空间。
4. LiveKit 媒体状态不替代租户、项目、授权、套餐、账单和审计等平台业务真值。
5. 客户端不得持有 LiveKit API secret，也不得直连数据库、Redis 或模型服务。
6. 旧项目只能作为只读审阅和受控复制来源，绝不修改，也不得形成路径依赖。
7. 先冻结合同、兼容性测试和验收门，再开发服务或迁移代码。

## 工作区

使用 [语见AI.code-workspace](./语见AI.code-workspace) 单独打开本项目，不把旧项目
加入同一工作区。

## 目录

```text
apps/                  开发者控制台、示例与运维界面
services/              中国控制面、Agent 平台和平台扩展服务
packages/              协议扩展、SDK 辅助包、领域模型与可观测组件
infra/                 LiveKit 上游组件与托管云/私有部署
docs/                  产品、统一架构、技术设计、计划和验收
tests/                 兼容性、集成、媒体质量、负载和安全测试
tools/                 上游同步、许可证、构建和仓库工具
```

设计交付入口：[docs/README.md](docs/README.md)  
统一架构入口：[docs/architecture/README.md](docs/architecture/README.md)

## 当前阶段

设计基线已获批准，当前状态为 **M1 A-C 运行基线通过，完整 Gate 1 未通过，D/E 尚未执行**。
M0-M7 的合同、服务、适配器、部署和发布骨架已展开，但骨架不等于对应 Gate 已关闭：

- 已冻结 LiveKit 官方稳定版本、commit、npm 包和容器 digest。
- 2026-07-18 已在 Beelink `/data/models/yujianAI` 的隔离目录同步 10 个真实 bare
  mirror，fsck 和 11 component patch replay 通过；冻结 Server/Protocol/SIP/Ingress/
  Egress/Agents/Node/Web/Flutter 构建或静态测试已重复校验，证据索引为
  `docs/acceptance/p1-upstream-evidence.json`。该结果不替代 Gate 0/1 的 owner、合规、
  发行版对照和运行兼容验收。
- 2026-07-18 已对当前固定的 LiveKit Server、Redis、PostgreSQL、OpenBao Linux AMD64
  镜像生成 4 份 SPDX 2.3、Grype 扫描和 Cosign v3 签名/验签证据。证据本身完整，但
  发现 76 个未豁免 Critical 匹配和 465 个 license `NOASSERTION`，因此 P1-M0-04、
  Gate 0/1 和生产发布均保持阻断；索引见 `docs/acceptance/p1-supply-chain-evidence.json`。
- 同日在“仅拉取/扫描，不切换运行容器”边界内扫描 Redis 7.2.14-alpine、
  PostgreSQL 16.14-bookworm/16.14-alpine 和 OpenBao 2.5.4。Redis Critical 为 0，
  并已在独立 loopback 容器和 `/data` 独立目录通过竞争、quota、重启及删除重建回归；
  当前 P2 Redis 未切换、未重启；bbb 已签名批准 Redis 候选，但同时签名驳回生产
  Registry/KMS freeze，因此仍未获得部署授权。原始 PostgreSQL 候选
  分别有 27/1 个 Critical，OpenBao 有 13 个；随后按固定源码最小安全重建并升级
  Go/x/net，PostgreSQL 与 OpenBao 最终复扫均为 Critical 0、High 0。Beelink `/data` 已运行
  Tailscale-only TLS/认证 OCI Registry，四个候选 digest 已用不可导出的 OpenBao ECDSA
  transit key 完成 Cosign 签名、SPDX attestation 和本机逐 blob 外部读取验证。技术签名通过，
  PostgreSQL/OpenBao 又在独立 `/data` 目录通过 11 条迁移、事务 outbox/CAS、备份恢复、
  2.4→2.5 三节点滚动升级、Raft 快照恢复、TLS/HA、API key 生命周期和删除重建回归；当前
  P2 容器未切换、未重启。随后 335 条安全重建原始 `licenseDeclared=NOASSERTION` 已由
  独立签名结论层逐项分类，结论层 `licenseConcluded=NOASSERTION` 为 0，实际 OpenBao
  源码、LICENSE/NOTICE 与 source offer 已随包；`reedsolomon v1.0.0` 仍保留 1 个显式
  法律待判项。bbb Registry/KMS 与 ccc 当前 reject 未改变，未获部署授权。证据见
  `docs/acceptance/p1-supply-chain-candidate-evidence.json` 与
  `docs/acceptance/p1-remediated-candidate-evidence.json`、
  `docs/acceptance/p1-license-remediation-evidence.json`、
  `docs/acceptance/p1-production-oci-evidence.json`；四类个人
  Owner 已指定为 aaa / bbb / ccc / ddd，由 eee 批准；联系、备份和专业资格仍待补。
  四把独立 OpenBao key/最小 policy 已配置；五份冻结模板均已形成不可覆盖的本人签名
  receipt：bbb Redis 批准；aaa 安全由 sequence 0 驳回追加为 sequence 1 批准；bbb
  Registry/KMS 与 ccc 法律均已追加 sequence 1 驳回，ddd 中国分发已由 sequence 0 驳回
  追加为 sequence 1 批准。记录见
  `docs/governance/P1_M0_04_OWNER_NOMINATION.md` 与
  `docs/acceptance/p1-owner-key-registry.json`。`owner-receipt-audit/v2` acceptance adapter
  已把 Beelink 不可变 decision/signature/receipt 与 OpenBao audit 归一化到机器合同；verifier
  校验四位 Owner、五项决定、哈希链、凭据不落库和 Gate fail-closed，不复制决定理由正文。
- 语见 Owner 审批台已部署到 `https://beelink.tail1e9cec.ts.net:8093/`：页面展示五项冻结
  证据任务，后端只接受对应 Owner 的一次性 wrapped token，完成签名、验签和 revoke-self 后
  才写入 Beelink `/data`。当前五项均已记录（三项批准、两项驳回），审批台未自动修改
  Gate，`productionReleaseAuthorized=false`。aaa、bbb Registry/KMS、ccc 法律和 ddd 中国分发
  的原 reject 均保留，四份 sequence 1 审计完整；后续改变结论只能追加绑定前一份 receipt/artifact 哈希的
  superseding decision；
  原始 decision/signature/result 永不覆盖。
  2026-07-18 用户已确认审批台真实功能验收通过；两项当前 reject 是故意执行的负向路径证据。
  该功能验收不把 reject 改写为专业批准，也不关闭供应链或生产 Gate。
- 2026-07-19 已实现独立的 Registry/KMS 冻结与恢复控制：固定四个 digest、TLS/GC/保留和
  RPO/RTO 策略，使用 `/data/models/yujianAI` append-only 证据目录，提供 Registry quiesced
  backup、自举镜像归档、回环隔离 manifest/blob/Cosign 恢复校验、OpenBao 加密 Raft snapshot/
  隔离恢复、key rotation 和不可逆旧版本退役双 Owner 门禁。该实现保留 bbb sequence 1
  `reject`，未来只能追加 superseding authorization；本轮按用户要求未执行运行脚本或测试，
  不构成发布批准。入口见 `infra/registry/README.md`。
- M3-01/02 已补生产部署实现：Helm 默认只接受 external-HA PostgreSQL/Redis，显式拒绝空
  runtime URL/CIDR；RTC pod sidecar 通过官方 RoomService 上报短 TTL 容量和 drain，平台 API
  使用 Redis Lua 原子完成节点/租户双重准入；TURN 使用双副本、PDB、跨 AZ spread、TLS、
  UDP/TCP relay Service 和 KMS/OpenBao REST shared-secret 临时凭据。`embedded-single` 只保留
  开发用途。该切片尚未渲染 chart、启动集群或执行容量/TURN/AZ 测试，因此 Gate 3 仍未通过。
  入口见 `infra/helm/yujian-platform/README.md` 和
  `services/rtc-capacity-exporter/README.md`。
- M3-03/04 已补公网路径最小暴露、精确 ingress controller NetworkPolicy、WAF/DDoS/证书证据
  引用合同、只读 X.509 双证书轮换校验，以及无租户/Room/participant 标签的 RTC 质量
  histogram、P50/P95/P99 rules、Grafana dashboard、私有 remote-write 和 1–90 天原始样本保留
  worker。实际云防护、证书切换、Prometheus/Grafana 和客户端全矩阵尚未运行，Gate 3 不变。
- M3-05–10 的开发合同已进一步收口：控制面备份/隔离恢复状态机、Preview
  entitlement 与 RTC/TURN fail-closed、持久支持工单/脱敏 bundle/一次性访问、
  九格运营商 policy、设计伙伴 P0/P1 状态机，以及 24/72 小时和 fault
  失败关闭 verifier。当前源码 schema 为 001–016；本轮按用户要求未运行测试、
  migration、运营商、设计伙伴、长稳或故障注入，不构成 Gate 3 通过。
- M4-01–10 的生产式开发边界已收口：制品异步签名/SBOM 回执、canary/回滚
  reconciler、Redis 跨副本队列准入和重建、workload identity 短期 provider 凭据、
  OpenAI-compatible chat/usage 映射、数值成本账目和面板、高风险工具审批回执/加密结果、
  Node/Python 取消传播，以及 Helm 投影 token 和 egress allowlist。当前仅为
  `implemented-not-run`；未执行 build/test、migrations 013–014、OCI/KMS/provider、Helm、Room job、
  canary 或 Beelink RTX 5090，Gate 4 仍未通过。
- M5-01–10 的生产式开发边界已收口：独立 provider callback/edge attestation、safe trunk
  policy、Redis SIP 频率/并发/费用与媒体容量、入呼采用/外呼/DTMF/转接/挂断、Ingress/Egress
  合规/留存删除、migration 014 不可变 usage/对账、SIP 质量和控制台。当前仅为
  `implemented-not-run`；真实运营商/SBC/法务、对象存储、provider 账单和运行证据为空，
  Gate 5 未通过，SIP/Egress 继续默认关闭。
- M6-01–10 的私有化开发边界已收口：CRD/Operator、digest Helm executor、离线包、
  external-HA、OpenBao Transit、OIDC/SAML/SCIM、License、远程协助审计、国内模型 provider、
  HarmonyOS/小程序受限 bridge 与客户验收归档均已实现。状态统一为
  `implemented-not-run`；migration 015 和所有集群、企业依赖、设备、客户演练未执行，私有化
  Gate 仍未通过。入口见 `docs/acceptance/M6_PRIVATE_DEPLOYMENT_IMPLEMENTATION.md`。
- M7-01–10 的 GA 加固开发边界已收口：事务计费/不可变审批与 provider 对账、健康感知
  多区域路由、error budget/on-call 账本、安全审计 manifest、LTS/迁移/status、Gate 0–10
  RC 冻结及八类 Owner GA 决策均已实现。当前仅为 `implemented-not-run`；migration 016、
  财务/区域/渗透/压测/灾备/RC/GA 均未运行，Gate 6/7/9/10 和 GA 继续未通过。入口见
  `docs/acceptance/M7_GA_IMPLEMENTATION_AND_EVIDENCE.md`。
- 已建立新平台合同、官方 Server SDK 兼容层和最小 Token/Endpoint API。
- 已按官方 Server/Node/Web/Flutter SDK 编写双节点 Room、Participant、Data、RPC 和音频
  Track 兼容测试场景。2026-07-17 已完成 Beelink 服务器端 A/B 与本机 Web/Flutter Web
  客户端 C 验收；报告分别记录于 `outputs/beelink/20260717T075738Z`（Beelink）和
  `outputs/client/20260717T080332Z`（本机）。
- 自有服务、命令和场景采用 `yujian` / `rtc` 命名；`LiveKit` 仅保留在官方依赖、
  协议兼容和上游归属边界。
- 尚未 fork 或修改 LiveKit 媒体核心，也未复制任何旧项目源码。
- 已将 Beelink 定为唯一服务器端和验收环境：Linux AMD64、双 RTC 节点、一块 RTX
  5090；RTX 5090 留给 Agent/模型 runtime，RTC SFU 不占用 GPU。
- 已把单一内部 key 升级为绑定 `tenantId / projectId / environmentId` 的环境级
  credential，并建立工作区外 clean mirror、空 patch queue 和 Beelink 手动验收 CI；
  P1-M0-03 运行证据已补，但 fork/通知权限和 owner 审批仍待补。
- 本轮已实现 `YujianRtcNodePool`：控制面可管理 primary/secondary RTC 入口，`/readyz`
  并行检查全部节点，token 响应返回选中的 `nodeId`；Flutter Web 已完成双节点音频
  Track 发布/订阅验证。Web/Flutter/Node 的视频、屏幕、mute/unpublish、合成 reconnect、
  Python Room smoke、netem 和 sandbox 入口已补齐但仍为 implementation-deferred；SBOM/
  漏洞/签名已真实执行并因 Critical/许可证问题阻断。真实 TURN/弱网、原生 iOS/Android
  和 Python Agent 运行仍待验收。
- 控制面已加入 Tenant/Project/Environment、API key 生命周期、成员/RBAC、Room/Participant
  adapter、quota/usage/audit/outbox 和 RTC telemetry 合同；其中 P2-01–06 已在 Beelink
  服务端与本机 Mac 客户端完成 PostgreSQL/Redis/OpenBao、OIDC/onboarding、Webhook、
  data-rights 和恢复技术验收。Agent、SIP/Ingress/Egress、私有化与商业/SLO 已完成计划内
  开发，但当前版本仍缺真实验收，不能外推为对应 Gate 通过。
- 当前源码还包含官方 LiveKit Ingress/Egress/SIP/Webhook adapter、Node/Python Agent worker、
  provider deadline/circuit、billing/data-rights、license/offline、SBOM/release 和故障注入
  边界；高风险能力默认关闭，生产 Gate 与法务/合规签字仍是发布前置条件。
- Node Agent worker 已提供官方 `@livekit/rtc-node` 的 `LiveKitAgentRoomConnector`；Python
  worker 已提供基于官方 `livekit.rtc.Room` 的可选 `LiveKitAgentRoomConnector`，两者只负责按
  dispatch 建立/关闭 Room 会话，token 签发和业务授权仍由控制面完成。D（RTX 5090 Agent）
  和 Python Agent 运行验证尚未执行。
- 平台 runtime 现在支持注入部署侧 `PlatformIdentityProvider`；OIDC/SAML 适配器负责验证
  token，部署侧映射最小 tenant/project/environment scope 后再进入统一 RBAC，静态 credential
  和 API key 仍走原有路径。
- 当前新增的 Agent Control 生命周期 API、媒体 provider 激活、对象存储/日志 HTTPS adapter
  和私有化 preflight 仍主要属于源码实现，需后续 Beelink/真实 provider 运行证据；控制面
  CAS、001–011 migrations、KMS/身份接线的 P2-01–06 指定技术范围已完成真实验收。
- 媒体 provider 现在通过请求级 `sipTrunkId` 或受控默认 trunk 选择 SIP 路由，并提供内部
  provider 状态回调；平台 API 支持注入 PostgreSQL persistence，将 usage 与 audit/outbox
  放入同一事务边界；`PlatformStoreSnapshot`/`PostgresPlatformStorePersistence` 恢复控制面
  资源，生产 runtime 必须同时提供 `storePersistence`，默认开发启动仍可使用内存 store。
- 数据库迁移统一通过 `npm run db:migrate` 执行，OpenAPI 合同通过 `npm run openapi:verify`
  做 operationId/$ref 门禁；生产 platform-api 缺少持久化、分布式限流、实时用量或 token quota
  runtime、`storePersistence`、durable usage/audit readers 或 outbox worker 时 fail-closed；
  media-ops 缺少持久化 runtime 时同样拒绝启动。
- 运行时骨架已补齐可停止的 `OutboxPublisherWorker`、按 capability/region/streaming 选择的
  `ProviderRegistry`、低基数 HTTP duration histogram、RTC telemetry P50/P95/P99 聚合；
  P2 指定的 PG/Redis/KMS、Webhook 和 data-rights 范围已验证，真实 provider 与统一观测管线
  仍待验证。ProviderRegistry 仅对可重试错误 failover，数据权利 adapter 也会拒绝同幂等键的
  subject/kind 冲突。
- P2-01/02/03 已在 Beelink 以独立 `yujian-p2` Compose project 完成生产验收：PostgreSQL
  事务 outbox/CAS、production platform-api 启动/重启、Redis 双客户端限流与 token quota
  竞争/重建、API key rotate/revoke 传播，以及 OpenBao 三节点 HTTPS/Raft leader failover
  均通过。2026-07-18 已把 P2 持久化数据迁移到 Beelink 大盘
  `/data/models/yujianAI/p2`，保留原目录作为回滚副本；该次验收 schema 为 001–011；当前源码
  schema 已推进到 001–016，新增 migrations 尚未执行。
- P2-04/05/06 已由 Beelink 服务端和本机 Mac RTC 客户端完成双机验收，run id
  `p2-closure-20260718051008-653ebfee`：OIDC onboarding/邀请/持久 RBAC/跨 tenant IDOR、
  Webhook HMAC/重试/DLQ/requeue/claim heartbeat、data-rights crash recovery、隔离
  `pg_dump` restore、Redis 从 PostgreSQL 重建和 protected restart count 不变全部通过。
  脱敏报告位于 `/data/models/yujianAI/p2/reports/p2-closure-acceptance.json`。
  M2/P2-01–06 技术验收已闭环；正式 Gate 2 仍受 Gate 0/1、owner 签字、跨主机 HA 和
  auto-unseal 等发布前置条件约束，不能写成正式发布批准。
- 发布证据通过 `npm run release:preflight` 检查 manifest schema、重复/未知 evidence 和禁止
  发布状态；它只做门禁，不伪造 Beelink、备份恢复或安全审计证据。
- 私有化预检会调用 `tools/private-deployment/verify-offline-manifest.mjs` 校验离线包结构；
  提供 `YUJIAN_OFFLINE_ARTIFACT_ROOT` 时还会拒绝未解析的 digest 占位符并检查 artifact 文件。

历史暂停记录仍保留在 `PROGRESS_LOG.md`，但不覆盖本轮通过证据。当前新增变更必须重新
执行受影响的 Gate；本次 A-C 通过不自动关闭完整 Gate 1，也不替代 D/E 的运行证据。
