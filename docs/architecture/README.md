# 语见AI统一架构

## 架构结论

```text
Developer SDKs / Console / Server APIs
                  |
       Yujian China Control Plane
                  |
   +--------------+----------------+
   |              |                |
LiveKit RTC    Agent Platform   SIP/Ingress/Egress
Media Plane    Worker Plane     Media Services
   |              |                |
   +--------------+----------------+
                  |
 Data / Metering / Observability / Audit
```

## 核心约束

1. 以 `tenantId / projectId / environmentId` 建立平台隔离边界。
2. Room、Participant、Track 等实时对象保持 LiveKit 兼容标识和语义。
3. 控制面、实时媒体面、Agent 平面、电话媒体面和数据面分离。
4. LiveKit 房间状态不能覆盖套餐、账单、审计和部署等平台业务状态。
5. PostgreSQL 保存控制面真值；Redis 保存短期协调状态；分析仓保存用量和质量数据。
6. 所有公网和热路径都有容量准入、上限、超时、取消、降级和幂等。
7. 托管云与私有部署共享合同；差异只存在于部署、运维和服务等级。
8. 语见扩展使用 `yujian.*` 命名空间，上游兼容能力不依赖这些扩展。

## 文档

- [01-platform-boundaries.md](01-platform-boundaries.md)
- [02-unified-data-model.md](02-unified-data-model.md)
- [03-delivery-baseline.md](03-delivery-baseline.md)
- [04-platform-contracts-v1.md](04-platform-contracts-v1.md)
- [05-technical-architecture.md](05-technical-architecture.md)
- [06-yujian-naming-and-dual-node-runbook.md](06-yujian-naming-and-dual-node-runbook.md)
- [../security/SECURITY_BASELINE.md](../security/SECURITY_BASELINE.md)
- [../security/ENTERPRISE_IDENTITY.md](../security/ENTERPRISE_IDENTITY.md)
- [../adr/0003-stack-and-data-services.md](../adr/0003-stack-and-data-services.md)
- [../adr/0004-data-classification-and-threat-model.md](../adr/0004-data-classification-and-threat-model.md)
- [../migration/LEGACY_ISOLATION.md](../migration/LEGACY_ISOLATION.md)

LiveKit 深度研究资料放入 `docs/reference/livekit-review/`，仅作为设计依据，不形成
对旧仓库的代码依赖。

完整设计交付索引见 [../README.md](../README.md)。
