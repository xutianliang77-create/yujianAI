# HarmonyOS / 小程序可行性评估

结论：MVP 先复用 Web/Flutter/Node 合同，HarmonyOS 与小程序只做 adapter feasibility，
不复制 LiveKit media core。进入正式开发前需确认：WebRTC/WebSocket 能力、后台音频限制、
录音/网络权限、包体和审核规则、Data/RPC 兼容范围。

输出物：能力矩阵、最小 join/publish/subscribe 原型、权限/合规清单、性能与发布风险；
未完成前不进入 GA 兼容矩阵，不承诺 SDK parity。
