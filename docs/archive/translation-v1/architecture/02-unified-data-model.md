# 统一数据模型（翻译方向历史归档）

> 已于 2026-07-17 被“中国 LiveKit 类实时平台”目标取代。

## 聚合根

所有面对面、Call Link、PSTN 翻译和 Agent 通话都创建一个
`communication_sessions` 记录。

## ID

| ID | 含义 |
| --- | --- |
| `communicationSessionId` | 唯一业务会话；Control API 创建的聚合根 |
| `participantId` | 人或 Agent 的业务参与身份 |
| `legId` | 一条本机、WebRTC 或 SIP 媒体腿 |
| `turnId` | 一轮发言 |
| `segmentId` | 可修订字幕单位 |
| `translationId` | 指定 revision 和目标语的译文 |
| `playbackId` | 指定目标 leg 的一次播放 |
| `agentTaskId` | 用户授权的任务 |
| `agentRunId` | 一次真实 Agent 执行 |

## 主要实体

```text
communication_sessions
  |- session_participants
  |- media_legs
  |- speech_turns
  |    |- transcript_segments
  |         |- translations
  |              |- tts_playbacks
  |- agent_tasks
  |    |- agent_runs
  |         |- agent_steps
  |         |- tool_executions
  |         |- handoff_records
  |- provider_operations
  |- usage_holds
  |- billing_ledger
  |- inbox_events
  |- outbox_events
```

## 事件信封

```json
{
  "eventId": "uuid",
  "eventType": "speech.transcript.final",
  "eventVersion": 1,
  "communicationSessionId": "uuid",
  "aggregateType": "transcript_segment",
  "aggregateId": "uuid",
  "aggregateVersion": 18,
  "sequence": 42,
  "occurredAt": "ISO-8601",
  "producer": "realtime-runtime",
  "traceId": "32-char-lowercase-hex",
  "idempotencyKey": "speech:segment:revision",
  "payload": {}
}
```

final、工具结果和账本事件使用可靠 outbox；partial、波形和 VAD probability 可以
丢弃，不进入可靠业务事件表。

可执行 v1 定义见
[04-communication-contracts-v1.md](04-communication-contracts-v1.md) 和
`packages/contracts/schemas/v1/`。
