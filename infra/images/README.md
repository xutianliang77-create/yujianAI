# 语见AI 服务镜像

`Dockerfile.node-service` 是统一的 workspace 构建入口，使用仓库根目录作为 build context，先
编译合同和 adapter，再只把目标 service、workspace packages 和锁定依赖复制到运行镜像。它不
复制旧项目、secret、数据库、录音或缓存。

示例（仅供 Beelink 开机后的镜像构建阶段使用，当前不在 Mac 执行）：

```bash
docker build -f infra/images/Dockerfile.node-service \
  --build-arg SERVICE_PATH=services/platform-api \
  -t ghcr.io/xutianliang77-create/yujian-platform-api:0.1.0 .
```

可用 `SERVICE_PATH`：`services/platform-api`、`services/media-ops`、
`services/agent-control`、`services/agent-worker-node`。发布前必须再生成 SBOM、签名和 digest，
Helm values 不接受未经审计的浮动生产 tag。

Python Agent 可选镜像使用 `Dockerfile.python-agent`，只安装锁定的
`livekit-agents==1.6.5` 并复制 `services/agent-worker-python` 的 reference worker/RTC
adapter。该镜像用于 Beelink 唯一 GPU worker；构建、SBOM、签名和 digest 仍必须在 Beelink
开机后的发布阶段执行：

```bash
docker build -f infra/images/Dockerfile.python-agent \
  -t ghcr.io/xutianliang77-create/yujian-agent-worker-python:0.1.0 .
```
