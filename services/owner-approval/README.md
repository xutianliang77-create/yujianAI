# @yujian/owner-approval

语见 Owner 审批台的隔离后端。它同源托管 `apps/owner-approval`，读取仓库中的五份冻结模板，
使用 Owner 本人收到的一次性 OpenBao wrapped token 完成签名和验签，并把不可覆盖的结果写入
Beelink `/data`。

## API

- `GET /healthz`：进程存活，不探测或解封 OpenBao。
- `GET /api/v1/owner-approvals?owner=aaa`：列出模板、事实、证据和签名状态。
- `POST /api/v1/owner-approvals/{decisionId}:decide`：校验 revision 和决定合同，解包个人
  token，核对 `personal_owner`、最小 policy、15 分钟 TTL 和不可续期属性，签名、验签、
  revoke-self 后才归档。
- `POST /api/v1/owner-approvals/{decisionId}:supersede`：使用新的一次性凭据追加替代
  决定。请求必须携带当前 `receipt` 的 SHA-256；新签名 artifact 同时绑定前一份
  receipt/artifact 哈希、替代原因和递增序号。

服务不持有 OpenBao root/admin token，不签发 wrapped token，不把 token 写入文件、响应或日志，
也不修改发布 Gate。每个 `decisionId` 只能创建一份原始决定；原始
`decision.json`/`signature.json`/`result.json` 永不重写。替代决定只写入
`supersessions/000001` 等独立目录。旧页面、并发、跨 Owner 和旧 revision 均 fail closed。

## 运行

```bash
npm run build -w @yujian/owner-approval
set -a
source services/owner-approval/.env
set +a
npm start -w @yujian/owner-approval
```

默认只允许 loopback HTTP。监听 Tailscale/局域网地址时必须同时设置 TLS cert/key；OpenBao
内部 CA 通过 `NODE_EXTRA_CA_CERTS` 注入。证据目录及其中的决定、签名、receipt 使用
0700/0600 权限。

## 本人流程

1. 管理员确认 Owner 在线后，运行 `tools/supply-chain/issue-owner-signing-token.sh`。
2. wrapped token 通过独立安全通道交付本人，有效期 5 分钟且只能解包一次。
3. Owner 打开审批台，审阅全部证据，选择决定并填写不少于 20 字符的理由。
4. 后端核验 token 的 Owner 身份，只调用对应 `openbao://yujian-owner-<owner>`。
5. 签名和 OpenBao verify 通过且 token 撤销成功后，结果才写入证据目录。
6. 如需改变结论，Owner 刷新当前决定链，说明替代原因，并使用新的 5 分钟
   wrapped token 追加签名；旧决定仍完整保留。

当前身份强度仍取决于安全交付、本人设备/账号和 OpenBao audit，不等同法定电子签章。
