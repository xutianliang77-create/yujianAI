# P1-M0-04 Owner 本人决定操作说明

状态：五份冻结模板本身保持 `awaiting-personal-decision`，不可回写；Beelink receipt 已记录
bbb Redis 批准，以及 aaa 安全、bbb Registry/KMS、ccc 法律、ddd 中国分发四项原始决定。
aaa 与 ddd 已追加 sequence 1 approval，bbb Registry/KMS 与 ccc 法律均已追加 sequence 1
reject；当前 bbb Registry/KMS、ccc 两项仍为驳回。
五项均为 `signed-decision-recorded`，`productionReleaseAuthorized=false`。签名 receipt 不等于
已核验专业资格，也不会自动修改 Gate。OpenBao audit 在 aaa 决定后才启用，因此 aaa 缺少
原始 unwrap/sign/revoke audit，只具备 receipt、服务日志和事后密码学验签；aaa sequence 1
与其余原始/替代决定审计完整。v2 audit 使用逐决定、逐序号 `decisionCoverage` 保留该边界。

## 审批台（首选）

本人审批入口：`https://beelink.tail1e9cec.ts.net:8093/`，只通过 Tailscale 访问。

本机 Clash 拦截该域名时，先在语见AI仓库运行下面的本地桥接，再打开
`http://127.0.0.1:8094/`：

```bash
npm run owner-approval:bypass-clash
```

桥接只监听本机 loopback，直接连接 Beelink Tailscale IP，并继续使用
`beelink.tail1e9cec.ts.net` 做上游 TLS/SNI 证书校验；它不会读取 Clash 配置，也不会记录
wrapped token 或请求正文。关闭运行该命令的终端会停止桥接。

Owner 在页面中选择自己的任务、审阅事实与证据、填写批准、驳回、有条件批准或限期例外，
再粘贴管理员通过独立安全通道交付的 5 分钟 wrapped token。后端只有在 Owner metadata、
唯一最小 policy、15 分钟 TTL、签名、验签和 revoke-self 全部通过后才归档决定；页面和
服务都不会自动更新发布 Gate。

## 替代决定（只追加）

已签名决定不得重新开放或覆盖。如本人因新证据、整改结果或误操作需要改变结论，
必须在审批台刷新完整决定链，填写不少于 20 字符的替代原因，并使用新的 5 分钟
wrapped token 签名。新 artifact 必须绑定：

- 前一份 receipt SHA-256 和 artifact SHA-256；
- 原冻结模板 revision、同一 `decisionId` 与同一个人 Owner；
- 递增序号、替代原因、新决定及其依据。

原始三份文件保持在 `<decisionId>/`，每次替代只写入
`<decisionId>/supersessions/000001/` 等独立目录。后端在解包新 token 之前校验前一份
receipt 哈希和写锁；旧页面、重复或并发提交返回 409。替代决定仍不会自动修改 Gate。

下面的 JSON/SSH 流程保留为受控回退和审计说明，不再是日常首选界面。

## 一人一把 key

aaa、bbb、ccc、ddd 分别使用 `openbao://yujian-owner-<owner>`。不得共用生产 OCI key，
不得由 eee、管理员或 AI 代签。签名前由管理员在本人在线时运行：

```bash
YUJIAN_PERSONAL_OWNER='<aaa|bbb|ccc|ddd>' \
  bash tools/supply-chain/issue-owner-signing-token.sh
```

该命令只生成 5 分钟有效、只能解包一次的 delivery token；解包后的签名 token 最长 15 分钟，
不可续期。wrapped token 必须通过独立安全通道交付本人，不能提交 Git 或复制到聊天记录。

## 本人决定

本人复制对应模板，在审阅证据后填写：

- `status=ready-for-personal-signature`
- `decision`
- `decidedAt`
- 不少于 20 字符的 `reason`
- 有条件批准或限期例外时填写 `conditions`；限期例外还须填写 `expiresAt`

bbb 有两份独立决定：Redis 发布决定与 Registry/KMS freeze，缺一不可。

## 本人签名

审批台不可用时，本人可通过自己的账号 SSH 登录 Beelink，在该个人 SSH 会话中解包 token、
设置 `BAO_TOKEN` 并执行；下列 loopback 地址只在 Beelink 内有效：

```bash
export BAO_ADDR='https://127.0.0.1:18200'
export SSL_CERT_FILE='/data/models/yujianAI/p2/openbao-tls/ca.crt'
export BAO_TOKEN='<本人刚解包的 15 分钟 token>'
export YUJIAN_OWNER_DECISION_ARTIFACT='<本人已填写的决定 JSON>'
export YUJIAN_OWNER_KEY_REGISTRY='<owner key registry JSON>'
bash tools/supply-chain/sign-owner-decision.sh
unset BAO_TOKEN
```

签名结果包含决定文件、Sigstore bundle、公钥、验签日志和哈希，全部保存在 Beelink evidence
根目录。脚本不自动修改发布 Gate；维护人复核本人交付和 OpenBao audit 后，才可回填
`p1-redis-release-decision.json` 与 `p1-m0-04-owner-signoffs.json`。

## 验证

```bash
npm run supply-chain:verify-owner-templates
npm run supply-chain:verify-production-oci
npm run supply-chain:verify-redis-decision
npm run supply-chain:verify-owner-signoffs
npm run test:supply-chain
```

`tools/supply-chain/adapt-owner-acceptance.mjs` 负责把 Beelink 原始 decision/signature/receipt、
supersession 哈希链、Owner key registry 和 OpenBao audit 收集为非敏感 snapshot，再生成
`p1-m0-04-owner-signoffs.json` 与 `p1-redis-release-decision.json` v2。adapter 不复制理由正文
或签名值，只保留长度、SHA-256、证据路径和验签状态；两个 acceptance verifier 会拒绝
缺项历史、哈希链断裂、凭据字段、错误 Owner 映射和任何未经完整前置条件的 Gate 放行。

结构校验通过不等于本人身份已核验；必须同时核对 secure delivery 记录、OpenBao audit、
artifact SHA-256 和 `cosign verify-blob` 日志。

当前身份绑定依赖管理员安全交付、本人独立 SSH 账号/会话和 OpenBao audit，是可审计的工程
控制，不等同于企业 OIDC、CA 实名证书或第三方电子签章。正式商用若要求更强实名证明，须在
Owner 签字前另行接入经批准的企业身份源或电子签名服务，不能把本流程描述为法定电子签章。
