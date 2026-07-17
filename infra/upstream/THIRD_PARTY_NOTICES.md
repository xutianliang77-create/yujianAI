# 第三方组件说明

当前开发基线直接使用 LiveKit 官方发行物，不复制上游源文件到本仓库。

| 组件 | 来源 | 记录许可证 |
| --- | --- | --- |
| LiveKit Server | `livekit/livekit` | Apache-2.0 |
| LiveKit Protocol | `livekit/protocol` | Apache-2.0 |
| LiveKit SIP | `livekit/sip` | Apache-2.0 |
| LiveKit Ingress | `livekit/ingress` | Apache-2.0 |
| LiveKit Egress | `livekit/egress` | Apache-2.0 |
| LiveKit Agents Python | `livekit/agents` | Apache-2.0 |
| LiveKit Agents Node.js | `livekit/agents-js` | Apache-2.0 |
| LiveKit Node SDKs | `livekit/node-sdks` | Apache-2.0 |
| LiveKit JavaScript SDK | `livekit/client-sdk-js` | Apache-2.0 |
| LiveKit Flutter SDK | `livekit/client-sdk-flutter` | Apache-2.0 |
| Redis 7.2.7 | `redis` official image | BSD-3-Clause |

精确版本和 commit 见 `livekit-versions.json`。正式分发前必须从固定源码和二进制重新
生成完整 SBOM、LICENSE 和 NOTICE；本文件不是最终法律意见。
