# 控制面备份、恢复与事故 Runbook

## 范围

PostgreSQL 是租户、项目、环境、API key metadata、usage、audit 和 outbox 的权威存储；
Redis 只保存路由、短期 quota 和可重建缓存。LiveKit Room/Participant 状态不作为账本事实。

## 备份

1. 每日全量 + 15 分钟 WAL；备份使用客户 KMS 加密，写入客户对象存储。
2. 记录备份时间、数据库版本、schema migration、加密 key version 和 checksum。
3. 备份索引不得包含 secret、手机号或用户正文。
4. 调度器通过 `PostgresControlPlaneBackupCoordinator` 先写入 `planned`，再以 CAS 转为
   `running`；只有 provider 返回无凭据对象 URI、`sha256:` 摘要和有效 snapshot 时间后才转为
   `verified`。异常只能转为 `failed`，不得把计划任务标成成功。
5. provider 使用 `ControlPlaneBackupProvider` 合同。生产可接
   `HttpControlPlaneBackupProvider`，其入口必须为无 userinfo/query/fragment 的 HTTPS，鉴权由
   部署侧函数即时取得，响应上限 64 KiB；同一 `backupRunId` 作为幂等键。

## 恢复演练

1. 隔离恢复到临时网络，验证 checksum 和 migration 版本。
2. 恢复 PostgreSQL，再启动 Redis 空缓存，最后启动控制面和 RTC adapter。
3. 验证 tenant 隔离、`platform_store_snapshots` 中的 API key hash（无明文 secret）、outbox
   dedupe、quota 和 `/readyz`。
4. 记录 RPO/RTO、缺失的瞬时媒体状态和回滚决定；不得直接把临时环境暴露公网。
5. `restoreIsolated()` 合同只表达 `isolated=true`、`productionOverwrite=false`；数据库
   `control_plane_restore_drills` 也以 CHECK 禁止生产覆盖。恢复编排记录实际毫秒 RTO 和有限的
   标量 verification，不接收 secret、日志正文或任意嵌套 payload。

## 状态与证据

- migration `012_preview_operations.sql` 保存备份/恢复状态、CAS version、对象 URI、摘要、KMS
  key reference、RPO/RTO 和 verification；不保存 KMS key、数据库口令或备份内容。
- schema migration 必须记录为精确文件名，例如 `012_preview_operations.sql`。
- `verified` 只是 provider 产物与隔离恢复状态；没有真实 provider、对象存储和恢复运行报告时，
  Gate 3 仍是 `not-passed`。

构建 workspace 后，部署侧调度器可调用同一入口（凭据只走环境/KMS 注入，不写参数）：

```bash
YUJIAN_DATABASE_URL='postgresql://...' \
YUJIAN_BACKUP_PROVIDER_URL='https://backup.internal/' \
YUJIAN_BACKUP_PROVIDER_TOKEN='...' \
YUJIAN_BACKUP_KMS_KEY_REF='openbao://transit/keys/yujian-backup' \
npm run ops:control-plane-backup -- backup

npm run ops:control-plane-backup -- restore-drill 'backup-00000000-0000-0000-0000-000000000000'
```

第二条命令仍需要相同的数据库/provider 环境；示例 ID 只是格式占位，不能作为成功证据。

## 事故

先保护数据和停止高风险能力（SIP、外呼、Egress），再按 request ID/trace ID 收集脱敏
support bundle。任何远程协助必须短期授权并写入 audit。

支持工单由 `PostgresSupportService` 持久化；创建使用环境内 idempotency key/fingerprint，更新使用
version CAS。脱敏 bundle 只登记无 query/fragment 的对象 URI、摘要、大小、策略版本和过期时间，
并强制 `containsMedia=false`。临时访问 token 只返回一次，数据库只保存 SHA-256，期限 60–3600
秒且只能绑定一个 permission；消费、撤销和过期均失败关闭。`consumed_at` 是不可重复消费的数据库
事实，平台 audit 另外记录 operator subject、grant/ticket/bundle ID，不记录 token。
