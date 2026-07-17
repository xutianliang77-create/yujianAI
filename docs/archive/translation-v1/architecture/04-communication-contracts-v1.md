# Communication Contracts v1（翻译方向历史归档）

> 已于 2026-07-17 被新的 RTC Platform Contracts 方向取代。

`@yujian/contracts` v1 是语见AI第一组可执行架构合同。JSON Schema 是跨语言权威
格式，TypeScript 类型用于 Node 服务编译期约束。Dart 与 Python 后续从同一组 schema
生成或实现适配器，不各自发明字段。

## 聚合根

唯一名称是 `communicationSessionId`。禁止在 API、事件、数据库映射和客户端状态中
引入 `sessionId` 别名。Control API 创建该 ID，并负责业务 session 的状态、授权、
计费和最终写入；LiveKit room name、SIP participant ID 和 worker job ID 只能作为
外部引用，不能替代它。

核心 v1 对象：

| 合同 | 作用 |
| --- | --- |
| `CommunicationSessionV1` | 业务会话投影与语言策略 |
| `SessionParticipantV1` | 人类或 Agent 的业务参与身份 |
| `MediaLegV1` | local、WebRTC 或 SIP 媒体腿 |
| `ReliableEventEnvelopeV1` | inbox/outbox 可靠业务事件 |

Worker、录音器和模型 provider 不是业务参与者。它们通过 runtime job 或
provider operation 记录关联到会话。

## Session状态

```text
created -> admitting -> active -> ending -> ended
    |          |          |          |
    +----------+----------+----------+-> failed
```

- `created`：Control API 已持久化，但未完成容量和入房准入。
- `admitting`：正在分配房间、媒体腿或 runtime。
- `active`：至少一条产品主链路可用。
- `ending`：拒绝新工作，正在取消、排空和结算。
- `ended`、`failed`：终态，必须有 `endedAt`。

状态转换由 domain 层实现并以乐观 revision 写入；schema 只验证投影形状。

## 模式与编排

| mode | runtime profile |
| --- | --- |
| `face_to_face`、`listen`、`call_link`、`pstn_translation` | Translation Runtime |
| `agent_assist` | Translation Runtime + Agent Runtime |
| `agent_call` | Agent Runtime |
| `meeting` | Speaker Runtime + Translation Runtime |

Speech Runtime 是共享基础能力，不成为统一巨型编排器。Control API 根据 mode
派发 runtime profile，客户端不能直接指定内部 worker。

## 可靠事件

可靠事件必须：

- 使用 v1 信封并包含 `communicationSessionId`。
- 具有单调 `aggregateVersion`、会话内 `sequence` 和稳定 `idempotencyKey`。
- 通过生产者 outbox 与消费者 inbox 处理。
- 只表达 final、revision、授权结果、工具结果、handoff 和账本事实。

以下是瞬时事件，不进入 outbox、历史和计费账本：

- `speech.transcript.partial`
- `speech.audio.waveform`
- `speech.vad.probability`
- `playback.progress`

瞬时事件使用媒体 data channel 或短期流分发；丢失后由下一个快照或 final 事件收敛。

## 演进规则

1. v1 JSON 对象拒绝未知字段。
2. 新增可选字段仍需合同测试和跨语言兼容性审查。
3. 改名、删除、含义变化或枚举收窄必须发布新合同版本。
4. 事件 payload 在事件进入实现前单独冻结；不得依赖无约束 payload 作为长期接口。
