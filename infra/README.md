# Infrastructure

- [`upstream/`](upstream/README.md)：LiveKit server、protocol、SIP、Ingress、
  Egress 和 Agents 的版本 manifest、patch 清单和许可证。
- [`livekit/local/`](livekit/local/README.md)：固定 digest 的官方 LiveKit Server
  双节点兼容实验室。
- [`livekit/beelink/`](livekit/beelink/README.md)：Linux AMD64、单 RTX 5090 的唯一
  服务器端与验收入口。
- `platform/`：语见控制面、Agent 平台、数据与可观测。
- `environments/`：local、integration、staging、production 和 private-validation
  的非敏感配置模板。

所有镜像使用 digest，生成文件、secret 和真实部署凭据不得进入 Git。私有化交付不能
隐式依赖语见公网服务。
