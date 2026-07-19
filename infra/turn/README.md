# TURN 边界

语见 RTC 不把 TURN 逻辑复制进 LiveKit Server；使用独立 coturn 集群，并由控制面签发短期
credential。生产部署必须通过镜像 digest 注入 `YUJIAN_TURN_IMAGE`，配置公网 TLS 证书、
UDP/TCP/TLS 监听、带宽上限和 region 标签。当前 Beelink 验收只覆盖双官方 LiveKit 节点，
TURN Gate 仍未通过。

Helm 生产实现位于 `infra/helm/yujian-platform/templates/turn-*`：至少两个跨 zone 副本、
LoadBalancer/NodePort、client IP affinity、3478 UDP/TCP、5349 TLS、最多 101 个显式 relay UDP
端口、PDB、只读根文件系统和公网 ingress/relay egress NetworkPolicy。`image.turn` 必须使用
`@sha256:`，TLS 和完整 `turnserver.conf` 均来自现有 Secret。

`static-auth-secret` 不得写入 values 或 ConfigMap。`turn.configSecret` 应由 OpenBao CSI/同步器
从 `turn.secretRef` 生成；platform-api runtime 从同一 OpenBao reference 读取 secret，并通过
`POST /platform/v1/rtc/turn-credentials` 生成 60–3600 秒 TURN REST HMAC-SHA1 credential。API
只返回短期 username/password 和公开 URL，不返回共享 secret。TURN 开启时缺少 KMS issuer，
platform-api 会 fail-closed。

容量 sidecar 使用 RoomService 读取 Room/Participant/Track，并将 subscription 按
`participants × published tracks` 上界计数；它通过独立内部 credential 上报 Redis。SIGTERM
先上报 `draining=true`，平台的原子 admission lease 会跳过 draining、过期或超容量节点。
本轮仅完成代码和部署合同，尚未运行 coturn、弱网或运营商验收，因此 TURN Gate 仍未通过。
