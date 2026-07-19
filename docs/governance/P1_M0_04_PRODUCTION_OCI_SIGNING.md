# P1-M0-04 生产 OCI 签名执行合同

日期：2026-07-18

状态：真实技术签名/attestation 已通过；bbb 已批准 Redis 候选，但 Registry/KMS freeze
sequence 1 仍为 reject；
生产发布继续阻断

## 已执行事实

- Registry：`beelink.tail1e9cec.ts.net:5443`，只绑定 Tailscale IP，TLS + bcrypt 认证；
  未认证 401、认证 200。
- Registry 由 Distribution v3.1.1 固定 commit 最小安全重建，Critical 0、High 0；运行
  image ID `sha256:a6757e5a...`，`restartCount=0`。
- KMS URI：`openbao://yujian-oci-release`；ECDSA P-256、不可导出、禁止明文备份，最小
  `yujian-oci-signer` policy，TLS 验证通过。
- Redis、PostgreSQL、OpenBao、Registry 四个 registry digest 均完成 Cosign 签名和 SPDX
  attestation 验证。本机外部客户端重新读取 4 个 manifest/44 个 blob 并逐项校验 digest。
- 机器索引：[`p1-production-oci-evidence.json`](../acceptance/p1-production-oci-evidence.json)。

这些是技术配置与验证事实。bbb 的本人决定已归档：Redis 候选为 approve，repository/KMS
freeze sequence 1 为 reject；sequence 0 原记录保留，组合结果不授权发布或运行镜像切换。

## bbb 已审阅的冻结范围

1. 接受或驳回已配置的 Registry host/repository 与单节点/Tailscale-only 边界。
2. 接受或驳回 `openbao://yujian-oci-release`，并确认 token 续期、key 轮换/吊销和备份 owner。
3. immutable tag 与 digest 策略、签名/attestation 保留期、轮换和吊销方案。
4. Redis 当前 digest 及 PostgreSQL/OpenBao 当前版本的回滚引用。

技术整改实现见 `infra/registry/beelink/freeze-policy.json` 和 `infra/registry/README.md`。策略固定
四个 registry digest、`/data/models/yujianAI` 备份/证据目录、TLS 续期、RPO/RTO、OpenBao
Raft snapshot、隔离恢复、key rotation 与不可逆版本退役门禁。当前 bbb sequence 1 仍是
`reject`；策略只保存该历史 receipt，后续批准必须以 superseding receipt 生成新的 append-only
authorization，不能修改或删除旧决定。

恢复工具没有生产覆盖 action：Registry 只在回环临时实例校验 manifest/blob/signature/attestation，
OpenBao 只在回环单节点恢复加密 Raft snapshot。key rotation 前必须已有 bbb superseding approval；
旧 key version 的不可逆退役还要求轮换后 bbb 与 aaa 各自追加新 receipt。所有技术结果均固定
`productionReleaseAuthorized=false`，不能替代正式 Gate。

## 可复现执行

镜像必须先推送到冻结的 repository，并以 registry 返回的 digest 调用：

```bash
export YUJIAN_PRODUCTION_REGISTRY_HOST='<bbb 批准的 host>'
export YUJIAN_OCI_IMAGE='<host>/<repository>@sha256:<registry digest>'
export YUJIAN_OCI_SBOM='<与该 digest 完全匹配的 SPDX 2.3 JSON>'
export YUJIAN_COSIGN_KEY_URI='openbao://<production transit key>'
export YUJIAN_RELEASE_COMMIT='<40 字符 Git commit>'
bash tools/supply-chain/sign-production-oci.sh
```

脚本拒绝 tag-only、本地 image ID、非批准 registry host、普通磁盘私钥 URI和非 SPDX 2.3
输入。它会重新拉取 digest、把 Cosign 签名和 SPDX attestation 附着到 OCI repository，
再次拉取并用导出的生产公钥验签，最后生成 `result.json`；该结果固定
`releaseAuthorized=false`，直到 bbb 的发布决定和四类 Owner 签字都完成。

正式证据至少包含 registry digest、release commit、签名公钥 hash、SPDX hash、签名验签
输出 hash 和 attestation 验签输出 hash。当前本人 receipt 必须由维护人复核并回填 Redis
决定包和 Owner 签字包；Registry/KMS 已驳回时 verifier 必须保持发布阻断。这个流程遵循
Cosign 的 digest claim、KMS/OpenBao key URI、registry signature 和 attestation 模式。
