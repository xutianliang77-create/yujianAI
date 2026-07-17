# 语见AI设计文档索引

版本：v2.0  
日期：2026-07-17  
状态：M1 A-C 运行基线通过；完整 Gate 1 未通过；D/E 尚未执行

## 目标

语见AI已重置为中国本土化、LiveKit 兼容的实时音视频与 AI Agent 平台。设计基线
已获批准，M0-M7 的合同、服务骨架、适配器边界和部署/发布骨架已展开。2026-07-17
已完成 Beelink A/B 服务器端和本机 C 客户端基线；完整 Gate 1 仍因视频、屏幕共享、
TURN/弱网、reconnect、Webhook、iOS/Android/Python、SBOM/签名等缺口未通过，D/E
尚未执行。运行证据见 [PROGRESS_LOG.md](../PROGRESS_LOG.md) 和
[真实运行测试方案](acceptance/REAL_RUNTIME_TEST_PLAN.md)。

P1 implementation slice 已补入 Web/Flutter/Node 媒体生命周期、Python Room smoke、Linux
netem、SBOM/签名校验、上游 patch replay、nightly sandbox 和 P1 evidence schema；这些入口
仍必须在 Beelink/声明设备/CI 生成脱敏报告，不能直接升级 Gate 状态。

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
| [P2/P3 运行时与发布门禁](planning/P2_P3_RUNTIME_CLOSURE_PLAN.md) | M2 真实依赖、M3-M7 顺序门禁和阻断条件 |
| [P2 Beelink runtime](../infra/p2/README.md) | PostgreSQL、Redis、OpenBao 数据目录部署与恢复烟测 |
| [验收任务与计划](acceptance/01-acceptance-tasks-and-plan.md) | 兼容、功能、媒体质量、负载、安全和交付验收 |
| [真实运行测试方案](acceptance/REAL_RUNTIME_TEST_PLAN.md) | Beelink 双节点、Web/Flutter、RTX 5090 Agent 和生产留存分层执行命令 |
| [上游与源码复用策略](migration/SOURCE_REUSE_AND_UPSTREAM_STRATEGY.md) | LiveKit fork、同步、许可证和旧项目白名单门禁 |
| [开发完成审计](planning/DEVELOPMENT_COMPLETION_AUDIT.md) | 任务逐项实现证据、缺口和 Gate 判定 |
| [OpenAPI v1](api/openapi.yaml) | 控制面与媒体入口合同最小描述 |
| [兼容矩阵](compatibility/MATRIX.md) | Web/Flutter/Node 及后续 SDK 运行证据边界 |
| [合规适用性](compliance/APPLICABILITY.md) | PIPL/等保/ICP/AI/SIP owner 与 blocker |
| [Owner 责任矩阵](governance/OWNERS.md) | 角色责任、签字 Gate 和个人 owner 状态 |
| [媒体 quickstart](api/media-quickstart.md) | Ingress/Egress/SIP 幂等、保留和合规约束 |
| [LTS 与支持](operations/LTS_AND_SUPPORT.md) | 版本支持、升级窗口和发布边界 |

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
