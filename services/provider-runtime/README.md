# `@yujian/provider-runtime`

提供 provider capability、deadline、熔断、failover 和 HTTP JSON adapter。

`ObservedProviderAdapter` 可包裹任意 `ProviderAdapter`，向部署侧 observer 发送 providerId、
capability、success/failure/cancelled、duration、traceId 和截断后的错误摘要；请求正文、模型
参数和凭据不进入 observation。observer 异常被隔离，不改变 provider 结果。

`ProviderRegistry` 是 Agent runtime 的能力选择入口：按 capability、region 和 streaming 能力
过滤 `healthy/degraded` provider，跳过 disabled 或已打开的 circuit，并按注册顺序 failover。每个
provider binding 独立熔断；registry 只保存 capability metadata，不保存凭据或请求正文。具体国内
模型、语音和审核 provider 由部署侧注入 `ProviderAdapter`。

只有可重试的 provider 错误（超时、限流或 5xx）会触发下一个 binding；参数、鉴权和其它不可重试
错误会原样返回，避免同一请求在多个 provider 上产生重复副作用，也不会因为这类错误打开 circuit。
