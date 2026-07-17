# @yujian/platform-contracts

语见AI新平台的控制面合同。当前包含短期 LiveKit Room token、Tenant/Project/Environment、
Quota、Region、Usage、Audit 和 Outbox 的 v1 类型；运行时持久化由控制面 adapter 提供。

## 不变量

- Room token 只由服务端签发。
- `tenantId`、`projectId`、`environmentId`、`roomName` 和
  `participantIdentity` 必填。
- 平台资源 ID 只允许 3-64 位小写字母、数字和连字符，并以字母开头。
- TTL 限制为 60 至 300 秒。
- 默认允许发布、订阅和 Data，但调用方可以显式收紧。
- 未知字段被拒绝。
- metadata、attributes 和请求体均有硬上限。
- `yujian.*` attribute 是平台保留命名空间，调用方不得提供。

平台错误码、请求/幂等关联头名称在 `src/types.ts` 中导出；租户、配额、用量、审计和
outbox 类型在 `src/domain.ts` 中导出。它们只定义跨服务合同，不代表对应控制面存储和
API 已经实现。JSON Schema 位于 `schemas/v1/`，TypeScript 解析器位于 `src/`。历史
`@yujian/contracts` 不得被新平台代码引用。

`domain.ts` 是统一数据合同的唯一类型来源；`domain-validation.ts` 对控制面创建请求
执行未知字段和资源 ID 校验。类型/解析器的存在不代表 PostgreSQL、KMS 或账本已经在
生产环境启用，部署状态必须以对应服务与验收证据为准。
