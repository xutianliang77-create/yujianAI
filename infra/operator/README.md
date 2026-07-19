# 语见AI Deployment Operator

`YujianPlatform` 以 generation 为不可变部署意图。Operator 只创建摘要锁定的短生命周期
Job，不读取 values Secret；executor 在客户命名空间内拉取指定版本 OCI chart，校验归档
SHA-256，执行 001–016 连续迁移预检，然后使用 Helm atomic upgrade。

回滚必须同时设置 `rollbackToRevision` 和稳定的 `approvalReceiptRef`。回滚仅恢复上一版
工作负载，不执行数据库降级；目标 schema 与上一镜像必须符合 release manifest 的 skew
策略。CRD 为 cluster-scoped 安装对象，RBAC/Operator/Executor 权限均限定到客户命名空间。

`deployment.yaml` 中的镜像占位符必须由离线包或生产 registry 的摘要替换后才能安装。
本目录提供实现清单，不构成已完成集群验收证据。
