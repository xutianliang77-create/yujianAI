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

2026-07-18 当前镜像 SPDX 共识别 647 个包，其中 465 个许可证字段为 `NOASSERTION`；
因此本清单仍是工程库存，不是完整 NOTICE 或法律批准。逐包补全和个人 `legal-owner`/
`compliance-owner` 签字见 `docs/compliance/P1_M0_04_SUPPLY_CHAIN_REVIEW.md` 的阻断记录。
