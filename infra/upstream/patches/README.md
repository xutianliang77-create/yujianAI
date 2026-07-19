# LiveKit patch queue

当前 patch queue 为空，语见直接运行固定版本的官方组件。

任何 patch 必须先在 `livekit-patch-queue.json` 登记以下字段：

- `id`、`componentId`、`baseCommit`、`patchFile`、`sha256`；
- `license`、`purpose`、`scope`、`compatibility`、`security`、`tests`；
- `rollback`、`upstream`、`owner`、`reviewDate`。

`patchFile` 必须是相对于 patch queue 的 `patches/*.patch` 路径，`baseCommit` 必须等于冻结 manifest
中的 component commit，SHA-256 不匹配、路径逃逸、空评审字段或 `git apply --check` 冲突
都会 fail closed。媒体核心 patch 默认禁止；优先在语见控制面、adapter 或独立服务中实现
差异。不得直接修改 clean mirror。
