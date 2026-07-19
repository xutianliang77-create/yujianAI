# 语见AI项目工程交接文档

版本：v1.0

日期：2026-07-19

适用仓库：`https://github.com/xutianliang77-create/yujianAI`

交接分支：`agent/initial-platform-runtime`

交接基线 commit：`db5d6831f70ea997a6c540790cbb21a1c4e84cda`

发布状态：`productionReleaseAuthorized=false`

## 1. 交接结论

语见AI的 M0–M7 代码、合同、部署骨架、证据格式和治理流程已经展开，其中 M0/M1 仍有明确
缺口和阻断。M1 A–C 存在历史真实运行基线，M2/P2-01–06 的指定技术范围存在 Beelink/Mac
验收证据；M3–M7 的新增范围仍是 `implemented-not-run`。完整 Gate 0–10、RC 和 GA 均未关闭。

接手团队的首要任务不是继续扩大功能，而是固定当前版本、恢复受支持工具链，执行当前源码
的静态与运行门禁，再按 Gate 顺序补齐真实证据。任何“代码已实现”“历史测试通过”都不能
直接写成当前版本生产可用。

## 2. 交接时工作区状态

### 2.1 Git 状态

交接文档编写前的基线：

```text
branch: agent/initial-platform-runtime
upstream: origin/agent/initial-platform-runtime
HEAD: db5d6831f70ea997a6c540790cbb21a1c4e84cda
subject: Complete M3-M7 platform development
```

本次交接新增/修改文档尚需单独提交。工作区另有两个与语见AI平台交付无关的未跟踪评测目录：

```text
omnilingual-asr-eval-20260719/
supertonic3-eval-20260719/
```

这两个目录不属于本次项目文档、构建或发布范围，不得顺手加入提交、删除、移动或覆盖。

### 2.2 后台与服务器状态

- 本次文档工作没有启动 Docker、LiveKit、数据库、浏览器、GPU 或后台任务。
- 本次没有探测、停止、重启或修改 Beelink 服务。
- `PROGRESS_LOG.md` 中记录的历史健康或通过结果不是当前在线状态证明。
- 任何服务器操作前都应重新确认 Tailscale、SSH、Docker、GPU、磁盘和现有容器。

## 3. 不可违反的工程边界

### 3.1 仓库独立性

- 本仓库是语见AI唯一代码工作区。
- 无界AI、翻译软件 app、ai phone 等旧项目只能只读审阅，不得修改。
- 不得通过相对路径、软链接、workspace dependency 或运行时 import 依赖旧项目。
- 如需复制旧代码，必须先建立迁移任务，记录来源 commit、白名单、License、安全审计、重写
  范围和验证证据。
- 不复制旧项目的 `.env`、数据库、模型、录音、缓存和构建目录。

### 3.2 产品边界

- 当前版本做中国本土化 LiveKit 兼容平台，不做翻译产品。
- 保持 Room、Participant、Track、Token grant、Server API 和主流 SDK 兼容。
- 语见扩展使用 `yujian.*` API、metadata 或事件命名空间。
- 不擅自 fork 或重写媒体核心；优先 adapter，必要 patch 必须最小化并可重放。

### 3.3 安全边界

- 不提交 secret、JWT、真实号码、录音、用户正文或生产数据。
- 客户端不持有 LiveKit API secret，不直连 PostgreSQL、Redis、OpenBao/KMS 或模型服务。
- SIP/Egress/高风险 Agent 工具和发布流程默认关闭，缺证据时 fail-closed。
- 生产数据真值在 PostgreSQL，Redis 是可重建热状态，OpenBao/KMS 管理 secret 与签名。

### 3.4 验收边界

- `done` 只说明实现存在，不说明 Gate 通过。
- `implemented-not-run` 不得在汇报中改写为“已完成验收”。
- 历史证据只对证据中的 commit、镜像、schema、环境和范围有效。
- Gate 必须由当前版本真实 evidence 和必要 Owner receipt 判定。
- 任一 Gate 缺失时不得创建虚假的 RC approve 或 GA approve。

## 4. 关键环境

### 4.1 本机开发环境

```text
repository: /Users/xutianliang/Downloads/语见AI
workspace: 语见AI.code-workspace
required Node: >=22 <25
recommended Node: 24 LTS
package manager: npm workspaces
```

本机承担代码、合同、Web/Flutter Web 和客户端验收。手机作为客户端，不把浏览器 Flutter Web
结果写成原生 iOS/Android 验收。

### 4.2 Beelink 集成服务器

```text
SSH: beelink@100.110.127.117
architecture: Linux x86_64
GPU: 1 x NVIDIA GeForce RTX 5090
large data root: /data/models/yujianAI
role: server-side integration and acceptance
```

使用要求：

- 不使用旧的 `ssh 5090` alias，先确认主机身份。
- 代码、数据库、镜像证据、备份和报告尽量放在 `/data/models/yujianAI`。
- P2 Compose project 固定为 `yujian-p2`，不得复用或修改其他项目容器。
- RTC SFU 不申请 GPU；唯一 RTX 5090 保留给 Agent/模型 runtime。
- Beelink 是 integration，不是 production；三 OpenBao 节点同机不代表跨主机 HA。
- 不停止、重启或重配无界AI及其他项目服务。

### 4.3 Beelink 重要路径

| 路径 | 用途 |
| --- | --- |
| `/data/models/yujianAI/p2` | PostgreSQL、Redis、OpenBao、报告与备份 |
| `/data/models/yujianAI/worktrees/p2-acceptance` | P2 clean acceptance worktree |
| `/data/models/yujianAI/evidence` | 供应链与运行证据根目录 |
| `/data/models/yujianAI/p2/reports` | P2 脱敏验收报告 |
| `/data/models/yujianAI/p2/backups` | P2 隔离恢复备份 |

不要在仓库中创建指向这些路径的软链接，也不要把运行数据提交 Git。

## 5. 仓库导航

### 5.1 首次接手必读

按顺序阅读：

1. 根目录 `README.md`：产品方向和当前总体状态。
2. 根目录 `PROGRESS_LOG.md` 最后一个 handoff：最新工作、边界和恢复顺序。
3. `docs/PROJECT_DETAILED_INTRODUCTION.md`：项目全貌。
4. `docs/planning/DEVELOPMENT_COMPLETION_AUDIT.md`：M0–M7 和 Gate 的真实状态。
5. `docs/acceptance/REAL_RUNTIME_TEST_PLAN.md`：本机、Beelink、手机的真实测试分层。
6. `docs/architecture/04-platform-contracts-v1.md`：跨模块数据合同。
7. `docs/design/02-technical-design.md`：API、存储、Token、dispatch 和状态机。
8. `docs/governance/OWNERS.md` 与 `docs/compliance/APPLICABILITY.md`：Owner 和合规阻断。

### 5.2 代码地图

| 模块 | 路径 | 交接重点 |
| --- | --- | --- |
| 平台合同 | `packages/platform-contracts` | 跨服务 DTO、状态、Schema；跨模块变更先改这里 |
| LiveKit 兼容层 | `packages/livekit-compat` | 官方 Server SDK、Token、Room/Media/Webhook adapter |
| 受限客户端 | `packages/restricted-client-adapter` | HarmonyOS/小程序短期 token 和 native bridge 门禁 |
| 控制面 | `services/platform-api` | IAM、Token、quota、Room、usage/audit/outbox、runtime 注入 |
| Agent 控制 | `services/agent-control` | artifact/deployment/dispatch/worker/tool 状态机 |
| Agent Worker | `services/agent-worker-node`、`services/agent-worker-python` | Room 生命周期、deadline、cancel、drain |
| Provider | `services/provider-runtime` | capability/region/streaming、deadline、circuit、failover |
| 媒体 | `services/media-ops` | SIP/Ingress/Egress、风险、合规、留存和 usage |
| 计费 | `services/billing` | finalized usage、价格、发票、对账和 adjustment |
| 数据权利 | `services/data-rights` | export/delete/rectify、lease 恢复和 evidence |
| 私有化 | `services/deployment-operator`、`infra/operator` | CRD、Operator、升级/回滚执行边界 |
| Owner 审批 | `services/owner-approval`、`apps/owner-approval` | 一次性个人签名和不可覆盖决定 |
| 部署 | `infra/helm/yujian-platform` | external-HA、TURN、RTC、Agent、Media、NetworkPolicy |
| 数据库 | `infra/database/migrations` | 当前 001–016，必须按顺序执行 |
| 工具 | `tools` | acceptance、release、supply-chain、database、ops、CLI |

## 6. 当前数据与 API 基线

### 6.1 数据库 migration

当前源码 migration 连续范围为 `001`–`016`：

| 范围 | 主要内容 |
| --- | --- |
| 001–002 | 平台基础表和领域扩展 |
| 003–004 | Agent Control、Media Ops |
| 005–008 | Outbox、平台快照、Webhook destination、RTC telemetry |
| 009–011 | P2 身份/RBAC、data-rights 恢复、outbox claim ownership |
| 012 | Preview entitlement、支持和运营状态 |
| 013–014 | Agent runtime、媒体用量/质量/对账和安全迁移 |
| 015 | 私有化部署、License、远程协助和客户验收 |
| 016 | GA 商业、发票、对账、SLO、RC/GA 决策 |

P2 历史运行验收执行的是当时的 `001`–`011`。接手后必须对当前 `001`–`016` 从空库迁移、
已有 011 升级、备份恢复和 forward-only rollback 边界重新验收。

### 6.2 API 合同

主要 OpenAPI：

- `docs/api/openapi.yaml`：平台控制面与媒体入口。
- `docs/api/owner-approval.openapi.yaml`：Owner 原始决定、supersession、一次性凭据和 receipt。

API 变更要求：

1. 先更新平台合同、JSON Schema 与 OpenAPI。
2. 增加无效输入、作用域、幂等冲突和失败关闭测试。
3. 再修改 route、domain、persistence 和 adapter。
4. 执行受影响 workspace 的 lint、单元、合同和集成测试。
5. 更新 Gate 证据和 `PROGRESS_LOG.md`。

### 6.3 幂等与并发规则

- 创建 Tenant/Project/Environment/Member/API key 等 mutation 使用作用域内 `Idempotency-Key`。
- 同 key 请求指纹变化必须返回 conflict，不能静默重放旧资源。
- 多副本 snapshot 使用 version CAS，stale writer 必须失败。
- 账单、媒体 usage、Owner receipt、RC/GA 决定和审计属于不可覆盖账本。
- Webhook/outbox 为 at-least-once；事件 ID 由接收方幂等去重。

## 7. 当前 Gate 状态

| Gate | 状态 | 已有范围 | 接手后必须补齐 |
| --- | --- | --- | --- |
| Gate 0 设计/上游 | `partial/blocked` | 章程、manifest、clean upstream、供应链候选、Owner 流程 | 当前发行镜像整改、法律结论、Owner 专业签字与批准 |
| Gate 1 LiveKit 兼容 | `partial` | A–C Node/Web/Flutter Web 音频历史基线 | 视频/屏幕、TURN/弱网/reconnect、Webhook、iOS/Android/Python |
| Gate 2 控制面 | `partial` | P2-01–06 指定技术验收 | 当前 001–016、跨主机 HA、auto-unseal、完整产品/身份矩阵 |
| Gate 3 Preview/容量 | `partial` | HA/TURN/capacity/质量/长稳代码合同 | Helm、真实 TURN、运营商矩阵、24/72h、故障与设计伙伴 |
| Gate 4 Agent | `implemented-not-run` | Artifact、rollout、quota、provider、tool、cancel | 5090、OCI/KMS、真实 provider、Room job、canary 与指标 |
| Gate 5 SIP/媒体 | `partial` | 状态机、adapter、合规、usage、留存代码 | 运营商/SBC、录音告知、对象删除、电话质量和真实账单 |
| Gate 6 计量/账单 | `implemented-not-run` | 事务计费、发票、对账、adjustment | migration 016、财务/对象存储、真实账单与签字 |
| Gate 7 安全 | `blocked` | SBOM/扫描/签名/重建候选和安全合同 | 当前版本全量扫描、渗透、两项 reject、法律待判项 |
| Gate 8 私有化 | `implemented-not-run` | Helm/Operator/离线包/License/adapter | 客户安装、升级、恢复、轮换、卸载和签字 |
| Gate 9 可靠性/灾备 | `implemented-not-run` | SLO、error budget、fault/load/DR 合同 | 实际长稳、容量、故障和 RPO/RTO |
| Gate 10 合规/发布 | `implemented-not-run` | applicability、LTS、status、RC/GA 账本 | 法律/资质、全部 Gate evidence、Owner receipt、冻结 |

禁止只更新 README 而不更新 Gate 审计和机器 JSON；同一状态必须同步到 README、设计索引、
计划、验收审计、兼容矩阵和对应 evidence JSON。

## 8. Owner 与发布治理

### 8.1 当前 Owner

| 角色 | 代号 | 当前重点 |
| --- | --- | --- |
| Security Owner | `aaa` | 漏洞、威胁、渗透、例外和安全审计 |
| Release Owner | `bbb` | Registry/KMS、镜像、回滚、RC/发布 |
| Legal Owner | `ccc` | LICENSE/NOTICE/source offer、分发和法律结论 |
| Compliance Owner | `ddd` | 中国分发、数据和行业适用性 |
| 任命批准人 | `eee` | 角色任命与职责确认 |

联系、备份和专业资格证据仍待补，代号本身不等于完成专业签字。

### 8.2 当前有效决定

- `bbb` Redis 候选：approve。
- `aaa` 安全整改：sequence 1 approve，保留原始 sequence 0。
- `bbb` Registry/KMS freeze：sequence 1 reject。
- `ccc` LICENSE/NOTICE/source offer：sequence 1 reject。
- `ddd` 中国分发：sequence 1 approve，保留原始 sequence 0。

用户说明部分 reject 是故意执行的负向功能测试，但明确要求“不追加、判定通过”不能替代
专业 Owner 的新签名批准。当前记录仍按不可变 receipt 的实际决定解释，Gate 不自动通过。

### 8.3 Superseding decision

如 Owner 要改变决定：

1. 固定新证据 artifact digest。
2. 读取当前 active receipt 和前序 hash。
3. 由同一 Owner 使用新的 5 分钟 wrapped token 提交 superseding decision。
4. 新决定必须绑定 `supersedesReceiptSha256` 和 `supersedesArtifactSha256`。
5. 服务端签名、验签、revoke-self，并追加 sequence，不修改旧文件。
6. acceptance adapter/verifier 重建当前 active state 和 hash chain。
7. 更新 Gate 审计，但仍检查其他 Owner 和技术前置条件。

## 9. 接手后的首个 30 分钟

先做只读核对，不启动服务：

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
git log -5 --oneline --decorate
git remote -v
node --version
npm --version
tail -n 100 PROGRESS_LOG.md
sed -n '1,240p' docs/planning/DEVELOPMENT_COMPLETION_AUDIT.md
```

核对结果应回答：

- 是否仍在正确仓库和分支。
- 是否存在用户的未提交修改或未跟踪目录。
- Node 是否为 22/24，而不是不支持的 25。
- 最新 handoff 是否仍声明测试暂停或有新的用户授权。
- Beelink 是否需要操作，是否会与其他项目发生冲突。
- 当前任务是开发、诊断、测试、部署还是发布，不能混用授权范围。

## 10. 开发工作流

### 10.1 推荐步骤

1. 读取相关合同、设计、Gate 和现有测试。
2. 用 `git status`、`rg` 和当前源码确认真实实现，不依赖旧总结猜测。
3. 先改合同和失败测试，再改 domain、persistence、adapter、route 或 UI。
4. 只修改任务需要的文件，不重构无关代码。
5. 执行受影响范围的 lint、unit、contract、integration。
6. 同步 OpenAPI、migration、Helm schema 和文档。
7. 生成脱敏证据，明确 commit、版本、环境、范围和未覆盖项。
8. 更新 `PROGRESS_LOG.md` 的 session handoff。

### 10.2 常用命令

这些命令只在用户恢复测试授权、Node 版本正确且工作区已核对后执行：

```bash
npm ci
npm run build
npm run lint
npm run test
npm run check
npm run openapi:verify
npm run release:preflight
```

数据库与私有化相关：

```bash
npm run db:migrate
npm run private:upgrade-preflight
npm run private:capacity-plan
npm run private:create-offline-bundle
npm run private:create-acceptance-report
```

不要为让门禁“变绿”而扩大 allowlist、删除证据、绕过 fail-closed 或修改历史 receipt。

## 11. 真实验收恢复顺序

### 11.1 Phase A：当前源码静态与本地门禁

成功条件：

- Node 22/24 下 workspace build/lint/unit/contract 全部通过。
- OpenAPI operationId、`$ref`、JSON/YAML、Helm schema 和脚本语法通过。
- 001–016 从空库迁移和 011→016 升级通过。
- release preflight 不把缺失 evidence 误报为通过。

失败时先定位根因，禁止通过跳过 workspace 或降低验证规则掩盖问题。

### 11.2 Phase B：M1 完整兼容

在 Beelink执行：

```bash
npm run beelink:preflight
YUJIAN_KEEP_RTC_UP=true npm run beelink:acceptance
```

在本机执行：

```bash
npm run client:preflight
npm run client:acceptance
```

随后单独补齐视频、屏幕共享、mute/unpublish、TURN UDP/TCP/TLS、netem、reconnect、Webhook、
Python、iOS 和 Android。Flutter Web 不能替代原生手机测试。

### 11.3 Phase C：M2 当前 schema 回归

P2 数据服务使用：

```bash
export YUJIAN_DATA_ROOT=/data/models/yujianAI
export YUJIAN_P2_ENV_FILE=/data/models/yujianAI/p2/runtime.env
./infra/p2/beelink/deploy.sh up
./infra/p2/beelink/deploy.sh migrate
./infra/p2/beelink/deploy.sh smoke
```

先检查现有容器与数据目录，不能直接覆盖或重建。当前新增 012–016 migration 需要单独的升级、
备份和隔离恢复演练。

### 11.4 Phase D：M3–M5

顺序为：

1. Helm external-HA、TURN、capacity、drain、公网入口和观测。
2. 九格运营商网络、24/72 小时、故障注入和设计伙伴。
3. 单 RTX 5090 Agent artifact→dispatch→Room→provider→cancel→complete。
4. SIP/Ingress/Egress provider、SBC、合规、对象存储、留存删除、质量和对账。

SIP 与 Egress 必须保持默认关闭，直到技术、运营商、法务与合规 Gate 全部满足。

### 11.5 Phase E：M6–M7

1. 私有化安装、external-HA、离线包、License、OIDC/SAML/SCIM。
2. 升级、恢复、回滚、KMS 轮换、远程协助和客户验收。
3. 真实账单、发票、Provider statement、reconciliation 和 finance approval。
4. 区域故障、SLO、on-call、压测、灾备、渗透和数据权利。
5. 当前版本 SBOM/签名/安全审计和全部 Owner receipt。
6. Gate 0–10 全部 passed 后生成 frozen RC，最后才进入 GA 决策。

## 12. 证据索引

### 12.1 核心审计

| 证据 | 路径 |
| --- | --- |
| 开发完成审计 | `docs/planning/DEVELOPMENT_COMPLETION_AUDIT.md` |
| 验收总计划 | `docs/acceptance/01-acceptance-tasks-and-plan.md` |
| 真实运行方案 | `docs/acceptance/REAL_RUNTIME_TEST_PLAN.md` |
| 兼容矩阵 | `docs/compatibility/MATRIX.md` |
| P2 技术证据 | `docs/acceptance/p2-production-evidence.json`、`p2-closure-evidence.json` |
| M3 实现证据 | `docs/acceptance/m3-*-implementation.json` |
| M4 实现证据 | `docs/acceptance/m4-agent-runtime-implementation.json` |
| M5 实现证据 | `docs/acceptance/m5-media-runtime-implementation.json` |
| M6 实现证据 | `docs/acceptance/m6-private-deployment-implementation.json` |
| M7 实现证据 | `docs/acceptance/m7-ga-implementation.json` |

### 12.2 供应链与 Owner

| 证据 | 路径 |
| --- | --- |
| clean upstream | `docs/acceptance/p1-upstream-evidence.json` |
| 当前镜像供应链 | `docs/acceptance/p1-supply-chain-evidence.json` |
| 候选与安全重建 | `p1-supply-chain-candidate-evidence.json`、`p1-remediated-candidate-evidence.json` |
| License 整改 | `docs/acceptance/p1-license-remediation-evidence.json` |
| 生产 OCI | `docs/acceptance/p1-production-oci-evidence.json` |
| Owner keys/receipt | `p1-owner-key-registry.json`、`p1-m0-04-owner-signoffs.json` |
| Registry/KMS | `p1-registry-kms-freeze-implementation.json`、`infra/registry/README.md` |

### 12.3 证据写入规则

- 原始证据写入 append-only、权限受控的 `/data` 路径。
- Git 只保存脱敏索引、合同、摘要和内容哈希，不保存 secret 或用户数据。
- JSON 必须包含 commit、artifact/image digest、运行环境、开始/结束时间、执行范围和判定。
- `partial`、`deferred`、`blocked` 不能被 verifier 自动升级为 `passed`。
- 失败证据不得删除；修复后追加新 run 并通过 supersession/关联字段指向旧 run。

## 13. 运维与故障处理

### 13.1 远程检查顺序

远程“在线”至少分为：

1. Tailscale 控制面可见。
2. Tailscale ping/TCP 可达。
3. SSH 认证成功。
4. 磁盘、Docker 和目标容器健康。
5. `nvidia-smi` 和 NVIDIA runtime 健康。
6. 应用 API、RTC、数据库和真实请求通过。

不能用旧的 `/healthz` 或历史 Tailscale 状态推断服务器当前健康。

### 13.2 故障时保护规则

- 先记录 `git status`、容器列表、端口、restart count、日志时间和数据目录。
- 不执行 `git reset --hard`、`git clean`、广泛 kill、全局 Docker prune 或删除 `/data`。
- 不重启其他项目容器来释放端口；改用语见独立端口和 Compose project。
- PostgreSQL/OpenBao 恢复必须在隔离实例验证后再讨论切换。
- Redis 可以重建，但必须先确认 PostgreSQL 或权威运行状态完整。
- GPU 故障先区分驱动/PCIe/供电/容器 runtime，不能仅重启应用掩盖硬件问题。

## 14. 已知风险和技术债

1. 设计、README 和进度日志信息量较大，后续应由机器 evidence 生成状态摘要，减少人工漂移。
2. 当前代码新增范围大而运行测试暂停，可能存在 TypeScript、OpenAPI、migration 和 Helm 集成错误。
3. P2 验收 schema 落后当前源码五个 migration，需要完整升级和恢复验证。
4. 单 Beelink 不能证明跨主机、跨 AZ、跨区域 HA。
5. iOS/Android 原生客户端 target 尚未形成完整仓库验收闭环。
6. RTX 5090 Agent、国内 Provider、SIP/运营商和对象存储仍缺真实端到端证据。
7. bbb/ccc 的当前 reject 和法律待判项阻断供应链、发布和 GA。
8. Owner 联系、备份和专业资格未补，职责连续性不足。
9. 当前运行镜像与安全重建候选之间尚未执行正式切换、回滚和再验收。
10. 商业计费、发票、渗透、等保/备案适用性和客户合同仍需专业团队参与。

## 15. 下一阶段任务建议

### P0：恢复当前版本质量基线

- 固定 Node 24 和依赖 lockfile。
- 运行 build/lint/unit/contract/OpenAPI/Helm/001–016 migration。
- 修复当前源码问题，生成新的 commit-bound 报告。
- 同步 README、设计索引、开发审计、兼容矩阵和机器 JSON。

### P1：关闭 Gate 0/1/7

- 执行当前候选镜像正式切换前演练、rollback 和当前版本安全复扫。
- 完成视频/屏幕、TURN/弱网/reconnect、Webhook、Python/iOS/Android。
- 关闭唯一法律待判项，补 Owner 联系/备份/专业资格。
- 由 bbb/ccc 在新证据上决定是否追加 superseding approval。

### P2：把历史 M2 验收到当前 schema

- 运行 011→016 升级、空库 001→016、备份恢复和 CAS/Outbox/Redis/KMS 回归。
- 补跨主机 PostgreSQL/Redis/OpenBao HA 与 auto-unseal 方案和演练。
- 验证新增 billing/private/GA 表不泄漏 secret 或破坏租户隔离。

### P3：依次关闭 M3–M7

- M3：TURN、容量、观测、运营商九格、24/72 小时和故障。
- M4：5090 Agent、Provider、Tool、cancel、canary/rollback。
- M5：SIP/媒体、对象存储、留存、质量、账务和合规。
- M6：私有化安装升级、离线、License、企业身份、客户报告。
- M7：账单、安全、灾备、RC freeze 和 GA Owner 决策。

## 16. 完成交接检查表

接手人确认以下项目后，才视为工程交接完成：

- [ ] 能解释产品目标、非目标和 LiveKit 兼容边界。
- [ ] 能找到 M0–M7 计划、Gate 审计和机器 evidence。
- [ ] 能区分 `implemented-not-run`、历史 baseline 和当前 Gate。
- [ ] 已确认 Git 分支、HEAD、用户脏改动和两个无关评测目录。
- [ ] 使用 Node 22/24，知道测试暂停与恢复授权边界。
- [ ] 能安全登录并识别 Beelink，知道 `/data/models/yujianAI` 布局。
- [ ] 不会修改旧项目或复用其他项目容器、secret 和数据。
- [ ] 理解 PostgreSQL/Redis/OpenBao 的真值与恢复边界。
- [ ] 理解 SIP/Egress/Tool/发布为什么默认 fail-closed。
- [ ] 理解 Owner receipt 和 superseding decision 不能覆盖历史。
- [ ] 能按 Phase A–E 执行验证并生成脱敏、commit-bound 证据。
- [ ] 知道 Gate 0–10 全部 passed 前不能创建 GA approve。

## 17. 下一次会话恢复清单

```bash
cd /Users/xutianliang/Downloads/语见AI
git status --short --branch
git log -1 --oneline --decorate
node --version
tail -n 120 PROGRESS_LOG.md
sed -n '1,260p' docs/PROJECT_HANDOVER.md
sed -n '1,240p' docs/planning/DEVELOPMENT_COMPLETION_AUDIT.md
```

在用户明确恢复测试授权前，不运行 `npm test/check/build`、migration、Docker、Helm、Kubernetes、
Beelink 或外部 Provider 命令。若授权恢复，先执行 Phase A，不直接跳到 SIP、GA 或生产切换。
