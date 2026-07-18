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
| Redis 7.2.7 / 7.2.14 candidate | `redis` official image / `redis/redis` tag 7.2.14 | BSD-3-Clause |
| PostgreSQL 16.14 candidate | `postgres` official Alpine image / PostgreSQL tag `REL_16_14` | PostgreSQL |
| gosu 1.19 candidate rebuild | `tianon/gosu` commit `6456aaa0f3c854d199d0f037f068eb97515b7513` | Apache-2.0 |
| OpenBao 2.5.4 candidate rebuild | `openbao/openbao` commit `4f6d47246a053375271a5fd8af85c3b75695aa46` | MPL-2.0 + dependency licenses |

精确版本和 commit 见 `livekit-versions.json`。正式分发前必须从固定源码和二进制重新
生成完整 SBOM、LICENSE 和 NOTICE；本文件不是最终法律意见。

## P1-M0-04 候选分发载荷

2026-07-18 的最终本地安全重建已把以下原文放入候选镜像；hash 已在 Beelink 真实容器内
复核：

| 镜像 | 镜像内文件 | SHA-256 |
| --- | --- | --- |
| PostgreSQL candidate | `/licenses/postgresql-COPYRIGHT.txt` | `3d6af92ff8a4c2cdf69afb1cf44edea727922f5cd0cf8b5f72b11cdecac8fdfd` |
| PostgreSQL candidate | `/licenses/gosu-Apache-2.0.txt` | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |
| OpenBao candidate | `/licenses/openbao-MPL-2.0.txt` | `d6b1a865f1c8c697d343bd4e0ce61025f91898486a1f00d727f32e8644af77d3` |
| OpenBao candidate | `/licenses/openbao-dependencies.md` | `f4293107047228ac15cdf62b2054ff04ba55a22887406fbcc6b6aa564e469bd9` |

Redis 7.2.14 的 BSD-3-Clause 原文归档在
[`licenses/redis-7.2.14-COPYING.txt`](licenses/redis-7.2.14-COPYING.txt)，SHA-256 为
`97f0a15b7bbae580d2609dad2e11f1956ae167be296ab60f4691ab9c30ee9828`；正式 Redis OCI
产物必须把该文件随镜像或离线发行包交付。

当前运行镜像 SPDX 共识别 647 个包，其中 465 个许可证声明为 `NOASSERTION`；两个本地
安全重建候选共识别 405 个包，其中 335 个原始声明为 `NOASSERTION`。原始 SBOM 不覆盖。

2026-07-19 工程整改 run `p1-m0-04-license-remediation-20260718T165733Z` 已对这 335 条逐项
分类并生成独立 SPDX 结论层：331 条由固定许可证文本支持，1 条为无独立内容的 Alpine
虚拟包，2 条为指向逐包许可证的镜像聚合记录，1 条 `reedsolomon v1.0.0` 因 tag 不含
许可证而标记 `LicenseRef-Yujian-ReedSolomon-Pending-Legal`。结论层中
`licenseConcluded=NOASSERTION` 为 0；这表示工程清单不再含糊，不表示最后一项或整体分发
已经获得法律批准。

实际整改包位于 Beelink
`/data/models/yujianAI/evidence/p1-m0-04/p1-m0-04-license-remediation-20260718T165733Z/`，
包含 NOTICE、逐包 inventory、双 SPDX、全部许可证文本、OpenBao 37 MB 源码归档、构建
配方、SHA256SUMS 和已验工程签名。机器索引见
[`p1-license-remediation-evidence.json`](../../docs/acceptance/p1-license-remediation-evidence.json)。
ccc 当前 sequence 1 reject 和 bbb Registry/KMS reject 继续阻断；本文件不是法律意见或
生产批准。
