# 私有化部署升级与迁移指南

## 升级前

1. 冻结目标版本、source commit、OCI/chart digest、SBOM、签名和 Gate 0–10 证据。
2. 创建 PostgreSQL、OpenBao、对象存储和配置备份，在隔离环境完成恢复校验。
3. 执行 upgrade preflight，确认 migration 连续、目标 schema 与当前 schema 的 skew 在
   release manifest 范围内，并保留上一镜像 digest。
4. 确认 RTC drain、TURN、Agent、SIP/Ingress/Egress 和外部 provider 的回滚边界。

## 执行

Operator 只接收固定版本和 digest，调用 deployment executor 完成 Helm atomic upgrade。
数据库 migration 在新工作负载放量前执行，失败立即停止放量。升级期间不允许修改历史
migration，也不允许用镜像 tag 替代 digest。

## 回滚

应用回滚必须提供稳定审批 receipt，并只回到预检记录的上一镜像。数据库是 forward-only；
如果 schema skew 超出 manifest 限制，不允许自动应用回滚，必须恢复隔离备份或发布兼容
修复版本。任何回滚都应保留事件、时间、操作者、证据 digest 和客户通知。

## 验收

升级后验证控制面读写/outbox、RTC 跨 SDK、TURN、Agent dispatch、SIP/媒体、计费、数据
权利、备份和状态页。真实安装、升级、回滚和恢复证据完成前，Gate 8/9 保持未通过。
