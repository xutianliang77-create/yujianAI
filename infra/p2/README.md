# P2 Beelink runtime

这是语见AI控制面的独立数据依赖切片，不复用或改动已有的 `livekit-qkxy-*`、
`ai-phone-staging-*` 容器。Compose project 固定为 `yujian-p2`，服务仅绑定本机回环：

| 服务 | 固定镜像 | 回环端口 | 持久化目录 |
| --- | --- | --- | --- |
| PostgreSQL | 16.4 + amd64 digest | 15432 | `data/p2/postgres` |
| Redis | 7.2.7-alpine + amd64 digest | 16379 | `data/p2/redis` |
| OpenBao | 2.4.1 + amd64 digest | 18200 | `data/p2/openbao` |

## 首次部署

在 Beelink checkout 根目录运行：

```bash
./infra/p2/beelink/deploy.sh up
./infra/p2/beelink/deploy.sh migrate
./infra/p2/beelink/deploy.sh smoke
```

脚本在 `/home/beelink/yujianAI/data/p2/runtime.env` 创建 0600 环境文件，在
`data/p2/openbao-init.json` 保存 0600 的 OpenBao 初始化材料，并把 PostgreSQL migration
目录以只读方式挂进数据库容器。真实 platform-api 运行时还需注入：

```bash
YUJIAN_PLATFORM_RUNTIME_MODULE=/home/beelink/yujianAI/infra/p2/runtime/platform-runtime.mjs
```

runtime module 使用 PostgreSQL 作为控制面真值、Redis 作为短期协调层，并通过 OpenBao KV
读取 `yujian/...` 的 webhook secret；API、客户端和数据库不会看到 secret 明文。

## 恢复烟测

```bash
docker compose --project-name yujian-p2 \
  --env-file /home/beelink/yujianAI/data/p2/runtime.env \
  -f infra/p2/beelink/compose.yaml restart
./infra/p2/beelink/deploy.sh smoke
```

`tools/p2/runtime-smoke.mjs` 需要短时测试用的 `YUJIAN_KMS_ADMIN_TOKEN`（从
`openbao-init.json` 读取，不写入环境文件），验证 8/8 migration、PostgreSQL store 查询、
Redis 原子限流和受限 KMS token 的 32-byte secret round-trip，随后删除测试 secret：

```bash
set -a; . /home/beelink/yujianAI/data/p2/runtime.env; set +a
export YUJIAN_KMS_ADMIN_TOKEN="$(jq -r .root_token /home/beelink/yujianAI/data/p2/openbao-init.json)"
node tools/p2/runtime-smoke.mjs
```

这是私有验收部署：OpenBao 当前使用 loopback 明文监听和 file storage，未完成 TLS、HA、
auto-unseal、备份恢复、外部身份和生产 KMS 合规评审前不得作为公网生产配置。
