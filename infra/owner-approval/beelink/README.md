# Beelink Owner 审批台

审批台使用已固定的 Node 24 镜像、host network 和 Tailscale TLS，只监听 Beelink 的
`100.110.127.117:8093`。容器只读挂载不可变 release、Owner 模板、key registry、OpenBao CA
和 TLS key；唯一可写路径是 `/data/models/yujianAI/evidence/p1-m0-04/owner-approvals`。

容器没有 OpenBao root/admin token。本人提交的 wrapped token 只存在于一次请求内存，后端解包
后核对 Owner metadata/policy，完成 sign/verify/revoke-self 才写入 receipt。host Node 18 不用于
运行服务；部署固定使用仓库已验证的 Node 24 OCI digest。

```bash
bash tools/owner-approval/deploy-beelink.sh
curl --fail --silent --show-error \
  --resolve beelink.tail1e9cec.ts.net:8093:100.110.127.117 \
  https://beelink.tail1e9cec.ts.net:8093/healthz
```

访问地址：`https://beelink.tail1e9cec.ts.net:8093/`。该地址只应通过 Tailscale 网络访问；证书
续期沿用 Registry 的 Tailscale/Let's Encrypt 证书流程，当前证书到期日为 2026-10-11。

## 本机绕开 Clash

如果本机代理劫持或阻断 Tailscale 域名，在 Mac 的语见AI仓库运行：

```bash
npm run owner-approval:bypass-clash
```

然后访问 `http://127.0.0.1:8094/`。`tools/owner-approval/bypass-clash-proxy.mjs` 仅绑定
`127.0.0.1`，只转发审批台所需的静态资源、查询和决定提交路径；上游固定直连
`100.110.127.117:8093`，并以 `beelink.tail1e9cec.ts.net` 验证 TLS 证书。浏览器到本机桥接为
loopback HTTP，本机桥接到 Beelink 仍是验证证书的 HTTPS。不要将本地端口改为公网或局域网
监听地址。
