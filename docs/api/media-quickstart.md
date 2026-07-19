# 媒体能力 API 约束

所有 Ingress/Egress/SIP 创建请求必须携带 `Idempotency-Key`，并在平台账本中保存 provider
ID。重复请求返回同一资源，不得重复创建或计费。

录制输出必须绑定 `environmentId`、`retentionExpiresAt` 和删除证据；签名读取 URL 为短期、
单资源、不可列举。SIP/外呼在合规 Gate 未通过前返回 `COMPLIANCE_RESTRICTED`，不能用
provider 直连绕过控制面。

provider 的异步状态回调只进入 media-ops 内部端点，并使用独立的
`YUJIAN_MEDIA_PROVIDER_CALLBACK_CREDENTIAL`，不得复用 platform-api 调用 media-ops 的内部凭据：

```text
POST /internal/v1/environments/{environmentId}/media/ingress/{ingressId}:status
POST /internal/v1/environments/{environmentId}/media/egress/{egressId}:status
POST /internal/v1/environments/{environmentId}/media/sip/calls/{callId}:status
```

请求体仅允许 `status`、`providerId`、`objectUri`、`retentionExpiresAt`、`reasonCode` 和
`participantIdentity`。重复的同状态回调
是幂等的；非法状态迁移会被拒绝，不能绕过 media-ops 状态机。

创建 ingress/egress 时，`Idempotency-Key` 必须在同一 environment 内保持请求体不变。URL
ingress 将源地址放在 `url` 字段；mp4/HLS/RTMP egress 将目标放在 `outputTarget` 字段。重复
请求只返回第一次资源，不会重复创建上游任务；同一 key 改变这些字段会收到 `409`。

SIP active call 的 transfer/hangup 也必须经过平台 API，并携带 `Idempotency-Key`：

```text
POST /platform/v1/environments/{environmentId}/media/sip/calls/{callId}:transfer
POST /platform/v1/environments/{environmentId}/media/sip/calls/{callId}:hangup
```

创建外呼时建议显式提供 `participantIdentity`，否则无法安全定位官方 RoomService 中的
SIP participant 来执行转接或挂断。首呼 DTMF 可通过 `dtmf` 字段传入（仅允许数字、`*`、
`#` 和 `w`，不写入语见账本正文）；LiveKit 当前 server SDK 未提供独立的后续 DTMF RPC，
因此不能伪造一个不存在的控制面端点。

入呼不会触发语见主动拨号。控制面先创建 `direction=inbound` 的 requested 记录，再由已认证
provider callback 绑定 `providerId`/`participantIdentity` 并推进状态。返回资源仅含号码、DTMF
与幂等键的 SHA-256，不包含原文。URL ingress 只接受无 userinfo 的公网 HTTPS literal；DNS
解析后的网络边界仍由 media-ops NetworkPolicy 和部署侧 provider adapter 二次限制。

生产 runtime module 必须提供请求级媒体凭据、合规/风险/Redis 预算准入，以及 provider usage
对账 worker；未接线时 media-ops fail-closed。`014_media_accounting.sql` 保存不可变 provider
用量、差异、SIP PDD/接通时长摘要和对账 checkpoint，不保存号码、DTMF 或媒体正文。
