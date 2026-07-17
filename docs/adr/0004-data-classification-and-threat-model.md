# ADR-0004：数据分类与威胁模型基线

状态：accepted

| 分类 | 例子 | 处理 |
| --- | --- | --- |
| C0 | 版本、公开文档、健康状态 | 可公开；不含内部 endpoint |
| C1 | tenant/project ID、节点状态、聚合指标 | 租户范围；最小保留 |
| C2 | API key metadata、audit、usage、trace | 加密存储；按角色访问；导出脱敏 |
| C3 | API secret、KMS plaintext、音视频/号码/正文 | 不进日志/包；短期授权；默认不持久化 |

主要威胁：IDOR、越权 grant、secret 泄漏、webhook replay、provider SSRF/超时、配额耗尽、
跨租户 telemetry 污染、备份暴露。控制：作用域 credential、短 TTL、hash/KMS、签名和
replay window、payload/并发上限、outbox dedupe、网络 egress policy、审计和恢复演练。
