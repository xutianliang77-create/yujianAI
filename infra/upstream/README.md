# LiveKit 上游基线

`livekit-versions.json` 是语见AI当前唯一的 LiveKit 上游版本清单。

## 规则

- 只采用官方 `livekit/*` 仓库、官方 npm 包和官方容器镜像。
- Git tag 同时冻结到解引用后的 commit。
- 容器按平台冻结 digest，不使用 `latest`。
- 本目录不复制上游源码；需要修改时先建立 clean branch 和最小 patch queue。
- `livekit-patch-queue.json` 是唯一 patch 登记表，M1 保持为空且禁止媒体核心 patch。
- clean bare mirrors 只同步到工作区外缓存，不作为 workspace dependency 或运行时路径。
- 所有候选仓库当前按 Apache-2.0 记录，发行前仍需对固定版本重新生成许可证清单。

## 校验

```bash
npm run verify:upstream
npm run verify:upstream:network
npm run upstream:mirror:sync
YUJIAN_UPSTREAM_MIRROR_ROOT="$HOME/.cache/yujian/upstream" \
YUJIAN_UPSTREAM_REPLAY_REPORT="/tmp/yujian-upstream-replay.json" \
  npm run upstream:patch:replay
```

第一条只执行离线结构校验，进入仓库 `check`。第二条访问官方 Git 和 npm registry，
确认 tag、commit 与包版本仍可解析。第三条只在 Beelink 上执行，把官方仓库同步到
`${YUJIAN_UPSTREAM_MIRROR_ROOT:-~/.cache/yujian/upstream}`，并验证所有冻结 commit
存在；脚本拒绝把 mirror 放入本工作区。第四条在临时 checkout 中把登记补丁真正应用到
固定 commit，记录 manifest/queue SHA-256、上游 base/result tree 和冲突状态；不会修改 bare
mirror。没有 `status=passed` 的报告，不能关闭 P1-M0-03。

冻结组件的 Linux AMD64 clean build 使用
[`build-images/`](build-images/) 中按 digest/精确包版本固定的辅助工具链；工具链不进入运行时
发行物。真实 mirror、replay、重复构建和 artifact SHA-256 的脱敏索引见
[`p1-upstream-evidence.json`](../../docs/acceptance/p1-upstream-evidence.json)。

当前 Linux AMD64 镜像范围冻结在 [`p1-image-scope.json`](p1-image-scope.json)。在 Beelink
使用 `tools/supply-chain/run-image-evidence.sh` 生成逐镜像 SPDX/Grype 报告，并用 Cosign
对 digest、SBOM/scan 和工具哈希聚合声明签名。2026-07-18 的真实 run 因 76 个未豁免
Critical 和 465 个 license `NOASSERTION` 阻断；索引见
[`p1-supply-chain-evidence.json`](../../docs/acceptance/p1-supply-chain-evidence.json)。

补丁候选独立冻结在 [`p1-image-candidates.json`](p1-image-candidates.json)，其
`deploymentAllowed=false` 是强制边界。2026-07-18 的候选 run 只拉取/扫描，没有
切换当前容器；Redis 7.2.14-alpine 为零 Critical，随后已通过 loopback-only 竞争、quota、
重启和删除重建隔离回归，当前 P2 Redis 仍未切换，发布未获批准。固定源码最小安全重建后，
PostgreSQL/OpenBao 候选最终达到 Critical 0、High 0。四个候选 digest 已推送到 Beelink
Tailscale-only Registry，并使用 OpenBao transit key 完成生产候选 OCI 签名、SPDX
attestation 与外部逐 blob 校验；PostgreSQL/OpenBao 运行回归已通过。335 个原始
`licenseDeclared=NOASSERTION` 已由独立、签名的结论层逐项分类，结论层中
`licenseConcluded=NOASSERTION` 为 0；`reedsolomon v1.0.0` 仍有 1 个显式法律待判项。
bbb Registry/KMS 与 ccc 当前 reject 继续阻断发布。索引见
[`p1-supply-chain-candidate-evidence.json`](../../docs/acceptance/p1-supply-chain-candidate-evidence.json)
与
[`p1-remediated-candidate-evidence.json`](../../docs/acceptance/p1-remediated-candidate-evidence.json)、
[`p1-license-remediation-evidence.json`](../../docs/acceptance/p1-license-remediation-evidence.json)。
生产 OCI 索引见
[`p1-production-oci-evidence.json`](../../docs/acceptance/p1-production-oci-evidence.json)。

采用策略见
[SOURCE_REUSE_AND_UPSTREAM_STRATEGY.md](../../docs/migration/SOURCE_REUSE_AND_UPSTREAM_STRATEGY.md)。
