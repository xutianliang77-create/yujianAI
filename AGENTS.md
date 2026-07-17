# 语见AI工程规则

## 产品目标

- 语见AI建设中国本土化、LiveKit 兼容的实时音视频与 AI Agent 平台。
- 平台提供 RTC、Agent、SIP、Ingress/Egress、控制台、托管云和私有化部署。
- 当前版本不建设翻译产品；历史翻译设计和合同不得继续扩展。

## 独立性

- 本仓库是语见AI唯一代码工作区。
- 不得通过相对路径、软链接、workspace dependency 或运行时 import 引用无界AI、
  翻译软件app、ai phone 等旧项目。
- 旧项目可作为人工审阅和受控源码复制来源，但永远不得修改旧项目。迁移代码前必须
  创建明确任务，记录来源 commit/patch、文件白名单、许可证、安全审计、重写范围和
  验证证据；复制后的代码必须完全归属本仓库，不得依赖旧路径。
- 不复制旧项目的 `.env`、凭据、数据库、模型、录音、缓存和构建目录。

## 架构

- 保持 LiveKit Room、Participant、Track、Token grant、Server API 和协议兼容。
- 租户、项目、环境、API key、套餐、账单、审计和部署由语见控制面负责。
- LiveKit 负责实时媒体、房间状态、SIP participant、Ingress/Egress 和 job dispatch。
- Agent Runtime 与媒体服务分离，通过版本化 dispatch 和插件合同协作。
- 语见扩展使用 `yujian.*` API、metadata 或事件命名空间，不污染上游合同。
- 客户端不得直接访问模型服务、数据库、Redis 或 LiveKit API secret。
- 跨服务可靠事件使用版本化信封和幂等键；瞬时媒体数据不得混入账单或审计账本。

## 开发

- 先修改合同和测试，再实现跨模块行为。
- 单个 TypeScript、Dart 或 Python 文件默认不超过 350 行。
- 状态机、领域逻辑、IO adapter、路由和 UI 分文件维护。
- 禁止大爆炸式迁移；使用 adapter、shadow、canary、feature flag 和回滚。
- 上游修改必须形成最小 patch，并通过 LiveKit 兼容性测试和上游同步演练。
- 模型测试、参数调优和真机实验使用独立测试 target，不在生产 App 中试验。

## 安全

- 禁止提交 secret、真实号码、JWT、录音和用户正文。
- LiveKit token 使用最小 grant、短 TTL 和一次性入房票据。
- Agent 工具必须经过风险分级、授权、幂等和审计。
- 公网入口必须设置 payload、速率、并发、超时和队列上限。
- 中国大陆正式商用前必须完成适用的许可、备案、数据合规和法律评审；设计文档不得
  把规划中的资质写成已经取得。

## 验证

- 每次变更至少执行受影响模块的 lint、单元测试和合同测试。
- 跨服务变更必须增加集成测试。
- RTC 变更必须执行跨 SDK 兼容测试；媒体和 Agent 链路必须记录 P50/P95/P99、
  丢包、卡顿、队列等待、降级和取消。
- 工作完成后更新根目录 `PROGRESS_LOG.md`。
