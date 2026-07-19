# Agent production-style quickstart

本 quickstart 只说明语见 Agent 合同如何接线，不包含可用的凭据，也不会默认激活任何
provider。所有 image 必须使用 `image@sha256:...`，所有 secret 必须由 workload identity 在请求时
换取，不得写入 manifest、dispatch 或 handler module。

## 准备部署模块

Agent Control 的 deployment-owned ESM module 必须导出：

- `createAgentControlPersistence()`：连接 PostgreSQL `agent_control_snapshots`。
- `createAgentDispatchQuota()`：返回 `RedisAgentDispatchQuota`，绑定 environment/deployment 上限。
- `createAgentArtifactVerifier()`：返回 `HttpsAgentArtifactVerifier.verify`，绑定 exact image、签名、
  SBOM、policy digest 和 receipt digest。

worker handler 在每个 dispatch 内部执行以下顺序：

1. 读取投影的 workload token，从凭据网关换取短期 provider header 和短期 Room token。
2. 使用官方 LiveKit SDK connector 加入 dispatch 指定的 Room。
3. 通过 `ProviderRegistry` 按 capability/region/streaming 选择 provider，将 deadline 与
   `AbortSignal` 传到每一次调用。
4. 用 `ObservedProviderAdapter` 写数值 usage/cost 和低基数 metric，不写正文。
5. 收到 heartbeat `cancelDispatchIds`、deadline 或 drain 时立即取消 provider 请求并离开 Room。

## 部署值

Helm 至少需填写：

```yaml
features:
  agentControlEnabled: true
  agentWorkerEnabled: true
agent:
  environmentId: <environment-id>
  handlerModulePath: /app/runtime/handler.mjs
  nodeSelector: { yujian.ai/gpu: rtx-5090 }
  providerEgressCidrs: ["<credential-and-provider-cidr>"]
  workloadIdentity:
    enabled: true
    serviceAccountName: <workload-identity-service-account>
    audience: yujian-runtime
    expirationSeconds: 600
agentControl:
  baseUrl: https://<agent-control-service>:8096
  persistenceModulePath: /app/runtime/agent-control-runtime.mjs
  artifactVerifierModulePath: /app/runtime/agent-control-runtime.mjs
  externalHttpsEgressCidrs: ["<artifact-verifier-cidr>"]
  tls: { enabled: true, existingSecret: <tls-secret>, certKey: tls.crt, keyKey: tls.key }
```

渲染前将镜像替换为生产 registry 的不可变 digest。不允许把 provider API key、LiveKit API
secret 或 KMS root token 放入 values。

## 验收边界

本轮没有运行上述流程。Gate 4 必须另行归档 artifact 校验回执、Redis 跨副本竞争、
canary/回滚、Node/Python Room 任务、provider 故障、取消/drain、成本对账和 Beelink RTX 5090
运行证据；没有这些证据时不得将 quickstart 解读为生产可用。
