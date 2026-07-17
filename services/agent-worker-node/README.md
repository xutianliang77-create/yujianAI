# `@yujian/agent-worker-node`

Node worker 只使用官方 LiveKit RTC/Agents 边界，不复制或修改 LiveKit 源码。

- `WorkerControlClient`：register、heartbeat、claim、complete、fail、cancel。
- `AgentDispatchRunner`：原子 claim 后执行 handler，按 deadline/cancel 完成或失败回写。
- `AgentDispatchObserver`：可注入记录 claim、完成、失败、轮询异常、traceId 和耗时；观测器异常不会改变 dispatch 结果。
- `AgentDispatchMetricsObserver`：把 dispatch 事件和耗时转发到低基数 Prometheus/OTel sink；
  traceId 不作为指标标签，观测 sink 的同步或异步异常不会改变 dispatch 状态。
- `YujianAgentRoomConnector`（兼容别名 `LiveKitAgentRoomConnector`）：按 handler 需要建立和清理官方 `@livekit/rtc-node` Room session。

Room token 由平台控制面签发，不能写入 dispatch 持久化记录。生产 handler 应在收到
`ClaimedDispatch` 后通过受控 token provider 获取短期 token，并使用 `AbortSignal` 传播 drain。

进程入口通过 `YUJIAN_AGENT_HANDLER_MODULE` 加载部署侧 ESM handler（导出 `handleDispatch`
或 default）；未设置时只注册/heartbeat，不主动领取 dispatch。handler 负责把 token 交给
官方 Room/provider adapter，核心 worker 不加载模型 secret。
