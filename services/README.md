# Services

| 服务 | 权威职责 |
| --- | --- |
| [`platform-api`](platform-api/README.md) | Token、Tenant/Project/Environment、IAM scope、quota、usage、Room adapter、telemetry 和 outbox 边界 |
| `credential-token` | API key、KMS、LiveKit token 和 endpoint discovery（当前合并在 platform-api） |
| `region-quota` | 区域路由、容量准入和配额（当前合并在 platform-api/livekit-compat） |
| [`agent-control`](agent-control/package.json) | Artifact、Deployment、Rollout、Dispatch、Tool policy、Provider binding 和 worker lifecycle API |
| [`agent-worker-node`](agent-worker-node/package.json) / `agent-worker-python` | Node/Python worker deadline、cancel、drain baseline |
| [`media-ops`](media-ops/package.json) | SIP、Ingress、Egress 的租户映射、策略、幂等、feature gate、HTTP(S) 内部服务和官方 SDK adapter |
| [`billing`](billing/package.json) | 原子用量、价格版本、账单和 provider 对账边界 |
| [`data-rights`](data-rights/package.json) | 数据导出、删除和证据状态机 |
| [`owner-approval`](owner-approval/README.md) | Owner 决定模板、一次性 OpenBao 个人签名、验签、撤销和不可覆盖证据归档 |
| `provider-runtime` | LLM、实时模型、ASR、TTS、VLM 和内容安全 adapter 的 capability/deadline/circuit；HTTPS JSON provider/failover |
| `platform-adapters` / `license-service` | KMS、对象存储、OIDC/SAML、日志和离线 license 边界 |

初期允许将多个控制面模块部署在同一进程，避免过早微服务化。当前各模块已落地合同和
可替换 adapter 骨架；模块间只通过当前平台合同通信；历史
`@yujian/contracts` 翻译合同不得被新服务引用。
