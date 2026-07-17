# 交付基线（翻译方向历史归档）

> 已于 2026-07-17 被“中国 LiveKit 类实时平台”目标取代。

## Phase 0

- 独立仓库、品牌、目录和防污染规则。
- 冻结平台边界、数据模型和安全基线。
- 所有旧项目能力先进入迁移清单；Phase 0 不复制源码。

## Phase 1

- `@yujian/contracts` v1。
- 通过来源、许可证和敏感信息门禁后，按模块复制/重写旧源码。
- Control API、PostgreSQL migration 和 outbox。
- Flutter iOS/Android 空壳、中文本地化和设计 token。
- LiveKit 最小权限 token 与 Call Link mock。

## Phase 2

- Speech Runtime 与 Translation Runtime。
- 流式 ASR、VAD、MT、TTS Provider Contract。
- 面对面同传和聆听模式产品闭环。

## Phase 3

- LiveKit Call Link 与 PSTN 翻译。
- Worker prewarm、容量准入、drain 和崩溃恢复。
- 50 并发、长稳和真机门禁。

## Phase 4

- Agent Assist、AI 外呼、DTMF、工具、接管和 warm transfer。
- 安全策略、Agent 质量评估和结构化结果。

## 发布门槛

- P0 安全问题为零。
- 重复 End、webhook、断线恢复不造成重复扣费。
- 翻译链路与 Agent 资源隔离。
- iPhone、Android、Web Guest 和 SIP 分别验收。
- 所有镜像固定版本或 digest。
