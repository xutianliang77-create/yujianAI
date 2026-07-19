# OpenBao 2.5.4 语见安全重建源码说明

日期：2026-07-18

状态：实际源码整改包已生成；`legal-owner` ccc 当前 sequence 1 reject，等待其基于新证据
决定是否需要 supersede；`compliance-owner` ddd 当前 sequence 1 approve 不替代法律意见

## 上游来源

- 项目：OpenBao
- 许可证：MPL-2.0
- tag：`v2.5.4`
- commit：`4f6d47246a053375271a5fd8af85c3b75695aa46`
- 官方 source distribution：`openbao-dist-2.5.4.tar.xz`
- SHA-256：`5dd8bc003fcb8b1b601f0e75827df3819a9d5021b3094729c4d375508fd844b7`
- 官方下载：`https://github.com/openbao/openbao/releases/download/v2.5.4/openbao-dist-2.5.4.tar.xz`

正式分发物必须同时保留上游 MPL-2.0 文本和 source distribution 中生成的
`LICENSE_DEPENDENCIES.md`。语见的候选 Dockerfile 会把后者放入镜像
`/licenses/openbao-dependencies.md`。

## 语见修改范围

构建合同见
[`openbao-2.5.4-crypto.Dockerfile`](build-images/openbao-2.5.4-crypto.Dockerfile)，只允许：

1. 将根模块与 `sdk` 模块的 `golang.org/x/crypto` 提升到 `v0.52.0`，并将
   `golang.org/x/net` 提升到 `v0.55.0`。
2. 使用固定 builder
   `golang:1.25.12-alpine3.24@sha256:56961d79ea8129efddcc0b8643fd8a5416b4e6228cfd477e3fd61deb2672c587`
   重建 `bao`。
3. 保留官方 OpenBao 2.5.4 镜像为运行基础层，将 `libcrypto3`/`libssl3` 从 3.5.6-r0
   升到 3.5.7-r0。
4. 版本标记为 `OpenBao v2.5.4-yujian.2`，不得冒充官方未修改发行物。

没有修改业务源码文件；依赖选择和构建/镜像配方属于可复现的发行 patch。若后续修改
MPL 覆盖的源码文件，必须额外归档逐文件 patch，并随分发物提供对应源代码。

## 工程归档

Beelink 源码和构建证据只放在 `/data/models/yujianAI/p1-m0-04/`，不得复制 secret。
正式 OCI 发布时必须在语见控制的 registry artifact/attestation 中关联：

- 本文件和 Dockerfile hash；
- 上游 source distribution hash；
- 语见镜像 digest、SPDX、漏洞扫描和签名 bundle；
- ccc/ddd 的签字决定。

当前候选内 `/licenses/openbao-MPL-2.0.txt` SHA-256 为
`d6b1a865f1c8c697d343bd4e0ce61025f91898486a1f00d727f32e8644af77d3`，
`/licenses/openbao-dependencies.md` SHA-256 为
`f4293107047228ac15cdf62b2054ff04ba55a22887406fbcc6b6aa564e469bd9`。
实际私有 Registry 引用为
`beelink.tail1e9cec.ts.net:5443/yujian/p1/openbao@sha256:8f0a920223e6974c5a959153bc0f0aeee5602314fdd8ef010bb74c53500f8a71`；
SPDX SHA-256 为 `73a4205a6a1849e27103b718e2fd0057006f1c197653cea09f2527642c6a3395`，
OpenBao KMS 签名与 attestation 结果索引见
[`p1-production-oci-evidence.json`](../../docs/acceptance/p1-production-oci-evidence.json)。

## 实际源码整改包

Beelink run `p1-m0-04-license-remediation-20260718T165733Z` 已把 37,337,832 字节的官方
`openbao-dist-2.5.4.tar.xz`、本候选 Dockerfile、构建 runner、MPL-2.0 原文、342 段依赖
许可证、NOTICE、逐包 SPDX 结论和 SHA256SUMS 放入同一只读证据根。源码归档 SHA-256
保持 `5dd8bc...44b7`；manifest SHA-256 为
`b8ed96caebb64f3121d0ab9f33bb33d8e27eb0f0aa7e62d3a287c9f2ac043d79`，cosign blob 验签通过。
索引见
[`p1-license-remediation-evidence.json`](../../docs/acceptance/p1-license-remediation-evidence.json)。

该包还明确暴露唯一的法律待判项：`github.com/yeqown/reedsolomon@v1.0.0` 的 tag 不含
许可证文件，而上游 MIT 文件在 2026-03-08 才加入。因此没有把后续 MIT 文本静默套用到
旧 tag，而是使用 pending-legal LicenseRef。工程包已可供审阅，但本记录不是法律意见；
ccc 当前 reject 未被覆盖，LICENSE/NOTICE Gate 保持阻断。
