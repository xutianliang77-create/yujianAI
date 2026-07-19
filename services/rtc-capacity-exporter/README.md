# @yujian/rtc-capacity-exporter

与语见 RTC pod 同生命周期运行的容量上报 sidecar。它只通过官方 LiveKit
`RoomServiceClient` 读取本 pod 的 Room/Participant 状态，不访问 PostgreSQL、Redis 或 KMS。

每次报告包含短 TTL、单调 sequence、健康/drain 状态和以下保守计数：

- Room、participant、publisher、published track 的当前计数；
- `participant 数 × published track 数` 的 subscription 上界，避免少算容量；
- 部署配置的节点硬上限。

报告通过独立 Bearer credential 发送到
`POST /internal/v1/rtc/capacity`。SIGTERM/SIGINT 会停止周期调度并在退出前发送一次
`draining=true`；platform-api 随后不再向该节点签发新票据。报告过期、RoomService 失败、
节点 draining 或 Redis 不可用时，生产 token admission 必须 fail-closed。

## 必需配置

```text
YUJIAN_RTC_NODE_ID
YUJIAN_RTC_LOCAL_URL
YUJIAN_RTC_API_KEY
YUJIAN_RTC_API_SECRET
YUJIAN_RTC_CAPACITY_PLATFORM_URL
YUJIAN_RTC_CAPACITY_CREDENTIAL
```

容量上限、上报周期和 TTL 使用 `YUJIAN_RTC_MAX_*`、
`YUJIAN_RTC_CAPACITY_INTERVAL_MS` 与 `YUJIAN_RTC_CAPACITY_TTL_MS`。credential 必须至少
32 个字符，只通过 Secret/CSI 注入；日志和报告正文均不得包含它。

该实现只完成合同和部署接线。AZ failover、自动扩缩、容量竞争、drain 和过期报告的真实
Kubernetes/Beelink 验收尚未执行，不能据此宣称 Gate 3 通过。
