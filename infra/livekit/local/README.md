# 本地语见 RTC 兼容实验室

这是 M1 兼容实验室的双节点开发环境，直接运行两个官方 LiveKit Server `v1.13.3`
镜像并共享 Redis `7.2.7`，不包含语见媒体 fork。

该文件现作为 Compose 基础层保留，不再在 Mac 上运行；实际验证通过
`../beelink/compose.override.yaml` 切换到 Linux AMD64 和 Beelink 网络配置。

## 启动

```bash
npm run rtc:up
docker compose -f infra/livekit/local/compose.yaml ps
```

语见 RTC 的两个本地兼容入口分别是 `ws://127.0.0.1:7880` 和
`ws://127.0.0.1:7980`。底层使用 LiveKit 官方 dev mode 固定凭据，只允许本机测试，
禁止用于局域网共享、staging 或生产。

## 关闭

```bash
npm run rtc:down
```

## 平台

当前 compose 针对本机 Colima 的 `linux/arm64` runtime 固定镜像 digest。AMD64
开发机应使用 `infra/upstream/livekit-versions.json` 中的 AMD64 digest，并通过独立
override 文件修改 `image` 和 `platform`，不要使用浮动 tag。

本机若设置了 `HTTP_PROXY`、`HTTPS_PROXY` 或 `ALL_PROXY`，原生 RTC SDK 可能把本地
WebSocket 错误发送到代理。集成测试在 `YUJIAN_RTC_PRIMARY_URL` 为 loopback 时会先
移除这些代理环境变量；远程测试不做此处理。

## 边界

- 两个 RTC 节点共享 Redis routing，并分别开放独立 HTTP、ICE/TCP 和 ICE/UDP 端口。
- 生产 TURN/TLS、SIP、Ingress 和 Egress 尚未启用。
- 生产部署必须使用独立 key、TLS、Redis、容量限制和网络安全配置。
