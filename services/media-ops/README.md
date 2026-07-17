# `@yujian/media-ops`

媒体控制服务只接受 platform-api 的内部 credential，不直接向客户端开放。`MEDIA_OPS_HOST`
默认为 loopback；跨进程或 Kubernetes 部署必须同时设置 `MEDIA_OPS_TLS_CERT_FILE` 和
`MEDIA_OPS_TLS_KEY_FILE`，由 `createMediaOpsHttpsServer` 提供 HTTPS 入口。

能力开关通过环境变量显式控制：`YUJIAN_SIP_ENABLED` 默认 `false`，`YUJIAN_INGRESS_ENABLED`
默认 `true`，`YUJIAN_EGRESS_ENABLED` 默认 `false`。SIP/录制能力仍需 provider、合规和留存
审批，不得只通过环境变量绕过平台 Gate。

启用 `YujianMediaOpsProvider`（底层官方 LiveKit adapter）时设置 `YUJIAN_MEDIA_PROVIDER_ENABLED=true`、RTC URL/API
凭据；SIP 请求必须带 `sipTrunkId`，或由 `YUJIAN_SIP_DEFAULT_TRUNK_ID` 提供默认值。
provider 的异步回调使用内部 `:status` 端点更新状态，media-ops 会执行状态机和重复回调
幂等检查，不接受客户端直接写状态。
SIP active call 的 transfer/hangup 通过官方 `SipClient.transferSipParticipant` 和
`RoomServiceClient.removeParticipant` 执行；请求必须有受控的 `participantIdentity`，不能
直接以外部 provider ID 绕过控制面。

创建请求的 `Idempotency-Key` 按 environment 作用域保存请求指纹；同一 key 重放相同请求直接
返回已有资源，不会再次调用上游；复用 key 但修改房间、类型或目标地址会返回冲突。URL ingress
使用 `url` 字段，录制使用 `outputTarget` 字段；目标地址不会写入资源账本。

生产部署可通过 `YUJIAN_MEDIA_PERSISTENCE_MODULE` 注入 `MediaOpsPersistence`；官方实现
`PostgresMediaOpsPersistence` 使用 `004_media_ops.sql` 的单行快照表和 version CAS。`NODE_ENV=production`
缺少该 adapter 时进程拒绝启动，避免媒体幂等和生命周期退化为进程内状态。启用 Egress 时，
runtime module 还必须提供 `createMediaOpsRetentionWorker`；`MediaRetentionWorker` 按 retention
到期批量删除对象、写入 deletion evidence 并与进程停止顺序绑定，删除失败不会标记为已完成。
