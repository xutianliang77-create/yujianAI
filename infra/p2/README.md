# P2 Beelink runtime

这是语见AI控制面的独立数据依赖切片，不复用或改动已有的 `livekit-qkxy-*`、
`ai-phone-staging-*` 容器。Compose project 固定为 `yujian-p2`，服务仅绑定本机回环：

| 服务 | 固定镜像 | 回环端口 | 持久化目录 |
| --- | --- | --- | --- |
| PostgreSQL | 16.4 + amd64 digest | 15432 | `data/p2/postgres` |
| Redis | 7.2.7-alpine + amd64 digest | 16379 | `data/p2/redis` |
| OpenBao Raft | 2.4.1 + amd64 digest | 18200/18201/18202 | `data/p2/openbao-{a,b,c}` + `data/p2/openbao-tls` |

## 首次部署

在 Beelink checkout 根目录运行：

```bash
./infra/p2/beelink/deploy.sh up
./infra/p2/beelink/deploy.sh migrate
./infra/p2/beelink/deploy.sh smoke
```

脚本在 `/home/beelink/yujianAI/data/p2/runtime.env` 创建 0600 环境文件，在
`data/p2/openbao-ha-init.json` 保存 0600 的 OpenBao 初始化材料，并把 PostgreSQL migration
目录以只读方式挂进数据库容器。真实 platform-api 运行时还需注入：

```bash
YUJIAN_PLATFORM_RUNTIME_MODULE=/home/beelink/yujianAI/infra/p2/runtime/platform-runtime.mjs
```

runtime module 使用 PostgreSQL 作为控制面真值、Redis 作为短期协调层，并通过 OpenBao KV
读取 `yujian/...` 的 webhook secret；API、客户端和数据库不会看到 secret 明文。OpenBao
使用三节点 Raft、HTTPS listener 和受限 runtime token；三节点当前位于同一台 Beelink，
因此本项证明的是单主机进程/容器级 quorum 与 leader failover，不是跨主机或跨可用区 HA。

## 生产验收

在 PostgreSQL/Redis/OpenBao 部署完成后运行真实 production platform-api 验收：

```bash
./tools/p2/run-production-acceptance.sh
```

该脚本会以 `NODE_ENV=production` 启动 platform-api，并验证：

- PostgreSQL 事务内同时提交 usage、audit 和 outbox；两个 store writer 的 stale CAS 被拒绝；
- 两个 Redis client 并发限流严格保持 20/20，token quota 保持 3 个并发且 release 不泄漏；
- API key 创建只返回一次 secret，rotate 期间旧/新 secret 均传播，revoke 后两者均拒绝，
  且 snapshot 不含 secret；
- 三个 HTTPS KMS 地址健康，停止 leader 后通过剩余节点读取同一 secret，随后删除测试 secret；
- platform-api 重启、Redis 容器删除重建和 PostgreSQL migration 状态恢复。

脱敏报告写入 `data/p2/reports/production-acceptance.json`（0600）。2026-07-17 运行
`p2-20260717095831-116ef52a` 通过；完整 P2 Gate 仍因 P2-04/05/06 和 owner 签字未关闭。

## 恢复烟测

```bash
docker compose --project-name yujian-p2 \
  --env-file /home/beelink/yujianAI/data/p2/runtime.env \
  -f infra/p2/beelink/compose.yaml restart
./infra/p2/beelink/deploy.sh smoke
```

`tools/p2/runtime-smoke.mjs` 需要短时测试用的 `YUJIAN_KMS_ADMIN_TOKEN`（从
`openbao-ha-init.json` 读取，不写入环境文件），验证 8/8 migration、PostgreSQL store 查询、
Redis 原子限流和受限 KMS token 的 32-byte secret round-trip，随后删除测试 secret：

```bash
set -a; . /home/beelink/yujianAI/data/p2/runtime.env; set +a
export NODE_EXTRA_CA_CERTS="$YUJIAN_KMS_CA_FILE"
export YUJIAN_KMS_ADMIN_TOKEN="$(jq -r .root_token /home/beelink/yujianAI/data/p2/openbao-ha-init.json)"
node tools/p2/runtime-smoke.mjs
```

这是私有验收部署：OpenBao TLS 证书为部署侧 acceptance CA，未完成 auto-unseal、跨主机
故障域、备份恢复、外部身份和生产 KMS 合规评审前不得作为公网生产配置。
