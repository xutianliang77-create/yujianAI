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
  可进入隔离回归候选；两个 PostgreSQL 候选分别有 27/1 个 Critical，OpenBao 有 13 个，
  均仍阻断。候选证据见 `docs/acceptance/p1-supply-chain-candidate-evidence.json`；四类个人
  Owner 已指定为 aaa / bbb / ccc / ddd，由 eee 批准；联系、备份和本人签字待补，
  记录见 `docs/governance/P1_M0_04_OWNER_NOMINATION.md`。
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
  adapter、quota/usage/audit/outbox 和 RTC telemetry 合同；Agent、SIP/Ingress/Egress、
  私有化 Helm 与商业/SLO 合同已建立状态机和部署骨架。它们尚未在 Beelink 运行验证，也
  不等同于 PostgreSQL/KMS/Redis 生产实现。
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
- 当前新增的控制面资源查询/CAS 更新、Agent Control 生命周期 API、媒体 provider 激活、领域
  PostgreSQL migration、KMS/对象存储/身份/日志 HTTPS adapter 和私有化 preflight 均属于源码
  实现，仍需 Beelink 运行证据和生产依赖接线。
- 媒体 provider 现在通过请求级 `sipTrunkId` 或受控默认 trunk 选择 SIP 路由，并提供内部
  provider 状态回调；平台 API 支持注入 PostgreSQL persistence，将 usage 与 audit/outbox
  放入同一事务边界；`PlatformStoreSnapshot`/`PostgresPlatformStorePersistence` 恢复控制面
  资源，生产 runtime 必须同时提供 `storePersistence`，默认开发启动仍可使用内存 store。
- 数据库迁移统一通过 `npm run db:migrate` 执行，OpenAPI 合同通过 `npm run openapi:verify`
  做 operationId/$ref 门禁；生产 platform-api 缺少持久化、分布式限流、实时用量或 token quota
  runtime、`storePersistence`、durable usage/audit readers 或 outbox worker 时 fail-closed；
  media-ops 缺少持久化 runtime 时同样拒绝启动。
- 运行时骨架已补齐可停止的 `OutboxPublisherWorker`、按 capability/region/streaming 选择的
  `ProviderRegistry`、低基数 HTTP duration histogram、RTC telemetry P50/P95/P99 聚合；这些
  代码和合同仍等待 Beelink/真实 PG、Redis、KMS、provider 与观测管线验证。ProviderRegistry
  仅对可重试错误 failover，数据权利 adapter 也会拒绝同幂等键的 subject/kind 冲突。
- P2-01/02/03 已在 Beelink 以独立 `yujian-p2` Compose project 完成生产验收：PostgreSQL
  事务 outbox/CAS、production platform-api 启动/重启、Redis 双客户端限流与 token quota
  竞争/重建、API key rotate/revoke 传播，以及 OpenBao 三节点 HTTPS/Raft leader failover
  均通过。2026-07-18 已把 P2 持久化数据迁移到 Beelink 大盘
  `/data/models/yujianAI/p2`，保留原目录作为回滚副本；当前 schema 为 001–011。
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
