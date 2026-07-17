# Telephony / Ingress / Egress 生产边界

`@yujian/media-ops` 负责幂等、生命周期、quota、audit 和合规 feature gate；
`@yujian/livekit-compat` 的 `YujianMediaServiceAdapter` 只调用官方 LiveKit
IngressClient、EgressClient 和 SipClient。平台不得复制或修改 LiveKit media core。

默认状态：`sip=false`、`egress=false`，Ingress 也必须显式开启。开启前必须完成 provider
合作、TLS/SRTP、号码与录音告知、对象存储保留/删除、成本熔断和 webhook 对账。
