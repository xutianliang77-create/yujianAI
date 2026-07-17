# Node Agent quickstart

示例只展示控制面 dispatch/worker 生命周期，不持有 LiveKit API secret。worker 通过短期
workload identity 加入 Room，所有 job 都带 `deadlineAt`、`traceId` 和 `dispatchId`。
