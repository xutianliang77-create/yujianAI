# 语见命名边界与双节点运行手册

更新时间：2026-07-17

本文把“自有代码使用 `yujian`，兼容边界保留 `LiveKit`”落成可执行规则，并记录
Beelink 双节点验收环境。它是架构与运维约束，不改变 LiveKit 上游源码、协议字段或
固定版本清单。

## 1. 命名边界

语见的产品、控制面和部署对象使用 `yujian` / `rtc` 命名：

| 范围 | 语见命名 | 说明 |
| --- | --- | --- |
| RTC 服务容器 | `yujian-rtc-a`、`yujian-rtc-b` | 双节点服务名；底层镜像仍是官方 LiveKit Server |
| 节点观测标识 | `YUJIAN_RTC_NODE_ID` | 语见编排和日志关联字段；不覆盖上游自动生成的 LiveKit node ID |
| 节点地址 | `YUJIAN_RTC_NODE_IP` | Beelink 对外 ICE candidate 使用的 Tailscale 地址 |
| 客户端入口 | `YUJIAN_RTC_PRIMARY_URL`、`YUJIAN_RTC_SECONDARY_URL` | 兼容测试和平台配置中的 WebSocket 入口 |
| 平台扩展 | `yujian.*` | metadata、attributes、事件和 RPC method 的保留命名空间 |
| npm scope / App 标识 | `@yujian/*`、`ai.yujian.*` | 语见自有包和客户端标识 |

兼容边界必须原样保留 `LiveKit`：

- `infra/upstream/livekit-versions.json`、`livekit-patch-queue.json` 和官方仓库地址。
- 官方 Docker 镜像 `livekit/livekit-server`、官方 npm/Dart 包、JWT grant、Room/Track/
  Data/RPC 字段和协议包名。
- `LIVEKIT_CONFIG`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET` 等由官方 Server 读取的
  配置，以及 `livekit-server-sdk`、`livekit-client`、`livekit_client` 的导入名。
- `@yujian/livekit-compat` 中的 LiveKit 类型名和适配器名称。它们表示兼容责任边界，
  不是语见产品品牌；如需更友好的自有 API，应新增 `YujianRtc*` 别名并保留旧导出。

禁止通过改镜像名、重写 JWT claim、替换协议 package 或 fork 媒体核心来实现品牌替换。
上游同步、许可证审计和兼容测试仍以 `infra/upstream/` 的冻结 manifest 为准。

## 2. Beelink 双节点拓扑

Beelink 是当前唯一服务器端和验收环境：Linux AMD64、Tailscale
`100.110.127.117`、一块 RTX 5090。两个节点使用官方固定 digest 的同一版本，挂载同一
Redis routing；RTC SFU 不使用 GPU，5090 留给后续 Agent/模型 runtime。

| 节点 | HTTP / WebSocket | ICE/TCP | ICE/UDP | `YUJIAN_RTC_NODE_ID` |
| --- | ---: | ---: | ---: | --- |
| A | 7880 | 7881 | 7882 | `yujian-rtc-a` |
| B | 7980 | 7981 | 7982 | `yujian-rtc-b` |

基础文件是 `infra/livekit/local/compose.yaml`；Beelink 通过
`infra/livekit/beelink/compose.override.yaml` 覆盖 AMD64 镜像 digest、节点 IP 和共享
API key。两个 Compose 文件都声明节点 ID 和 HTTP 健康检查，避免本地配置与 Beelink
配置发生隐式漂移。健康检查访问该节点根路径；只有上游节点状态已刷新时才会返回成功。

Redis 是两个节点的共享路由状态，不是客户端或控制面数据源。生产部署还需要独立的
TLS、TURN、Redis 凭据、容量限制和网络策略；本手册的 integration 配置不能直接作为
production 配置。

## 3. Beelink 启动与验收

Mac 工作区只编写代码和合同；按项目约束，Mac 不运行测试、构建、Docker、Flutter 或
浏览器验证。Beelink 开机后，在仓库根目录注入短期测试凭据，再执行唯一入口：

```bash
export YUJIAN_RTC_NODE_IP=100.110.127.117
export LIVEKIT_API_KEY=<random-url-safe-test-key>
export LIVEKIT_API_SECRET=<random-url-safe-test-secret-at-least-32-chars>
export YUJIAN_PLATFORM_TEST_CREDENTIAL=<random-url-safe-test-credential-at-least-32-chars>
npm run beelink:preflight
npm run beelink:acceptance
```

`beelink:preflight` 检查 Linux AMD64、Tailscale 地址、Docker、Node 24、Flutter、Chrome
和唯一 RTX 5090。`beelink:acceptance` 随后执行上游联网校验、合同/单元测试、双节点
Room/Participant/Data/RPC/音频 Track 测试以及真实 Chrome Web/Flutter Web 兼容测试。
报告写入被 Git 忽略的 `outputs/beelink/<run-id>/`；脚本退出时关闭测试节点。

在 Beelink 开机并完成该入口前，任何新改动均标记为“已实现、未验证”，不得把 Mac 历史
运行结果当作本轮验收证据。

## 4. 故障边界

- 节点健康检查失败：先检查容器日志、Redis health 和 `YUJIAN_RTC_NODE_IP`，再检查
 端口映射；不要修改官方镜像或 patch queue。
- 跨节点 Room 不可见：确认两个节点使用同一 Redis 地址和 API key，再检查路由状态。
- 音频/Web/Flutter 兼容失败：保留失败报告和版本信息，在 Beelink 重现；不得在 Mac
  临时替换 SDK 版本或通过改名规避失败。
- 当前 node pool 只做轮询选点和全节点就绪门禁，不承诺运行中节点故障的 Room 迁移或
  无缝 token failover；这项能力进入后续灾备 Gate。
- RTX 5090 可见性只证明硬件/驱动预检通过，不等于 Agent 模型计算验收通过；后者另建
  独立 CUDA/驱动/容器兼容矩阵。
