# @yujian/livekit-compat

本包直接复用固定版本 `livekit-server-sdk@2.17.0`，只增加语见平台的输入限制、endpoint
规范化和 readiness adapter。

## 当前能力

- 按 `@yujian/platform-contracts` 签发短期 Room join token。
- 保持 LiveKit JWT grant 语义。
- 将 `ws/wss` endpoint 转成 Server API 的 `http/https` endpoint。
- 使用官方 `RoomServiceClient.listRooms()` 执行 readiness 探测。

本包不复制 LiveKit SDK 代码，不修改 LiveKit JWT token 字段，也不提供媒体实现。语见
控制面响应可以额外返回 `nodeId`，它不属于上游 JWT 或协议字段。

对外自有代码优先使用 `YujianRtcNodePool`、`YujianRtcAdminProbe`、
`YujianRoomTokenIssuer`、`YujianRtcConnectionConfig` 和 `normalizeYujianRtcWsUrl` 这些
`yujian` 名称。`LiveKit*` 类型和官方依赖仍保留为兼容边界：它们表示实际使用的上游
Server API、JWT 和协议，不应被改名或复制。

`YujianRtcNodePool` 支持 1-16 个固定节点，提供轮询选点和全节点就绪检查。它只负责
控制面路由；媒体转发、Track 编解码、跨节点 Room routing 继续由官方 Server/Redis
实现。
