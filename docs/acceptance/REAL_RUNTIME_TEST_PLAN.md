# 语见AI真实运行测试方案

版本：v1.0  
适用环境：Beelink `beelink@100.110.127.117`，Linux x86_64，唯一 NVIDIA RTX 5090  
原则：Beelink 只运行服务器端、Docker、LiveKit/RTC、Node 集成测试和 GPU 预检；本机和手机作为客户端运行 Web/Flutter 客户端验证。

## 1. 测试分层

| 层级 | 目标 | 当前入口 | 通过证据 |
| --- | --- | --- | --- |
| A | 环境、依赖、合同和源码门禁 | `npm run beelink:preflight`、`npm run check` | 预检和工作区检查成功 |
| B | 双 LiveKit 节点实时兼容 | `npm run test:integration:rtc` | 双节点 ready、Room/Data/RPC/Node PCM 音频通过 |
| C | 本机 Web/Flutter Web 音频 Track | 本机 `npm run client:acceptance` | Web、Flutter Web `TrackSubscribed` 且 RTP bytes > 0 |
| D | RTX 5090 Agent 生命周期 | `infra/agent/beelink/compose.yaml` + Agent Control API | 容器只获得 1 张 RTX 5090，register→claim→handler→complete 闭环 |
| E | 生产持久化与媒体留存 | PostgreSQL/Redis/KMS/runtime module | 重启恢复、CAS、到期删除和 deletion evidence |

A-C 是当前可直接执行的基线；D-E 需要部署侧 runtime module、Agent handler、对象存储和短期测试凭据，不能只用健康检查代替。手机原生 Android/iOS target 尚未纳入当前仓库，不能把 Flutter Web 浏览器结果宣称为原生手机通过。

## 2. 开始前固定版本和凭据

测试必须记录以下信息：

- Git commit；如果工作区有未提交改动，先将当前工作区以受控方式同步到 Beelink，并保存 `git diff --binary`，不能混用 GitHub 旧版本。
- `node --version`、Flutter/Dart 版本、Docker/Compose 版本、Chrome 版本。
- LiveKit 镜像 digest、Redis 镜像 digest、`nvidia-smi` 输出。
- 测试只使用合成 tenant/room/participant 和短期凭据，不使用真实号码、录音或用户正文。

在 Beelink 外部安全目录准备环境文件，例如 `~/.config/yujian/acceptance.env`，权限设为 `600`，内容格式：

```dotenv
YUJIAN_RTC_NODE_IP=100.110.127.117
LIVEKIT_API_KEY=<8-64 位 URL-safe 测试 key>
LIVEKIT_API_SECRET=<32-128 位 URL-safe 测试 secret>
YUJIAN_PLATFORM_TEST_CREDENTIAL=<32-128 位 URL-safe 测试 credential>
```

不要把该文件复制到仓库或写入测试报告。

## 3. 基线自动验收（A-C）

```bash
ssh beelink@100.110.127.117
cd /home/beelink/yujianAI
export PATH=/home/beelink/.local/node-v24.18.0-linux-x64/bin:$PATH

git rev-parse HEAD
git status --short
set -a
source ~/.config/yujian/acceptance.env
set +a

npm run beelink:preflight
YUJIAN_KEEP_RTC_UP=true npm run beelink:acceptance
```

如果 Beelink 上已有其他 LiveKit 服务占用默认端口，可为本次合成验收改用空闲主机端口；容器内端口仍保持 7880/7980：

```bash
export YUJIAN_RTC_PRIMARY_PORT=17880
export YUJIAN_RTC_SECONDARY_PORT=17980
export YUJIAN_RTC_PRIMARY_TCP_PORT=17881
export YUJIAN_RTC_PRIMARY_UDP_PORT=17882
export YUJIAN_RTC_SECONDARY_TCP_PORT=17981
export YUJIAN_RTC_SECONDARY_UDP_PORT=17982
YUJIAN_KEEP_RTC_UP=true npm run beelink:acceptance
```

Beelink 服务器阶段的实际顺序是：

1. Linux/AMD64、Tailscale 地址、Docker、Node 24、唯一 RTX 5090 预检。
2. `npm ci`、上游联网 manifest 校验、clean mirror 同步和全部 workspace check。
3. 双 LiveKit 节点和共享 Redis 启动，并等待健康状态。
4. Node 集成测试：Room 创建/查询、平台 token、primary/secondary 入房、跨节点 participant、可靠 Data、RPC、PCM 音频 Track 和 RMS。
5. 写入 `outputs/beelink/<run-id>/acceptance.log`、`rtc.log` 和 `summary.txt`；设置 `YUJIAN_KEEP_RTC_UP=true` 时保留 RTC 容器供客户端连接。

随后在本机执行客户端阶段：

```bash
cd /Users/xutianliang/Downloads/语见AI
export YUJIAN_RTC_PRIMARY_URL=ws://100.110.127.117:${YUJIAN_RTC_PRIMARY_PORT:-7880}
export YUJIAN_RTC_SECONDARY_URL=ws://100.110.127.117:${YUJIAN_RTC_SECONDARY_PORT:-7980}
export LIVEKIT_API_KEY=<与 Beelink 阶段相同的短期 key>
export LIVEKIT_API_SECRET=<与 Beelink 阶段相同的短期 secret>
npm run client:preflight
npm run client:acceptance
```

该阶段在本机执行 Flutter pub/analyze/test/Web 构建、Web harness 和真实 Chrome Web/Flutter Web 入房；客户端报告写入 `outputs/client/<run-id>/`。手机可将 harness 绑定到本机局域网地址（`YUJIAN_WEB_COMPAT_HOST=0.0.0.0`）后，用手机浏览器访问 `http://<本机局域网IP>:4173/flutter/` 做补充手测；这不等同于原生 Android/iOS target 验收。

### A-C 通过条件

- `/readyz` 同时报告 `primary`、`secondary` healthy。
- 两个入口能进入同一个 Room，且 `nodeId` 按配置返回。
- Node 音频的 `source=microphone`、publisher identity 正确，远端 RMS 大于 1000。
- 本机 Web 和 Flutter Web 收到 `TrackSubscribed`，远端音频 `bytesReceived > 0`。
- Data/RPC、token claim、tenant/project/environment attributes 全部匹配。
- 任何凭据、JWT、真实媒体正文不出现在日志和报告中。

## 4. 失败时的分阶段诊断命令

如果一键验收失败，先不要重复运行全套。使用与验收相同的 Compose 文件：

```bash
compose=(docker compose \
  -f infra/livekit/local/compose.yaml \
  -f infra/livekit/beelink/compose.override.yaml)

"${compose[@]}" config --quiet
"${compose[@]}" ps
primary_port="${YUJIAN_RTC_PRIMARY_PORT:-7880}"
secondary_port="${YUJIAN_RTC_SECONDARY_PORT:-7980}"
curl --fail --silent "http://127.0.0.1:${primary_port}/"
curl --fail --silent "http://127.0.0.1:${secondary_port}/"
"${compose[@]}" logs --no-color --tail=300 yujian-rtc-a yujian-rtc-b redis
```

只重跑 Node/双节点音频：

```bash
export YUJIAN_RTC_PRIMARY_URL="ws://${YUJIAN_RTC_NODE_IP}:${YUJIAN_RTC_PRIMARY_PORT:-7880}"
export YUJIAN_RTC_SECONDARY_URL="ws://${YUJIAN_RTC_NODE_IP}:${YUJIAN_RTC_SECONDARY_PORT:-7980}"
npm run test:integration:rtc
```

只重跑 Web/Flutter Web：

```bash
npm run build:compat:web
( YUJIAN_RTC_PRIMARY_URL="$YUJIAN_RTC_PRIMARY_URL" \
  YUJIAN_RTC_SECONDARY_URL="$YUJIAN_RTC_SECONDARY_URL" \
  YUJIAN_RTC_API_KEY="$LIVEKIT_API_KEY" \
  YUJIAN_RTC_API_SECRET="$LIVEKIT_API_SECRET" \
  node tools/compatibility/serve-web-harness.mjs ) \
  >outputs/beelink/web-harness.log 2>&1 &
harness_pid=$!
trap 'kill "$harness_pid" 2>/dev/null || true' EXIT
until curl --fail --silent http://127.0.0.1:4173/healthz >/dev/null; do sleep 1; done
YUJIAN_WEB_COMPAT_URL=http://127.0.0.1:4173 node tools/compatibility/run-browser-acceptance.mjs
```

该浏览器阶段是真实 Chrome/WebRTC 执行，但媒体输入是 fake device；若要证明真实麦克风/扬声器，还需在另一台带权限的 Chrome 或 Flutter 真机上重复同一 Room 用例并保存设备、权限和网络信息。

## 5. 双节点故障与就绪 Gate

基线通过后，在独立报告中做故障实验，不把故障期间的 `ready` 误判为 HA 通过：

```bash
"${compose[@]}" stop yujian-rtc-b
# 通过正在运行的平台 API 查询 /readyz；预期 HTTP 503，且 secondary healthy=false
curl -i "http://127.0.0.1:${PLATFORM_API_PORT:-8090}/readyz"
"${compose[@]}" start yujian-rtc-b
until curl --fail --silent http://127.0.0.1:7980/ >/dev/null; do sleep 1; done
```

记录：故障发生时间、恢复时间、两个节点状态、已有 Room/participant 行为和是否发生数据丢失。当前实现只承诺全节点就绪门禁，不承诺已有 Room 的无缝迁移；这项结果必须单独归档。

## 6. RTX 5090 Agent Gate（D）

RTC 不得申请 GPU。先验证主机和 NVIDIA Container Toolkit：

```bash
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
docker info
docker compose -f infra/agent/beelink/compose.yaml --profile agent-gpu config --quiet
```

然后注入部署侧 `YUJIAN_AGENT_ENVIRONMENT_ID`、`YUJIAN_AGENT_CONTROL_URL`、worker credential 和已经审计的 `YUJIAN_AGENT_HANDLER_MODULE`，启动唯一 GPU worker：

```bash
docker compose -f infra/agent/beelink/compose.yaml --profile agent-gpu up -d
docker compose -f infra/agent/beelink/compose.yaml --profile agent-gpu ps
worker_id="$(docker compose -f infra/agent/beelink/compose.yaml --profile agent-gpu ps -q yujian-agent-worker)"
test -n "$worker_id"
docker inspect "$worker_id" --format '{{json .HostConfig.DeviceRequests}}'
```

用 Agent Control admin credential 依次执行：

1. 注册带真实 `sha256:<64 位 hex>`、签名引用和 SBOM 引用的 artifact。
2. 创建 `desiredReplicas=1` deployment，并 reconcile observed replica。
3. 创建一个 30 秒后过期的 synthetic dispatch。
4. 观察 worker register、heartbeat、claim、handler 执行、complete/fail 和 drain。
5. 取消一个运行中的 dispatch，确认 handler 收到 `AbortSignal`，且没有孤儿任务。
6. 在 worker 容器内确认只能看到 GPU 0，宿主机仍只有一张 RTX 5090；不得启动第二个 GPU worker。

只有完成真实 handler 和 Agent Control runtime verifier 后，D 才能通过。仅有 `nvidia-smi` 或容器启动成功只能算硬件预检。

## 7. 持久化与媒体留存 Gate（E）

该阶段必须有部署侧 PostgreSQL、Redis、KMS、对象存储和 runtime module；不能用默认内存 adapter 冒充生产验收。

```bash
set -a
source ~/.config/yujian/persistence.env
set +a
npm run db:migrate
```

随后验证：

- platform-api、agent-control、media-ops 在 production 缺少各自 persistence/runtime module 时 fail-closed。
- 重启后 Tenant/Environment、幂等 key、usage/audit/outbox、Agent dispatch、媒体 Egress 状态可恢复。
- 两个 writer 同时保存 snapshot 时 stale writer 得到 CAS conflict，不覆盖新版本。
- Egress 到期后 retention worker 调用对象删除 adapter，写入 `deletedAt` 和 `deletionEvidenceUri`；删除失败不能标记完成，重复 worker 执行不产生第二次账本结果。
- webhook retry/DLQ、data-rights evidence、KMS secret resolver 均不把明文 secret 写入数据库或日志。

## 8. 报告和最终判定

每次运行至少保存：

- `acceptance.log`、`summary.txt`、Compose `config` 脱敏结果、RTC/Redis 日志。
- Git commit 或工作区 patch 摘要、镜像 digest、SDK/Chrome/Node/Flutter 版本。
- 双节点 readiness、音频 Track/RTP 统计、Data/RPC 结果、GPU 容器信息。
- 失败用例、复现命令、影响范围、临时豁免和下一步 owner。

判定规则：

- A-C 全部通过：可标记“Beelink 双节点服务器 + 客户端 Web/Flutter 基线通过”。
- D 通过：才可标记“单 RTX 5090 Agent runtime 通过”。
- E 通过：才可标记“生产持久化/媒体留存链路通过”。
- 任一阶段缺证据，只标记 `deferred` 或 `blocked`，不能汇总成 GA/生产通过。

清理：测试结束后执行 `docker compose ... down`，确认无遗留容器、临时 Room、短期 token 和测试文件。
