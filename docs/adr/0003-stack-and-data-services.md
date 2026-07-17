# ADR-0003：首版技术栈、数据服务与部署

状态：accepted（生产 adapter 仍按环境替换）

| 平面 | 首版选择 | 约束 |
| --- | --- | --- |
| 控制面 API | Node.js 22+/TypeScript，HTTP JSON | 合同先行，单文件默认不超过 350 行 |
| 事务真值 | PostgreSQL 16+ | tenant、IAM metadata、quota、usage、audit、outbox |
| 短期协调 | Redis 7+ | routing、rate limit、短期 lease；不可作为账本 |
| 分析/质量 | OTel → Prometheus/分析仓 adapter | 高频 stats 窗口聚合，不进入账本 |
| 媒体 | 官方 LiveKit Server/SDK/Ingress/Egress/SIP | 语见通过 adapter，不改媒体核心 |
| 部署 | Helm/Kubernetes；Beelink Compose 为验收环境 | 镜像必须 digest、secret 外置 |

首个中国区域的具体云厂商和对象存储待商务/合规确认；接口不得绑定厂商 SDK。
