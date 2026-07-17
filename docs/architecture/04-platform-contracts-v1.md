# 平台合同 v1

版本：v1.0-draft  
日期：2026-07-17  
状态：部分实现；2026-07-17 新增变更待 Beelink 验证

## 1. 合同范围

平台合同分成三层：

1. LiveKit 兼容合同：Token、Room、Participant、Track、Data、Webhook 和 Server API。
2. 语见控制面合同：tenant、project、environment、key、quota、billing 和 deployment。
3. 语见可靠事件合同：跨服务业务事件、审计、用量和部署状态。

当前仓库中的 `@yujian/contracts` 是产品转向前的历史原型，不属于本合同实现。

## 2. 兼容性规则

- 不修改目标 LiveKit 版本中字段的类型、必填性和语义。
- 不重用上游 event name 表达语见专有事件。
- 上游新增字段按 protobuf/JSON 的兼容规则处理。
- 语见客户端扩展不能成为加入普通 Room 的前置条件。
- 每次上游升级生成兼容性报告和差异清单。

目标版本必须在 M0 冻结，文档不得长期使用“最新版本”作为实现依赖。

## 3. 公共标识

```text
tenantId
projectId
environmentId
apiKeyId
roomName
roomSid
participantIdentity
participantSid
trackSid
agentDeploymentId
agentDispatchId
sipTrunkId
sipCallId
ingressId
egressId
usageRecordId
auditEventId
```

规范：

- 语见生成的 ID 使用 UUIDv7 或 ULID，具体格式在实现前冻结。
- LiveKit SID 和 identity 原样保存，不转换为语见 UUID。
- URL 中使用 ID；展示名和 slug 不承担授权。
- 外部 provider ID 只能作为映射字段。

## 4. 控制面 API 信封

成功响应：

```json
{
  "apiVersion": "platform.yujian.ai/v1",
  "requestId": "req_...",
  "payload": {}
}
```

错误响应：

```json
{
  "apiVersion": "platform.yujian.ai/v1",
  "requestId": "req_...",
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "human readable summary",
    "retryable": false,
    "details": [
      { "field": "metric", "reason": "concurrent_rooms" }
    ]
  }
}
```

规则：

- `message` 不能作为程序判断依据。
- `details` 是可选数组；每项只包含稳定字段名和可操作原因，不返回 secret、token、内部堆栈和 SQL。
- 有资源副作用的写操作支持 `Idempotency-Key` 或资源版本条件；无副作用的票据操作按各自合同说明。
- 分页使用不透明 cursor，不暴露数据库 offset 作为长期合同。
- 时间统一为 RFC 3339 UTC；计费用量使用明确窗口。

## 5. 首版控制面 API

### 5.1 Tenant 与成员

- `POST /platform/v1/tenants`
- `GET /platform/v1/tenants/{tenantId}`
- `POST /platform/v1/tenants/{tenantId}/members`
- `PATCH /platform/v1/tenants/{tenantId}/members/{memberId}`

### 5.2 Project 与 Environment

- `POST /platform/v1/tenants/{tenantId}/projects`
- `GET /platform/v1/projects/{projectId}`
- `POST /platform/v1/projects/{projectId}/environments`
- `PATCH /platform/v1/environments/{environmentId}`

### 5.3 API key 与 Token policy

- `POST /platform/v1/environments/{environmentId}/api-keys`
- `POST /platform/v1/api-keys/{apiKeyId}:rotate`
- `POST /platform/v1/api-keys/{apiKeyId}:revoke`
- `PUT /platform/v1/environments/{environmentId}/token-policy`

Room token 仍遵循 LiveKit JWT grant；平台 API 只管理签发策略和 server-side credential。
当前 M1 credential 必须且只能绑定一个 `tenantId / projectId / environmentId`。请求体
携带同一作用域，任一字段不匹配返回 `AUTHORIZATION_FAILED`；每个资源 ID 采用 3-64
位小写字母、数字或连字符并以字母开头。当前实现已加入 API key 创建（secret 只返回一次）、
hash 校验、轮换和撤销；KMS envelope、双 key grace period、SSO/细粒度 RBAC 和持久化仍
待生产 adapter。

`POST /platform/v1/rtc/token` 的成功 `data` 至少包含 `url`、`token` 和 `expiresAt`，并可
包含语见路由字段 `nodeId`。`nodeId` 只表示本次选中的 RTC 入口，不写入 LiveKit JWT
claim；客户端应使用响应中的 `url`，不自行拼接节点地址。

当前代码切片已实现 Tenant/Project/Environment、API key、成员、Quota/Usage/Audit、
endpoint discovery、Room/Participant adapter 和 RTC telemetry 的内存 adapter，并提供
Agent 与 SIP/Ingress/Egress 状态机骨架；它们全部等待 Beelink 运行验证，且不能替代生产
PostgreSQL/KMS/Redis、provider、webhook 和合规实现。

生产 platform-api 通过 `YUJIAN_PLATFORM_RUNTIME_MODULE` 加载部署方维护的 ESM runtime
module；该模块注入 `PostgresPlatformPersistence`、Redis/KMS、billing 和 data-rights adapter，
凭据只通过部署 Secret/环境变量进入模块，不进入合同包或客户端。未设置模块时的内存 adapter
仅用于开发和合同检查；`NODE_ENV=production` 启动时会拒绝缺少 persistence、分布式
rate limiter、实时 `resourceUsage` provider 或分布式 `tokenQuota` provider 的 runtime module。

### 5.4 Quota、Usage 与 Billing

- `GET /platform/v1/environments/{environmentId}/quotas`
- `GET /platform/v1/environments/{environmentId}/usage`
- `GET /platform/v1/tenants/{tenantId}/billing-statements`
- `POST /platform/v1/tenants/{tenantId}/quota-change-requests`

### 5.5 Agent Deployment

- `POST /platform/v1/environments/{environmentId}/agent-artifacts`
- `POST /platform/v1/environments/{environmentId}/agent-deployments`
- `POST /platform/v1/agent-deployments/{id}:rollout`
- `POST /platform/v1/agent-deployments/{id}:rollback`
- `GET /platform/v1/agent-deployments/{id}/traces`

## 6. 可靠事件信封

```json
{
  "schemaVersion": "1.0",
  "eventId": "evt_...",
  "eventType": "yujian.agent.deployment_ready.v1",
  "occurredAt": "2026-07-17T00:00:00Z",
  "producer": "agent-control-plane",
  "tenantId": "ten_...",
  "projectId": "prj_...",
  "environmentId": "env_...",
  "resource": {
    "type": "agentDeployment",
    "id": "agd_..."
  },
  "dedupeKey": "agentDeployment:agd_...:generation:12",
  "traceId": "trace_...",
  "data": {}
}
```

不变量：

- `eventId` 全局唯一。
- consumer 按 `eventId` 或 `dedupeKey` 幂等。
- `payload` 由 `eventType` 对应的 JSON Schema 或 protobuf 定义。
- 事件写入与业务事务采用 outbox 或等价原子机制。
- Webhook 是事件投递方式之一，不是唯一存储。

## 7. 事件分类

### 7.1 平台可靠事件

- `yujian.tenant.status_changed.v1`
- `yujian.project.quota_exceeded.v1`
- `yujian.api_key.rotated.v1`
- `yujian.agent.deployment_ready.v1`
- `yujian.agent.deployment_failed.v1`
- `yujian.billing.usage_finalized.v1`
- `yujian.private_deployment.health_changed.v1`

### 7.2 上游兼容事件

Room、participant、track、egress、ingress、SIP 和 agent dispatch 事件尽量保持目标
LiveKit Webhook/Server API 语义。进入语见事件总线时可以包裹 transport metadata，
但不能重写原始事件含义。

### 7.3 非账本瞬时数据

以下数据默认不进入可靠业务事件或计费账本：

- 音频波形和逐帧音量。
- 高频网络统计。
- 不要求离线补齐的 Data Packet。
- UI 光标、typing、实时状态提示。
- 模型 streaming token 或中间音频 chunk。

需要分析时写入受限的遥测管道，并按窗口聚合。

## 8. Token 合同

- 使用目标 LiveKit 版本兼容的 JWT。
- token 默认 TTL 5 分钟以内，超长 Room 使用 reconnect/reissue 策略。
- grant 按加入、发布、订阅、Room admin、SIP 和 Agent 等职责拆分。
- identity 由客户后端确认，平台不信任客户端自报管理员角色。
- token 不包含 secret、手机号、身份证号或用户正文。
- 企业可配置 allowed region、Room 前缀和 metadata 上限。
- 平台把已验证作用域注入 JWT attributes：`yujian.tenant_id`、
  `yujian.project_id`、`yujian.environment_id`。
- `yujian.*` 是保留 attribute 命名空间，调用方不能覆盖。

## 9. 幂等与并发

| 操作 | 幂等键/并发控制 |
| --- | --- |
| 创建 tenant/project/environment | `Idempotency-Key` |
| 创建 API key | `Idempotency-Key`，重复请求不重复暴露 secret |
| Agent rollout | deployment generation + compare-and-set |
| Egress/Ingress 创建 | client request ID 到上游任务 ID 映射 |
| SIP 外呼 | 客户 request ID + 目的号码 hash + 时间窗 |
| 用量入账 | source + resource + metric + window 唯一键 |
| 配额修改 | resource version / ETag |

Room token 签发是无持久化副作用的票据操作，不使用 `Idempotency-Key`：同一请求的重放
可以返回不同 JWT，客户端应以 `expiresAt` 和自身请求生命周期管理票据。`X-Request-ID`
只用于关联日志和错误响应，不提供幂等语义。其余有资源副作用的写操作必须拒绝缺失或
重复的 `Idempotency-Key`，并在同一作用域返回原始结果。

## 10. 错误码

首版稳定错误族：

- `AUTHENTICATION_FAILED`
- `AUTHORIZATION_FAILED`
- `PERMISSION_DENIED`
- `RESOURCE_NOT_FOUND`
- `RESOURCE_CONFLICT`
- `VALIDATION_FAILED`
- `PAYLOAD_TOO_LARGE`
- `METHOD_NOT_ALLOWED`
- `RATE_LIMITED`
- `QUOTA_EXCEEDED`
- `REGION_UNAVAILABLE`
- `UPSTREAM_UNAVAILABLE`
- `PROVIDER_UNAVAILABLE`
- `COMPLIANCE_RESTRICTED`
- `OPERATION_TIMEOUT`
- `INTERNAL_ERROR`

LiveKit 兼容接口保持其既有 gRPC/Twirp/HTTP 错误行为，语见控制面错误码不得覆盖它。

控制面 HTTP 状态映射固定如下；同一错误码不得因资源类型改变语义：

| HTTP | 错误码 |
| ---: | --- |
| 400 | `VALIDATION_FAILED` |
| 401 | `AUTHENTICATION_FAILED` |
| 403 | `AUTHORIZATION_FAILED` 或 `PERMISSION_DENIED` |
| 404 | `RESOURCE_NOT_FOUND` |
| 405 | `METHOD_NOT_ALLOWED` |
| 409 | `RESOURCE_CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 429 | `RATE_LIMITED` 或 `QUOTA_EXCEEDED` |
| 502 | `UPSTREAM_UNAVAILABLE` 或 `PROVIDER_UNAVAILABLE` |
| 451 | `COMPLIANCE_RESTRICTED` |
| 503 | `REGION_UNAVAILABLE` |
| 504 | `OPERATION_TIMEOUT` |
| 500 | `INTERNAL_ERROR` |

## 11. 合同演进

- 兼容字段只追加，不重命名或改变语义。
- 删除字段至少经过一个 stable deprecation 周期。
- 破坏性变更创建 `/v2` 或新 event type。
- 每个 SDK 固定支持矩阵和最低版本。
- schema、示例、生成代码和合同测试在同一个变更中提交。

## 12. 合同验收

- 官方 LiveKit SDK 跨语言加入/发布/订阅。
- Server SDK 创建、列举、更新和关闭 Room。
- Token grant 正反例。
- Webhook/event replay 与幂等。
- 未知字段、版本升级和旧 SDK 回归。
- 语见专有功能关闭后基础 RTC 仍可用。
