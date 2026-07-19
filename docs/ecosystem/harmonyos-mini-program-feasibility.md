# HarmonyOS / 小程序可行性评估

结论：MVP 先复用 Web/Flutter/Node 合同，HarmonyOS 与小程序只做 adapter feasibility，
不复制 LiveKit media core。进入正式开发前需确认：WebRTC/WebSocket 能力、后台音频限制、
录音/网络权限、包体和审核规则、Data/RPC 兼容范围。

输出物：能力矩阵、最小 join/publish/subscribe 原型、权限/合规清单、性能与发布风险；
未完成前不进入 GA 兼容矩阵，不承诺 SDK parity。

## 最小 adapter 实现

`packages/restricted-client-adapter` 已实现受限运行时控制面 bridge：它用短期平台凭据请求
一次性 Room token，校验 `wss://` RTC endpoint 和过期时间，并在 join 前询问原生 bridge
能力。媒体采集、编码、发布和订阅必须由 HarmonyOS/小程序各自的原生 bridge 完成，adapter
不会复制或改写 LiveKit media core；能力不足时 fail closed。

该实现仍是 `implemented-not-run`：真机权限、后台音频、WebSocket/WebRTC 差异、商店审核和
性能结论尚未执行，因此不进入已支持 SDK 列表。
