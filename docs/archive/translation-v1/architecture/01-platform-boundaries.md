# 平台边界（翻译方向历史归档）

> 已于 2026-07-17 被“中国 LiveKit 类实时平台”目标取代。

## 分层

| 层 | 组件 | 权威职责 |
| --- | --- | --- |
| Client | Flutter、Web | 交互、采集、播放、端侧能力 |
| Edge/Media | Gateway、LiveKit、SIP、TURN | 连接、媒体、PSTN |
| Control | Control API、Policy、Dispatch | session、授权、计费、调度 |
| Runtime | Speech、Translation、Agent | turn、翻译、工具和播放 |
| Model | Model Gateway、Provider Pools | ASR、MT、TTS、VAD、LLM |
| Data | PostgreSQL、Redis、Object Storage | 真值、协调、媒体对象 |

## LiveKit采用范围

采用：

- Room、participant、track、reconnect 和 TURN。
- SIP inbound/outbound participant。
- Agent Dispatch、worker load、prewarm、drain 和 job isolation。
- 经授权的 Egress。

不交给LiveKit：

- 产品 session、账本、历史和合规状态。
- turn、字幕 revision、翻译方向和术语。
- 定向 TTS generation、抢话和业务降级。
- Agent 工具权限、授权与结果。

## 运行模式

| 模式 | 编排器 |
| --- | --- |
| 面对面同传、聆听、Call Link、翻译电话 | Translation Runtime |
| Agent Assist | Translation + Agent |
| AI 外呼、客服和预约代理 | Agent Runtime |
| 会议和多人沟通 | Translation + Speaker Runtime |
