# 源码复用与 LiveKit 采用基线（翻译方向历史归档）

> 已于 2026-07-17 被新的 LiveKit 上游复用与分叉策略取代。

版本：v1.0  
日期：2026-07-17  
状态：设计基线，尚未复制或开发

## 1. 决策

语见AI保持独立仓库，但允许从无界AI旧工程受控复制源码。复制不等于整库搬迁：

1. 永远不修改旧工程。
2. 每个迁移单元记录来源 commit、工作区补丁、文件清单、许可证、安全审计和验证。
3. 复制后的代码必须进入语见AI目录、命名空间、合同和测试体系，不得运行时引用旧目录。
4. LiveKit 优先采用官方发布包、官方镜像和稳定 API；只有确有上游缺口时才维护最小
   fork，不复制整个官方仓库进入业务源码。
5. 本阶段只形成设计和任务，不复制任何代码。

## 2. 旧源码快照

### 2.1 主源码

| 项目 | 结论 |
| --- | --- |
| 本地目录 | `/Users/xutianliang/Downloads/ai phone` |
| GitHub | 私有仓库 `xutianliang77-create/ai-phone` |
| 当前分支 | `codex/optimization-m2-flexible-subtitles` |
| 最终复核 HEAD | `8c2fad181c931b243a78f5782919495434240d95` |
| HEAD 时间 | 2026-07-17T04:56:53+08:00 |
| 工作区 | 最终复核时仅有 `outputs/` 未跟踪；输出物仍不得迁移 |
| LICENSE | 仓库未发现独立 LICENSE；本次用户授权允许内部迁移，外部分发前仍需确认权属 |

该工程包含 Flutter、API、Realtime Gateway、Translation Worker、PSTN Bridge、
模型服务、合同、LiveKit 自托管配置和大量测试，是主要源码参考。

本轮开始盘点时 HEAD 为
`41c5cf101a16fd1b829431496b884943ebda5d00`，且有大量未提交改动；研究期间源仓库
被外部活动推进到 `8c2fad181c931b243a78f5782919495434240d95`
（`feat: harden on-device speech and voice identity`）。语见AI未修改旧仓库。该变化
说明迁移不能依赖会话早期快照，`MIG-SRC-001` 必须在真正复制前重新冻结来源。

### 2.2 辅助工作区

`/Users/xutianliang/Downloads/翻译软件app` 没有发现 Git 元数据，且内容主要是精简
App/API、实验数据和输出物。它只作为辅助研究来源；没有建立文件级来源清单前，
不得从该目录迁移代码。

### 2.3 未提交改动处理

未来迁移前必须重新执行 `MIG-SRC-001`：

- 保存旧仓库 HEAD。
- 导出 `git diff --binary HEAD` 的 hash 和文件清单。
- 区分 committed、modified、untracked 三类来源。
- 用户明确选择“只迁移 HEAD”或“包含指定未提交文件”。
- 对每个选中文件建立目标路径和重写说明。

禁止把当前脏工作区无选择地复制为语见AI基线。

## 3. 永久排除项

以下内容无论用户是否允许源码复用都不得复制：

- `.env`、secret、API key、JWT、证书、签名文件和真实号码。
- `generated/`、release env、部署渲染结果和包含凭据的配置。
- 数据库、用户字幕、日志、诊断正文、录音、参考声音和 voice embedding。
- `node_modules`、`.venv`、Pods、Gradle、Flutter build、缓存和临时目录。
- 模型权重、下载数据、评测输入输出和设备采集音频。
- 旧 bundle ID、应用签名、域名、端口、账号和生产默认值。

旧工程本地忽略目录中已发现渲染后的 LiveKit 凭据。它们未进入语见AI；接入任何
旧环境前必须轮换凭据，不能将现有值视为可迁移配置。

## 4. 无界AI模块复用分类

| 来源模块 | 采用方式 | 说明 |
| --- | --- | --- |
| `packages/contracts` | 重写后迁移 | 保留事件、状态机和测试思路；统一为 `@yujian/contracts`、JSON Schema 和 `communicationSessionId` |
| `services/translation-worker/src/worker` | 选择性复制并适配 | 播放 generation、按 target leg 队列、回声过滤、turn buffer 和幂等测试价值高 |
| `services/realtime-gateway` | 拆分迁移 | ASR/MT/TTS Provider、segment、speaker、flush 可迁；会话真值、计费和 WebSocket 边界重写 |
| `services/api-server` | 领域逻辑参考，基础设施重写 | 账号、同意、历史、用量和路由可参考；SQLite/JSON、进程内 Map 和旧 session DTO 不直接迁入 |
| `apps/mobile/lib/src/features` | 按 feature 迁移 | 复用交互和测试；重新接语见AI设计系统、合同和 API |
| `apps/mobile/ios`、`android` | 禁止整目录复制 | 只允许逐文件迁移经审计的原生 ASR/VAD/音频 bridge；不得继承签名和 bundle 配置 |
| `services/model-services` | Provider 源码可迁，资产不可迁 | ASR/MT/TTS/Speaker 接口和测试可参考；模型、虚拟环境和缓存全部排除 |
| `services/pstn-bridge` | 备用 provider adapter | LiveKit SIP 为主路径；仅保留其他电话服务商接入和媒体协议抽象 |
| `infra/livekit-selfhost` | 只参考，不复制生成物 | 使用固定版本官方镜像重新生成配置，旧 secret 和 `latest` 镜像不得进入新仓库 |
| `scripts` | 单任务审计 | 验收脚本可重写；部署、真机和下载脚本不得批量复制 |
| `docs` | 迁移已验证结论 | 不继承旧项目状态、品牌、ID 和“已完成”结论 |

## 5. LiveKit 官方源码采用

研究快照日期为 2026-07-17。提交号用于设计追溯，不代表最终发布版本；实现时必须
固定发布 tag、包版本和容器 digest，并重新执行 SCA/SBOM。

| 仓库 | 研究快照 | 语见AI用途 | 采用方式 |
| --- | --- | --- | --- |
| [`livekit/livekit`](https://github.com/livekit/livekit) | `15a9542c9942`，候选 `v1.13.3` | SFU、Room、track、data、TURN、分布式路由 | 部署官方镜像，不复制源码 |
| [`livekit/node-sdks`](https://github.com/livekit/node-sdks) | `0dbe1c689c0b` | token、Room API、Dispatch、SIP、Webhook、Node RTC | npm 依赖；候选 server SDK `2.17.0`、RTC `0.13.31` |
| [`livekit/client-sdk-flutter`](https://github.com/livekit/client-sdk-flutter) | `051581bea2bc`，候选 `v2.8.1` | Flutter Room、音频轨、data、重连 | pub 依赖，不 fork |
| [`livekit/client-sdk-js`](https://github.com/livekit/client-sdk-js) | `f2d4f81ce570`，候选 `2.20.1` | Web Guest Room 与媒体 | npm 依赖 |
| [`livekit/components-js`](https://github.com/livekit/components-js) | `a93cfc939b1b` | Web Guest 可访问组件参考 | 组件依赖或设计参考 |
| [`livekit/agents-js`](https://github.com/livekit/agents-js) | `6300c1c92426`，核心包候选 `1.5.2` | 显式 dispatch、job isolation、prewarm、load、drain | Translation/Agent Runtime 外壳 |
| [`livekit/agents`](https://github.com/livekit/agents) | `9dc8f8613505`，候选 `1.6.5` | Python 特有工作流和 warm transfer 参考 | 默认不引入第二套业务实现 |
| [`livekit/sip`](https://github.com/livekit/sip) | `947bb9f92137` | SIP/RTP、DTMF、trunk、inbound/outbound | 部署官方 SIP 服务并固定 digest |
| [`livekit/protocol`](https://github.com/livekit/protocol) | `74296228107d`，候选 `1.50.0` | Room、SIP、Agent Dispatch、Webhook protobuf | 通过官方 SDK 间接使用 |
| [`livekit/egress`](https://github.com/livekit/egress) | `9f96039cd35a`，候选 `v1.13.0` | 经同意录音、音轨导出 | P2 可选独立服务 |
| [`livekit/ingress`](https://github.com/livekit/ingress) | `ed1173f2537f`，候选 `v1.5.0` | RTMP/WHIP 外部媒体输入 | P3 可选，不进入首版 |

这些仓库当前均声明 Apache-2.0。使用发布包或复制上游代码时必须保留 LICENSE、
NOTICE 和版权声明；修改 fork 时明确标记变更。

## 6. LiveKit 与业务边界

直接交给 LiveKit：

- Room、participant、track、WebRTC、TURN 和重连。
- SIP participant、trunk、dispatch rule、DTMF 和 transfer。
- Agent job dispatch、进程隔离、空闲进程、load 和 drain。
- 经授权的 Egress。

保留在语见AI：

- `communicationSessionId`、业务状态、授权、历史、审计和计费。
- turn、segment、revision、说话人证据、翻译方向和术语。
- 定向 TTS playback、generation、clear、抢话和降级。
- Agent task/run、工具风险、确认、接管和结构化结果。
- PostgreSQL inbox/outbox 和账本。

LiveKit 的 reliable data packet 是在线 best-effort：接收方断线时不会由服务器持久化
补发。因此 data channel 只做实时 UI 分发，不作为可靠业务账本。

## 7. 迁移工作流

每个源码迁移任务必须经历：

1. **Inventory**：确定源文件、commit/patch、依赖、许可证和敏感信息。
2. **Contract first**：先在语见AI冻结目标合同和负例测试。
3. **Sanitized copy**：只复制白名单文件，立即改包名、配置入口和 ID。
4. **Adaptation**：接入新 adapter，不直接访问旧数据库、服务或路径。
5. **Verification**：lint、单元、合同、集成、安全和性能测试。
6. **Evidence**：保存差异、测试输出、许可证和回滚说明。
7. **Cutover**：shadow/canary 后才成为主路径。

## 8. 禁止开始开发的当前门禁

在以下文档完成评审前，不执行源码复制或新服务实现：

- 功能详细设计。
- 技术架构。
- 技术设计。
- 开发任务与计划。
- 验收任务与计划。

## 9. 官方参考

- [LiveKit overview](https://docs.livekit.io/intro/overview/)
- [Rooms, participants, and tracks](https://docs.livekit.io/intro/basics/rooms-participants-tracks/)
- [Access tokens and grants](https://docs.livekit.io/frontends/reference/tokens-grants/)
- [Agent dispatch](https://docs.livekit.io/agents/server/agent-dispatch/)
- [Agent server lifecycle](https://docs.livekit.io/agents/server/lifecycle/)
- [Data packets](https://docs.livekit.io/transport/data/packets/)
- [Self-hosting](https://docs.livekit.io/transport/self-hosting/)
- [Outbound SIP calls](https://docs.livekit.io/telephony/making-calls/outbound-calls/)
- [Warm transfer](https://docs.livekit.io/telephony/features/transfers/warm/)
