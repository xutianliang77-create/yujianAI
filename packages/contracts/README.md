# @yujian/contracts

> **历史原型：已冻结。**
>
> 本包是在语见AI转向中国实时音视频与 AI Agent 平台前建立的翻译业务合同。它不再是
> 当前架构的权威合同，不得继续扩展，也不得被新平台服务引用。新合同设计见
> [平台合同 v1](../../docs/architecture/04-platform-contracts-v1.md)。在评审批准前
> 保留本包只用于历史验证，本轮不删除或重写代码。

语见AI跨客户端、跨服务、跨语言的数据合同。`schemas/v1/` 中的 JSON Schema 是
TypeScript、Dart 和 Python 实现共同遵守的权威格式；`src/` 提供对应的 TypeScript
类型和事件分类常量。

## 历史 v1 不变量

- 所有业务对象只使用 `communicationSessionId`，禁止 `sessionId` 别名。
- `communicationSessionId` 由 Control API 创建并作为聚合根贯穿媒体、翻译、
  Agent、历史、审计和计费。
- 可靠事件必须使用 `ReliableEventEnvelopeV1`，并进入 inbox/outbox 幂等链路。
- partial 字幕、波形、VAD probability 和播放进度是瞬时事件，不得伪装成可靠事件。
- JSON 对象默认拒绝未知字段；合同演进通过新增版本完成，不静默改变 v1 语义。

## 命令

```bash
npm run lint -w @yujian/contracts
npm test -w @yujian/contracts
```
