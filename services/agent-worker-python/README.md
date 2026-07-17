# Python Agent worker baseline

Python worker 与 Node worker 共享 `AgentDispatchV1`、deadline、traceId、cancel/drain 合同。
生产镜像必须锁定 digest、附带 SBOM/签名，并通过短期 workload identity 获取 provider secret。

Node 与 Python worker 都提供 `WorkerControlClient`，约定 register/heartbeat/start/complete/fail
内部接口；Python reference worker 在设置 `YUJIAN_AGENT_CONTROL_URL`、credential 和
environment 后会注册并每 5 秒 heartbeat。credential 只放在 `x-yujian-worker-token` header，
不写入 job JSON；跨进程 URL 必须使用 HTTPS。

两种 worker 都可调用 `claim` 原子领取同环境最早截止 dispatch。Node 版本已提供官方
`@livekit/rtc-node` Room join/leave adapter；Python Room join 按锁定的 LiveKit Agents Python
版本由 `YujianAgentRoomConnector`（兼容别名 `LiveKitAgentRoomConnector`）接入，依赖锁定在 `requirements.txt`，不在 reference worker 中偷偷
引入运行时依赖。Room token 仍由控制面签发，Python worker 不持有 API secret。

`AgentDispatchRunner` 已把 Python claim、deadline、handler、complete/fail 和 drain cancel
串成运行时边界。设置 `YUJIAN_AGENT_HANDLER_MODULE` 后，reference worker 会加载该 `.py`
文件中的异步 `handle_dispatch`，由部署侧注入官方 LiveKit Python Room/provider adapter；未
设置时只注册/heartbeat，不主动领取 dispatch。
