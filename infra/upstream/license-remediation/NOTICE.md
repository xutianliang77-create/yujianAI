# 语见 P1-M0-04 候选分发 NOTICE

状态：工程整改包；`legal-owner` ccc 当前决定仍为 reject，禁止据此发布。

本包对应以下两个候选镜像，不替换 Beelink 当前运行容器：

- `yujian/p1-postgres:16.14-alpine-gosu-go1.25.12`
- `yujian/p1-openbao:2.5.4-crypto0.52-net0.55-openssl3.5.7-go1.25.12`

原始 Syft SPDX 中 335 个包的 `licenseDeclared` 为 `NOASSERTION`。整改过程保留这些原始
声明和原始 SBOM，另生成 `licenseConcluded` 结论层：331 条有固定许可证证据，1 条是无
独立内容的 Alpine 虚拟依赖包，2 条是指向逐包结论的 OCI 镜像聚合记录，1 条
`github.com/yeqown/reedsolomon@v1.0.0` 需要法律 Owner 判断。

## 随包许可证材料

- PostgreSQL 16.14：PostgreSQL License；
- gosu 1.19 与 `github.com/moby/sys/user@v0.1.0`：Apache-2.0；
- `golang.org/x/sys@v0.1.0`：BSD-3-Clause；
- OpenBao 2.5.4、OpenBao 本地模块、stubbolt 替换和 openbao-template 1.0.1：MPL-2.0；
- OpenBao 依赖：`licenses/openbao-dependencies.md` 中的 342 个许可证段落；
- 逐包映射：`noassertion-inventory.json`；
- 结论层 SPDX：`remediated-sbom/*.spdx.json`。

`reedsolomon v1.0.0` 的 2018 tag 不含 LICENSE/COPYING/NOTICE。上游于 2026-03-08 的
commit `c5f4bc9af094852b52e593a5f964647c43028c51` 才增加 MIT 文本。本包保留该后续文本和
提交证据，但结论明确写成 `LicenseRef-Yujian-ReedSolomon-Pending-Legal`，不得自动按
MIT 放行。

## 分发边界

任何正式 OCI 或离线包必须同时携带本 NOTICE、全部许可证文本、两个结论层 SPDX、
`SHA256SUMS`、签名 bundle 和 `SOURCE_OFFER.md` 约定的实际源码。不得使用 LiveKit、
OpenBao、PostgreSQL 或其他上游商标暗示背书。当前工程整改不覆盖 ccc 的 reject，也不
授权 registry promotion、运行容器切换或生产发布。

本文件是工程库存和归属材料，不是法律意见。
