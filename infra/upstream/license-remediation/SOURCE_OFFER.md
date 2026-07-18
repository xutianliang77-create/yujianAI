# OpenBao 2.5.4-yujian.2 源码可得性包

状态：实际源码随包提供；等待 `legal-owner` ccc 判断中国分发、MPL-2.0、NOTICE 与商标
要求是否满足。ccc 当前有效决定仍为 reject。

## 对应二进制

- 候选镜像：`yujian/p1-openbao:2.5.4-crypto0.52-net0.55-openssl3.5.7-go1.25.12`
- 上游 tag：`v2.5.4`
- 上游 commit：`4f6d47246a053375271a5fd8af85c3b75695aa46`
- 语见版本标记：`OpenBao v2.5.4-yujian.2`

## 随包实际源码与构建材料

- `source-offer/openbao-dist-2.5.4.tar.xz`
  - 官方发布地址：`https://github.com/openbao/openbao/releases/download/v2.5.4/openbao-dist-2.5.4.tar.xz`
  - SHA-256：`5dd8bc003fcb8b1b601f0e75827df3819a9d5021b3094729c4d375508fd844b7`
- `source-offer/openbao-2.5.4-crypto.Dockerfile`
  - 完整记录构建基础镜像、Go 版本、构建参数、语见版本标记和依赖变更；
- `source-offer/build-remediated-candidates.sh`
  - 校验源码 hash、固定 gosu commit、执行隔离构建并保护当前运行容器；
- `licenses/openbao-2.5.4-MPL-2.0.txt`
- `licenses/openbao-dependencies.md`
- `source-evidence/openbao-helper-stubbolt.go`
  - 证明 `github.com/boltdb/bolt` 被本地 MPL-2.0 stub 替换；
- `source-evidence/openbao-template-v1.0.1-LICENSE.txt`。

构建配方只在 builder 内执行以下模块选择变更，原始源码归档不被覆盖：根模块与 `sdk`
模块的 `golang.org/x/crypto` 固定为 `v0.52.0`，`golang.org/x/net` 固定为 `v0.55.0`；
运行层 `libcrypto3`/`libssl3` 固定为 `3.5.7-r0`。正式分发应把本源码包作为同一发布物的
附件或等价可长期访问的制品，并保持 `SHA256SUMS` 与工程签名可验证。

该包提供可重建材料，但是否构成特定司法辖区下充分的 source offer、是否需要进一步
提供修改后工作树或书面联系渠道，仍由 ccc 专业签字决定；工程自动化不得替代该决定。
