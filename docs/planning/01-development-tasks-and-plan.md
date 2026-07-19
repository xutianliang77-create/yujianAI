# 开发任务与计划

版本：v2.0  
日期：2026-07-17  
状态：执行中（M1 A-C 运行基线通过；完整 Gate 1 未通过；D/E 尚未执行）

## 1. 计划原则

- 计划已获批准，当前按 M0/M1 Gate 开始开发。
- 每个里程碑必须通过 Gate 才进入下一阶段。
- 先建立上游兼容性和自动化同步，再建设专有能力。
- 先交付单区域可用闭环，再扩展多区域、SIP 和私有化。
- 任何时间都保留可运行的 clean upstream 基线和回滚路径。

## 2. 团队建议

最小核心团队：

| 角色 | 人数 | 主要责任 |
| --- | ---: | --- |
| 技术负责人/架构师 | 1 | 架构、上游策略、Gate |
| RTC/Go 工程师 | 2 | LiveKit server、TURN、媒体质量 |
| 平台后端工程师 | 2-3 | 控制面、IAM、quota、billing |
| Agent 工程师 | 1-2 | Agents、provider、部署和 trace |
| Web/开发者体验 | 1-2 | 控制台、文档、示例和 CLI |
| SRE/平台工程师 | 1-2 | Kubernetes、发布、可观测和私有化 |
| QA/性能工程师 | 1-2 | 兼容、媒体、负载和可靠性 |
| 产品/设计 | 1 | 开发者产品和企业交付 |
| 安全/合规 | 兼职或外部 | 许可、数据、安全和电话能力评审 |

若少于 6 名全职工程师，应砍掉首版 SIP、计费商业化或多区域中的至少两项，避免并行
摊薄。

## 3. 里程碑总览

| 里程碑 | 目标 | 建议周期 | 退出条件 |
| --- | --- | ---: | --- |
| M0 | 目标、合同、上游与合规基线 | 2-3 周 | Gate 0 |
| M1 | Clean upstream + 兼容实验室 | 4-6 周 | Gate 1 |
| M2 | 中国控制面最小闭环 | 6-8 周 | Gate 2 |
| M3 | 单区域托管 RTC Preview | 6-8 周 | Gate 3 |
| M4 | Agent Platform Preview | 6-8 周 | Gate 4 |
| M5 | SIP/Ingress/Egress Preview | 6-10 周 | Gate 5 |
| M6 | 私有化与国内生态 | 8-12 周 | Gate 6 |
| M7 | 商业与 GA 加固 | 8-12 周 | GA Gate |

周期按小型完整团队估算，不是交付承诺；可以交叠，但 Gate 依赖不能跳过。

## 4. M0：决策与治理

### 任务

- M0-01 确认品牌、开源/商业模式和产品非目标。
- M0-02 冻结 LiveKit server、protocol、SIP、Ingress、Egress、Agents 和 SDK 版本。
- M0-03 建立 upstream mirror、fork、patch queue 和同步规则。
- M0-04 完成 Apache-2.0 LICENSE/NOTICE、第三方许可证和商标使用评审。
- M0-05 冻结平台 ID、OpenAPI、事件信封和兼容矩阵格式。
- M0-06 选择控制面语言、数据库、分析仓、队列和部署方式。
- M0-07 确定首个托管区域、网络资源和私有化最小拓扑。
- M0-08 形成 ICP/增值电信/等保/PIPL/AI/SIP 适用性清单。
- M0-09 把历史翻译合同移出默认 workspace 和发布流程。
- M0-10 建立 ADR、威胁模型、数据分类和 DoD 模板。

### Gate 0

- 所有 ADR 有负责人和结论。
- 上游 manifest 可机器读取。
- 没有 secret、用户数据和旧项目路径依赖。
- 法律/合规未知项有 owner 和阻断条件。
- 团队确认首版范围及明确不做事项。

## 5. M1：上游发行版与兼容实验室

### 任务

- M1-01 镜像 LiveKit server/protocol 与所需组件。
- M1-02 构建无语见 patch 的 clean upstream 镜像。
- M1-03 部署单区 RTC、Redis、TURN 和观测。
- M1-04 建立 JS/Flutter/iOS/Android/Node/Python SDK 兼容矩阵。
- M1-05 Token、RoomService、Webhook、Data 和 RPC 合同测试。
- M1-06 音频、视频、屏幕共享和弱网基线。
- M1-07 自动重放语见 patch queue。
- M1-08 每周上游同步与冲突报告。
- M1-09 许可证、SBOM、漏洞和镜像签名流水线。
- M1-10 发布 nightly developer sandbox。

### Gate 1

- clean upstream 与语见发行版使用同一测试套件。
- 目标 SDK 的核心 Room 流程全部通过。
- 上游同步可重复，patch 冲突会失败并报警。
- 已建立媒体和 TURN 质量基线。

## 6. M2：中国控制面最小闭环

### 任务

- M2-01 Tenant/Member/RBAC。
- M2-02 Project/Environment。
- M2-03 API key/KMS/轮换。
- M2-04 Token issuer 和 endpoint discovery。
- M2-05 Region/Quota 基础服务。
- M2-06 Room/Participant 查询 adapter。
- M2-07 Audit/outbox/webhook。
- M2-08 控制台 onboarding 和 quickstart。
- M2-09 usage 原始记录，不做复杂价格。
- M2-10 OpenAPI、CLI 示例和中文文档。

### Gate 2

- 新用户可完成账号到第一条 Room。
- tenant 隔离、权限、secret 和审计测试通过。
- 控制面不可用时已运行 Room 的行为符合设计。
- API/事件合同生成物和回归测试齐全。

## 7. M3：单区域托管 RTC Preview

### 任务

- M3-01 生产化 Kubernetes、数据库、Redis 和 TURN。
- M3-02 多可用区、容量准入和 drain。
- M3-03 WAF/DDoS、限流、网络和证书。
- M3-04 SDK client telemetry 与质量面板。
- M3-05 synthetic probes 和运营商网络测试。
- M3-06 incident、backup、restore 和 region runbook。
- M3-07 Preview 套餐、配额和用量展示。
- M3-08 支持工单和脱敏 support bundle。
- M3-09 小规模设计伙伴试用。
- M3-10 性能、长稳和故障注入。

### Gate 3

- 单区域容量模型和自动扩缩可验证。
- 24/72 小时长稳达到目标。
- 关键 incident runbook 完成演练。
- 设计伙伴核心兼容流程无阻断缺陷。

## 8. M4：Agent Platform Preview

### 任务

- M4-01 Python/Node worker 基线兼容。
- M4-02 Agent artifact registry、SBOM 和签名。
- M4-03 Deployment controller、canary 和 rollback。
- M4-04 Dispatch rule 和配额。
- M4-05 国内外 provider plugin 合同。
- M4-06 Secret binding 和 network policy。
- M4-07 Trace、成本、延迟和错误可观测。
- M4-08 Tool risk policy、授权和审计。
- M4-09 取消传播、drain 和 provider 故障降级。
- M4-10 Agent quickstart 和示例。

### Gate 4

- artifact 到生产式 deployment 闭环通过。
- worker 灰度和回滚不影响普通 RTC。
- 模型/provider 故障不会无限排队或失控计费。
- 高风险工具授权和审计验收通过。

## 9. M5：SIP、Ingress 与 Egress

### 任务

- M5-01 SIP provider/运营商和合规 Gate。
- M5-02 SBC、ACL、credential 和反欺诈。
- M5-03 inbound trunk 与 Room dispatch。
- M5-04 outbound call 幂等、授权、预算和熔断。
- M5-05 DTMF、转接、挂断和状态对账。
- M5-06 Ingress 创建、状态和配额。
- M5-07 Egress 录制、转推流、对象存储和删除。
- M5-08 SIP/媒体 usage 和 provider 对账。
- M5-09 电话/媒体质量、失败和灾备演练。
- M5-10 控制台、文档和示例。

### Gate 5

- 法律、资质和运营商合作条件明确。
- 重复请求不会重复外呼或创建重复 Egress。
- 录制告知、权限、保留和删除闭环通过。
- provider 账单与语见用量差异在阈值内。

## 10. M6：私有化与国内生态

### 任务

- M6-01 Helm/Operator、离线包和镜像仓适配。
- M6-02 最小/高可用拓扑和容量计算器。
- M6-03 国内云 IaaS、KMS、对象存储和日志 adapter。
- M6-04 企业 OIDC/SAML 和审计导出。
- M6-05 备份、恢复、升级、回滚和兼容预检。
- M6-06 License 与离线运行策略。
- M6-07 支持包、巡检和远程协助审批。
- M6-08 国内模型 provider。
- M6-09 HarmonyOS/小程序可行性与最小 adapter。
- M6-10 客户环境验收工具。

### Gate 6

- 全新环境可按文档一次安装成功。
- 断网后基础 RTC 和管理能力符合合同。
- 升级、回滚、备份和恢复完成演练。
- 不依赖语见内部域名、secret 或未声明云服务。

## 11. M7：GA 加固

### 任务

- M7-01 价格、账单、合同、发票和财务对账。
- M7-02 多区域调度和区域故障策略。
- M7-03 SLO、error budget 和 on-call。
- M7-04 安全测试、渗透、等保准备和供应链审计。
- M7-05 数据权利、删除、导出和合规证据。
- M7-06 LTS、升级窗口和支持政策。
- M7-07 文档完整性、迁移指南和 status page。
- M7-08 商业客户压测和灾备演练。
- M7-09 Release candidate 和冻结。
- M7-10 GA 决策评审。

## 12. 贯穿任务

每个里程碑持续执行：

- upstream sync
- compatibility CI
- SBOM/漏洞/secret 扫描
- 媒体质量与长稳
- 成本和容量复盘
- 文档、ADR 和 runbook
- 合规清单更新
- PROGRESS_LOG 更新

## 13. DoR

任务开始前：

- 目标、非目标和 owner 明确。
- 合同/接口和测试先行。
- 上游版本与许可证清楚。
- 数据分类和安全边界完成。
- 可回滚方案存在。

## 14. DoD

任务完成：

- 代码和合同评审通过。
- lint、单元、合同、集成测试通过。
- RTC 相关变更有跨 SDK/媒体验证。
- 指标、日志、告警和 runbook 齐全。
- 无 secret/PII/用户媒体泄漏。
- 上游 patch 和许可证记录更新。
- 文档和 `PROGRESS_LOG.md` 更新。

## 15. 首个 30 天建议

仅在设计批准后执行：

1. 完成 M0 全部 ADR 与合规初筛。
2. 建立 clean upstream 镜像和版本 manifest。
3. 建立第一版 SDK 兼容实验室。
4. 跑通单区两端音视频和 server Room API。
5. 输出媒体质量、上游同步和 patch queue 的第一份报告。
