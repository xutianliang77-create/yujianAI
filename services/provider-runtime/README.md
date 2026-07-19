# `@yujian/provider-runtime`

提供 provider capability、deadline、熔断、failover 和 HTTP JSON adapter。

`ObservedProviderAdapter` 可包裹任意 `ProviderAdapter`，向部署侧 observer 发送租户/环境/
deployment/dispatch 引用、providerId、capability、success/failure/cancelled、duration、
traceId、数值 usage 和固定价格版本归因。错误只记录低基数 code；请求正文、模型参数、
provider 响应和凭据不进入 observation。`PostgresProviderInvocationObserver` 向
`013_agent_runtime.sql` 的 append-only 数值账目写入，`ProviderMetricsObserver` 只输出
provider/capability/outcome/currency 低基数 label。

`ProviderRegistry` 是 Agent runtime 的能力选择入口：按 capability、region 和 streaming 能力
过滤 `healthy/degraded` provider，跳过 disabled 或已打开的 circuit，并按注册顺序 failover。每个
provider binding 独立熔断；registry 只保存 capability metadata，不保存凭据或请求正文。具体国内
模型、语音和审核 provider 由部署侧注入 `ProviderAdapter`。

`HttpJsonProvider` 禁止 URL userinfo/query/fragment、非回环 HTTP、静态 Authorization/API-key
header 和无界响应。凭据必须由 `ProviderCredentialProvider` 逐请求返回短期 lease；
`HttpsProviderCredentialProvider` 使用显式投影的 workload identity token 向客户域凭据网关换取
header，token 和 header 均不进入 job/snapshot/SQL/log。`OpenAiCompatibleChatProvider`
提供版本化的非流式 chat/usage 协议映射；它不默认激活任何厂商或价格。

只有可重试的 provider 错误（超时、限流或 5xx）会触发下一个 binding；参数、鉴权和其它不可重试
错误会原样返回，避免同一请求在多个 provider 上产生重复副作用，也不会因为这类错误打开 circuit。

本轮只完成源码和部署合同，未运行 build/test，未与任何真实 provider/KMS 交换凭据。
