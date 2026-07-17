# SDK 兼容矩阵

状态：M1 A-C baseline 已通过；完整 Gate 1 未通过；D/E 尚未执行。

机器可读矩阵：`tests/compatibility/compatibility-matrix.json`。

| 客户端 | 核心流程 | 当前 harness | 运行状态 |
| --- | --- | --- | --- |
| Web/JS | token、join、publish/subscribe audio、Data/RPC、RTP bytes | `tests/compatibility/web` | passed-baseline；本机 Chrome，run `20260717T080332Z` |
| Flutter | primary/secondary、LocalAudioTrack、TrackSubscribed、bytesReceived | `tests/compatibility/flutter` | passed-baseline；本机 Flutter Web，run `20260717T080332Z` |
| Node | token、RTC node readiness、Room/Participant、audio publish/subscribe、Data/RPC | `tests/integration/platform-rtc-smoke.test.mjs` | passed-baseline；Beelink，run `20260717T075738Z` |
| Python Agent | 官方 `livekit.rtc.Room` join/leave、dispatch handler | `tests/compatibility/python/README.md` | deferred-runtime |
| iOS/Android | 目标矩阵 | 未纳入本轮实现 | planned |

本轮通过范围只覆盖音频、Data/RPC 和双节点连接；不包含视频、屏幕共享、TURN/弱网、
reconnect、真实硬件麦克风/扬声器、原生 iOS/Android、Python Agent 或完整 Gate 1。
Mac 客户端报告不能替代 Beelink 服务器证据；服务器端报告路径见
`PROGRESS_LOG.md` 和完成审计。
