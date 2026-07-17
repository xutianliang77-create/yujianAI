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
```

第一条只执行离线结构校验，进入仓库 `check`。第二条访问官方 Git 和 npm registry，
确认 tag、commit 与包版本仍可解析。第三条只在 Beelink 上执行，把官方仓库同步到
`${YUJIAN_UPSTREAM_MIRROR_ROOT:-~/.cache/yujian/upstream}`，并验证所有冻结 commit
存在；脚本拒绝把 mirror 放入本工作区。

采用策略见
[SOURCE_REUSE_AND_UPSTREAM_STRATEGY.md](../../docs/migration/SOURCE_REUSE_AND_UPSTREAM_STRATEGY.md)。
