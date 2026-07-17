# Packages

| 包 | 内容 |
| --- | --- |
| [`contracts`](contracts/README.md) | 历史翻译合同原型，已冻结，不在根 workspace、默认构建或发布流程中 |
| [`livekit-compat`](livekit-compat/README.md) | 官方 LiveKit Server SDK、Room/Media/Webhook 适配层；对外提供 `YujianRtc*` 别名和双节点池 |
| [`platform-contracts`](platform-contracts/README.md) | Tenant、Project、Environment、Agent、SIP、Media、Billing、Data Rights 和 Telemetry 合同 |
| `observability` | RTC/Agent trace、metrics、日志脱敏和错误分类边界 |

通用领域包不能依赖具体数据库、Flutter 或模型运行时。只有明确命名的
`livekit-compat` adapter 可以依赖固定版本 LiveKit SDK；官方包名和协议字段保留
`LiveKit`，语见控制面使用 `yujian/rtc` 命名。
