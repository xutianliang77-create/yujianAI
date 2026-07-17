# Definition of Done 模板

每个变更必须填写：

- 合同/迁移：版本、兼容性、回滚和 owner。
- 安全/数据：数据分类、secret/PII 扫描、权限、审计和保留策略。
- 运行：日志、指标、告警、超时、取消、降级和 runbook。
- 验证：代码静态检查、单元/合同/集成/跨 SDK/媒体矩阵（按范围）；Beelink 运行证据单独归档。
- 上游：LiveKit 版本、许可证、NOTICE、patch queue 和 SBOM。
- 交付：文档、迁移、release evidence、缺陷/豁免和复盘日期。

测试未执行时只能标记“实现完成/运行验证 deferred”，不得标记 Gate 通过。
