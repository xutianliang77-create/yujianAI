# ADR-0001：控制面存储与媒体边界

状态：accepted（首个实现为 in-memory adapter，生产替换为 PostgreSQL + Redis）

Owner：`platform-owner`
评审人：`data-owner`、`security-owner`
关闭前置：Gate 0 owner 记录、Gate 2 PostgreSQL/KMS/Redis 运行证据

决策：Tenant、Project、Environment、API key metadata、quota、usage、audit 和 outbox 由控制面 API 统一写入；LiveKit Server 只负责媒体、Room、participant、SIP participant 和 job dispatch。API secret 不进入客户端或 LiveKit 数据库。

原因：保持 `communicationSessionId` 与业务状态的单一权威，避免媒体服务成为计费/授权事实来源；adapter 允许先在 Beelink 验证后替换生产存储。
