# SDK 兼容矩阵

状态：实现目标，运行证据必须在 Beelink 开机后补录。

机器可读矩阵：`tests/compatibility/compatibility-matrix.json`。

| 客户端 | 核心流程 | 当前 harness | 运行状态 |
| --- | --- | --- | --- |
| Web/JS | token、join、publish/subscribe audio、stats | `tests/compatibility/web` | deferred-beelink |
| Flutter | primary/secondary、LocalAudioTrack、TrackSubscribed、stats | `tests/compatibility/flutter` | deferred-beelink |
| Node | token、RTC node readiness、audio publish/subscribe | `tests/compatibility/node` | deferred-beelink |
| Python Agent | 官方 `livekit.rtc.Room` join/leave、dispatch handler | `services/agent-worker-python/livekit_room.py` | deferred-beelink |
| iOS/Android | 目标矩阵 | 未纳入本轮实现 | planned |

禁止把 Mac 本地运行结果当作 Beelink/5090 服务器验收证据。
