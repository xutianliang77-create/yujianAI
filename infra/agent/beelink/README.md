# Beelink RTX 5090 Agent runtime

RTC 双节点不占用 GPU。`compose.yaml` 通过 `agent-gpu` profile 为 Agent/模型 worker 预留唯一的
RTX 5090，默认不启动；只有在 Beelink 预检确认 NVIDIA driver/CUDA/容器运行时后才可启用。

worker 必须通过 Agent Control API 获取短期凭据，不得把模型 secret 写进 compose 或镜像。
启用 `agent-gpu` profile 时，额外注入 `YUJIAN_AGENT_ENVIRONMENT_ID`、
`YUJIAN_AGENT_CONTROL_URL` 和至少 32 字符的 `YUJIAN_AGENT_CONTROL_CREDENTIAL`；credential
只通过 Compose 环境注入，不写入仓库。当前 reference runner 串行处理 dispatch，避免单卡
5090 被多个任务无界占用；并发扩展必须先增加显存/队列预算合同。
要真正领取 dispatch，还需设置 `YUJIAN_AGENT_HANDLER_MODULE` 指向镜像内的部署侧 ESM
handler；未设置时 worker 只注册和 heartbeat。

## 单卡约束

Beelink 只有一块 RTX 5090。`agent-gpu` profile 是唯一允许申请 GPU 的运行单元；启用前必须
确认 `nvidia-smi --query-gpu=name --format=csv,noheader` 只返回一行且包含 `RTX 5090`，并且
NVIDIA Container Toolkit 能够把设备暴露给容器。RTC 双节点、PostgreSQL、Redis、TURN 和
平台 API 不得声明 GPU reservation。模型/Agent worker 需要在同一张卡上设置显存预算和并发
上限，禁止通过 compose 启动第二个 GPU worker。

建议启用顺序：

```bash
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
docker compose -f infra/agent/beelink/compose.yaml --profile agent-gpu config --quiet
docker compose -f infra/agent/beelink/compose.yaml --profile agent-gpu up -d
```

上述命令只作为 Beelink 开机后的运行验收步骤；Mac 工作区不执行。
