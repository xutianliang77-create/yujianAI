# SDK 兼容矩阵

状态：M1 A-C baseline 已通过；完整 Gate 1 未通过；D/E 尚未执行。

机器可读矩阵：`tests/compatibility/compatibility-matrix.json`。

| 客户端 | 核心流程 | 当前 harness | 运行状态 |
| --- | --- | --- | --- |
| Web/JS | token、join、publish/subscribe audio、Data/RPC、camera/screen synthetic Track、mute/unpublish、receiver quality sample、synthetic reconnect | `tests/compatibility/web` | passed-baseline；新扩展 implemented-deferred；既有本机 Chrome run `20260717T080332Z` |
| Flutter | primary/secondary、LocalAudioTrack、TrackSubscribed、Data/RPC、mute/unpublish、bytesReceived | `tests/compatibility/flutter` | passed-baseline；新扩展 implemented-deferred；既有本机 Flutter Web run `20260717T080332Z` |
| Node | token、RTC node readiness、Room/Participant、audio publish/subscribe、Data/RPC | `tests/integration/platform-rtc-smoke.test.mjs` | passed-baseline；Beelink，run `20260717T075738Z` |
| Python Agent | 官方 `livekit.rtc.Room` join/leave smoke、dispatch handler | `tests/compatibility/python/README.md` | deferred-runtime；join/leave harness implemented-deferred |
| iOS/Android | 目标矩阵 | 未纳入本轮实现 | planned |

既有运行证据只覆盖音频、Data/RPC 和双节点连接；本轮代码新增合成 camera/screen、
mute/unpublish、SDK-internal synthetic reconnect、接收端质量采样和 Flutter Data/RPC，但尚未在 Beelink/
客户端重新运行。仍不包含真实视频设备、TURN/弱网恢复、真实硬件麦克风/扬声器、原生
iOS/Android、Python Agent 或完整 Gate 1。SDK 合成 reconnect 不能替代网络故障注入证据。
Mac 客户端报告不能替代 Beelink 服务器证据；服务器端报告路径见
`PROGRESS_LOG.md` 和完成审计。

2026-07-18 的 P1 clean upstream 证据另外验证了 Web/Node/Agents 产物哈希和
Flutter 3.44.0 冻结根包的 `lib/test` analyze 与 260 passed/1 skipped；它是源码
构建/静态测试证据，不改变上表的 RTC 真实运行状态。

同日 P1-M0-04 Owner acceptance v2 已记录五项不可变原始决定；aaa 后续追加 sequence 1
批准，bbb Registry/KMS 与 ccc 法律后续均追加 sequence 1 驳回，ddd 中国分发追加 sequence 1
批准，因此当前为三项批准、两项驳回，
但它只同步供应链发布门禁，不改变本矩阵：
M1 A-C baseline 通过，完整 Gate 1 仍未通过，D/E 未执行。
