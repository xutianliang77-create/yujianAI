# 控制面备份、恢复与事故 Runbook

## 范围

PostgreSQL 是租户、项目、环境、API key metadata、usage、audit 和 outbox 的权威存储；
Redis 只保存路由、短期 quota 和可重建缓存。LiveKit Room/Participant 状态不作为账本事实。

## 备份

1. 每日全量 + 15 分钟 WAL；备份使用客户 KMS 加密，写入客户对象存储。
2. 记录备份时间、数据库版本、schema migration、加密 key version 和 checksum。
3. 备份索引不得包含 secret、手机号或用户正文。

## 恢复演练

1. 隔离恢复到临时网络，验证 checksum 和 migration 版本。
2. 恢复 PostgreSQL，再启动 Redis 空缓存，最后启动控制面和 RTC adapter。
3. 验证 tenant 隔离、`platform_store_snapshots` 中的 API key hash（无明文 secret）、outbox
   dedupe、quota 和 `/readyz`。
4. 记录 RPO/RTO、缺失的瞬时媒体状态和回滚决定；不得直接把临时环境暴露公网。

## 事故

先保护数据和停止高风险能力（SIP、外呼、Egress），再按 request ID/trace ID 收集脱敏
support bundle。任何远程协助必须短期授权并写入 audit。
