# TURN 边界

语见 RTC 不把 TURN 逻辑复制进 LiveKit Server；使用独立 coturn 集群，并由控制面签发短期
credential。生产部署必须通过镜像 digest 注入 `YUJIAN_TURN_IMAGE`，配置公网 TLS 证书、
UDP/TCP/TLS 监听、带宽上限和 region 标签。当前 Beelink 验收只覆盖双官方 LiveKit 节点，
TURN Gate 仍未通过。
