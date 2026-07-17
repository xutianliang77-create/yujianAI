# 技术设计

版本：v2.0  
日期：2026-07-17  
状态：实现基线（M1 A-C 运行通过；完整 Gate 1 未通过；D/E deferred）

## 1. 技术策略

首版采用“上游组件 + 模块化控制面 + 独立数据管道”，避免同时重写媒体核心和搭建
大量微服务。

建议逻辑组件：

- `platform-api`
- `identity-tenant`
- `credential-token`
- `region-quota`
- `agent-control`
- `telephony-media-control`
- `metering-billing`
- `webhook-audit`
- `provider-gateway`
- `console`

首期可以将前六个控制面模块部署为一个或两个进程，但代码和数据库边界必须清晰。

## 2. 技术栈候选

实现前需 ADR 确认：

| 层 | 候选 | 选择原则 |
| --- | --- | --- |
| 控制面服务 | Go 或 TypeScript/Node.js | 团队能力、上游 SDK、性能与长期维护 |
| 控制台 | TypeScript + React | 与 LiveKit 生态组件和 Web SDK 协作 |
| 数据库 | PostgreSQL | 强事务、JSONB、成熟运维 |
| 短期状态 | Redis | LiveKit 兼容和限流/lease |
| 分析仓 | ClickHouse | 高频质量与用量聚合 |
| 对象存储 | S3 兼容 | 国内云和私有部署可替换 |
| 事件 | PostgreSQL outbox + queue | 初期简单，规模后选 Kafka/Pulsar |
| 可观测 | OpenTelemetry + Prometheus | 开放标准和私有部署 |
| 部署 | Kubernetes + Helm/Operator | 托管与私有统一 |

## 3. API 与认证

### 3.1 外部入口

- 控制面：`https://api.<domain>/platform/v1/...`
- LiveKit：`wss://rtc.<region>.<domain>`
- Webhook：客户提供 HTTPS endpoint。
- SIP：独立域名/IP 和端口，不与控制面复用。

### 3.2 账号认证

- 控制台用户：OIDC session + MFA。
- 企业 SSO：OIDC/SAML，SCIM 后续。
- 服务端平台 API：scoped platform key 或 OAuth client credential。
- LiveKit Server API：环境 API key/secret，只在客户后端或语见 adapter。
- Room 客户端：短期 LiveKit JWT。

### 3.3 授权

授权输入：

- actor
- tenant/project/environment
- action
- resource
- role/policy
- risk context

数据库查询必须包含 tenant 条件；仅在 API 网关解析 tenant 不足以构成隔离。

## 4. 控制面表

首版核心表：

```text
tenants
tenant_members
projects
environments
api_keys
region_policies
quota_policies
plans
price_versions
agent_artifacts
agent_deployments
agent_rollouts
provider_bindings
sip_trunks
webhook_endpoints
audit_events
outbox_events
usage_records
billing_lines
```

共同字段：

- 主键
- tenant/project/environment 归属
- `created_at`, `updated_at`
- `version` 用于乐观锁
- `deleted_at` 或明确状态

敏感字段：

- secret 不与普通 metadata 同列明文保存。
- KMS ciphertext 包含 key version 和 encryption context。
- 号码、证件和商务信息按字段级加密。

## 5. 事务与 Outbox

控制面写入：

1. 验证授权和幂等键。
2. 在 PostgreSQL 事务中写业务表。
3. 同事务写 `outbox_events`。
4. 提交后异步发布。
5. consumer 幂等处理并记录 checkpoint。

当前代码边界：`PlatformStore` 仅用于合同开发和离线编排；生产接线使用
`services/platform-api/src/postgres-persistence.ts` 的 `PostgresPlatformPersistence`，通过
注入式 SQL pool 实现 PostgreSQL 事务、quota policy 查询、usage 幂等写入和 outbox
`SKIP LOCKED` 领取。这样不把 PostgreSQL 客户端绑定进合同包，也为私有化部署保留驱动替换
边界。Beelink 开机前不连接真实数据库、不运行迁移。

控制面资源恢复使用 `PlatformStoreSnapshot` 和 `PostgresPlatformStorePersistence`；生产 runtime
必须同时提供 `storePersistence`，API 在创建/更新/轮换/撤销和 token usage mutation 返回前保存
快照。快照不包含 API secret，只保存 hash 和必要的短期窗口状态。
snapshot writer 使用 PostgreSQL version CAS；发生多副本 stale writer 冲突时请求失败并需要重新
加载状态，禁止 last-write-wins 覆盖。

Agent Control 使用同一迁移入口但保持独立 adapter：`PostgresAgentControlPersistence` 将
artifact/deployment/rule/dispatch/worker 状态保存为单行 JSONB snapshot，服务启动先恢复，
成功 mutation 后保存；`NODE_ENV=production` 且未注入
`YUJIAN_AGENT_CONTROL_PERSISTENCE_MODULE` 或 `YUJIAN_AGENT_ARTIFACT_VERIFIER_MODULE` 时
fail-closed；后者由部署侧校验 OCI digest、签名引用和 SBOM URI。

`outbox_events` 关键字段：

- `event_id`
- `aggregate_type`, `aggregate_id`
- `event_type`, `schema_version`
- `tenant_id`
- `payload`
- `occurred_at`
- `published_at`
- `attempt_count`

## 6. LiveKit 兼容层

### 6.1 版本冻结

M0 输出一个 machine-readable manifest：

```yaml
livekit:
  server: <commit-or-tag>
  protocol: <commit-or-tag>
  sip: <commit-or-tag>
  ingress: <commit-or-tag>
  egress: <commit-or-tag>
  agents-python: <commit-or-tag>
  agents-node: <commit-or-tag>
sdks:
  js: <version>
  flutter: <version>
  ios: <version>
  android: <version>
  node-server: <version>
  python-server: <version>
```

### 6.2 Adapter

`livekit-admin-adapter` 封装：

- RoomService
- AgentDispatchService
- SIP
- Ingress
- Egress
- Webhook verification

它只做 credential、tenant mapping、quota 和错误映射，不重写上游对象。

### 6.3 Patch queue

每个上游 patch 维护：

- patch ID
- upstream base
- changed files
- reason
- compatibility impact
- tests
- upstream issue/PR
- removal condition

兼容性分支从干净 upstream tag 构建；语见 patch 自动重放，冲突不得在 CI 中静默解决。

## 7. Token Issuer

输入：

- authenticated customer backend
- environment
- participant identity
- Room name
- requested grant
- TTL
- metadata/attributes

校验：

- environment active
- key scope
- Room/identity pattern
- grant ceiling
- quota/region policy
- metadata size and sensitive patterns

输出：

- LiveKit-compatible JWT
- endpoint
- `nodeId`（语见控制面本次选定的 RTC 入口）
- expiresAt
- selectedRegion
- requestId

签发日志只记录 token hash、grant 摘要和有效期，不记录 token。

### 7.1 Yujian RTC node pool

控制面用固定的 `YujianRtcNodePool` 管理每个环境允许的 RTC 入口。节点配置包含
`id / wsUrl / apiKey / apiSecret`，节点 ID 使用语见命名；API key、JWT grant 和
WebSocket 协议仍使用官方 LiveKit 语义。

- token 签发采用轮询选点，响应带 `nodeId` 和对应 endpoint。
- `/readyz` 并行探测全部节点；M1 Beelink 验收要求两个节点都健康。
- 两个节点共享 Redis routing，Room 可由任一入口加入；SFU 不占用 RTX 5090。
- 当前切片不承诺运行中节点故障的 Room 迁移或无缝 token failover；节点故障时由
  区域路由和客户端重新取票策略处理，自动 failover 进入后续 Gate。
- `YUJIAN_RTC_*` 是语见控制面配置；`LIVEKIT_*` 仅作为官方 Server/兼容边界的
  兼容输入，不能改写上游协议或镜像名称。

## 8. Region Router

region score 示例：

```text
score =
  health_weight
  + capacity_weight
  + network_probe_weight
  + policy_preference
  - residency_violation_penalty
  - incident_penalty
```

强约束先于评分：

- environment 允许区域。
- 数据驻留。
- 产品能力可用性。
- 配额和容量。

客户端探测结果需要签名或限权，只作为建议，不让客户端选择未授权 endpoint。

## 9. RTC 遥测

### 9.1 采集

- LiveKit server metrics。
- 客户端 SDK stats opt-in。
- TURN metrics。
- Webhook lifecycle。
- synthetic probes。

### 9.2 标准化

统一维度：

- timestamp/window
- tenant/project/environment
- region
- roomSid/participantSid（分析仓受控字段）
- sdk/platform/version
- network/provider
- metric/value/unit

PII 与高基数标签不进入 Prometheus；详细诊断进入有权限和 TTL 的分析仓。

## 10. Agent Artifact 与 Deployment

### 10.1 构建

1. CI 生成 OCI image。
2. 生成 SBOM。
3. 扫描漏洞和 secret。
4. 签名 image digest。
5. 注册 AgentArtifact。

### 10.2 Deployment Controller

使用 desired/observed state：

- `generation`
- `desired_version`
- `observed_version`
- `desired_replicas`
- `ready_replicas`
- `conditions`

rollout：

1. validate artifact/provider/secret/quota。
2. 创建 canary worker。
3. 仅路由测试或小比例 dispatch。
4. 比较错误、延迟、成本和质量。
5. 扩大流量或自动回滚。

### 10.3 Worker 隔离

- 每 tenant 或 deployment 的 Kubernetes identity。
- CPU/memory/ephemeral storage limit。
- egress network policy。
- provider credential 仅挂载到需要的 deployment。
- 禁止 privileged、hostPath 和宿主网络，例外单独评审。

## 11. Provider Gateway 合同

请求公共字段：

- `requestId`
- `tenantId`, `environmentId`
- `capability`
- `providerBindingId`
- `deadline`
- `budget`
- `dataPolicy`

响应公共字段：

- `provider`
- `model`
- `region`
- `usage`
- `latency`
- `finishReason`
- `providerRequestId`

错误分类：

- auth
- quota
- rate_limit
- timeout
- unavailable
- invalid_input
- content_policy
- cancelled
- unknown

流式请求必须传播取消，防止 Room 已结束而 provider 继续计费。

## 12. SIP 技术设计

### 12.1 配置

SIP credential 存入 KMS，数据库保存：

- trunk metadata
- provider
- allowed source/destination
- rate/concurrency
- credential reference
- LiveKit trunk mapping

### 12.2 外呼幂等

唯一键：

```text
environmentId + clientRequestId
```

重复请求返回同一 `sipCallId` 和当前状态，不重复拨号。

### 12.3 状态机

```text
requested -> authorized -> dialing -> ringing -> active -> ended
      |           |           |          |
      +-----------+-----------+----------+-> failed/cancelled
```

状态更新来源包括控制面、LiveKit SIP 和 provider webhook；冲突按事件时间、状态优先级
和 provider sequence 解决。

## 13. Ingress/Egress 技术设计

- 控制面先创建业务 request 和幂等键。
- quota service 预留容量。
- adapter 创建上游任务并保存 ID。
- webhook/poll 更新状态。
- 完成后生成原子 usage。
- 失败释放预留，并保存错误分类。

对象存储路径：

```text
tenant/<tenantId>/project/<projectId>/environment/<environmentId>/
egress/<egressId>/<object>
```

路径不包含用户显示名、手机号或 Room metadata。

## 14. Metering

### 14.1 计量来源

| 资源 | 主来源 | 对账来源 |
| --- | --- | --- |
| Participant minute | RTC 服务端生命周期 | Room/participant 投影 |
| TURN traffic | TURN/server metrics | 网络账单 |
| Egress/Ingress | 上游任务状态 | 对象存储/任务日志 |
| SIP | LiveKit SIP + provider | provider 账单 |
| Agent compute | orchestrator | pod/runtime metrics |
| Model usage | provider adapter | provider 账单 |

### 14.2 计算

- 使用 UTC 固定窗口。
- 原始 usage record 不可变。
- 迟到事件在结算截止前重算。
- 结算后差异通过 adjustment 处理。
- 每个价格变更创建新的 `priceVersion`。

## 15. Webhook

- HMAC 签名和 timestamp。
- event ID 去重。
- endpoint 级 event filter。
- 指数退避和 jitter。
- 最大尝试次数后进入 dead letter。
- 用户可以按 event ID replay。
- secret 支持平滑轮换。

Webhook payload 遵循原始 LiveKit 事件或 `yujian.*` 事件合同，不能混成不稳定结构。

## 16. 缓存与一致性

- tenant/key/status 的安全敏感缓存 TTL 短，并支持主动失效。
- quota entitlement 使用带版本的签名快照。
- Room/participant 查询可直接上游或读短期投影，UI 明确数据新鲜度。
- billing 和 audit 不依赖 Redis。
- 发生控制面/RTC 网络分区时，优先保证已运行媒体，停止高风险新增操作。

## 17. 错误、重试与超时

| 调用 | 超时 | 重试 |
| --- | --- | --- |
| 控制面 DB | 秒级 | 仅安全的瞬态错误 |
| LiveKit admin | 短超时 | 幂等操作有限重试 |
| Agent dispatch | deadline | 按 request ID 去重 |
| Model streaming | 场景 deadline | 仅在未产生副作用时 |
| SIP 外呼 | provider deadline | 禁止无幂等重复拨号 |
| Webhook | endpoint timeout | 异步指数退避 |
| Egress/Ingress | 创建短超时、任务长运行 | 查询可重试，创建需幂等 |

## 18. 安全与隐私

- 日志字段 allowlist，默认丢弃 token、secret、SDP、正文和完整号码。
- 录制和 trace 正文使用独立权限与保留期。
- 支持 tenant 自带 KMS/对象存储的企业模式。
- 数据导出和删除任务使用异步 job、校验和及审计。
- Agent 工具输入按必要字段保存摘要，高风险动作保留授权证据。

## 19. 测试设计

### 合同

- LiveKit protobuf/API/JWT fixture。
- 语见 OpenAPI/JSON Schema。
- 事件 replay 和未知字段。

### 集成

- 控制面 -> token -> Room。
- Agent artifact -> deployment -> dispatch。
- SIP call -> Room -> usage。
- Egress -> object storage -> billing。

### 媒体

- 2/10/100 participant 代表性场景。
- 音频、视频、屏幕共享和 Data。
- 丢包、抖动、带宽限制、网络切换和 TURN。

### 可靠性

- 节点 crash、Redis failover、DB failover。
- region drain。
- worker/model/provider failure。
- webhook outage。
- duplicate/late usage event。

## 20. 待 ADR

1. 控制面主语言和框架。
2. 目标 LiveKit 版本组合。
3. 分析仓与消息系统。
4. UUIDv7 或 ULID。
5. 首批国内云和模型 provider。
6. 托管云首区和多运营商网络。
7. HarmonyOS/小程序支持策略。
8. 开源版、企业版和云版边界。
