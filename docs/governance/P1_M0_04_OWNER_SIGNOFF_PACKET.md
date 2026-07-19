# P1-M0-04 Owner 专业签字包

日期：2026-07-18

状态：五项本人签名原始 receipt 已归档；bbb Redis 批准，aaa 安全与 ddd 中国分发由原始
reject 追加 sequence 1 approve，bbb Registry/KMS 与 ccc 法律均追加 sequence 1 reject。eee 的任命批准
不替代受任人决定，现有 receipt 也不自动证明专业资格。

四把独立 OpenBao key 与最小权限 policy 已配置并完成跨 key/系统权限负向测试；没有提前
签发个人 token。机器索引见
[`p1-owner-key-registry.json`](../acceptance/p1-owner-key-registry.json)，五份冻结模板及当前
receipt 状态见
[`owner-decisions/`](owner-decisions/README.md)。

2026-07-18 已部署语见 Owner 审批台 `https://beelink.tail1e9cec.ts.net:8093/`。页面按冻结
revision 展示证据，用一次性 wrapped token 调用 Owner 本人 key；签名、验签和 token 撤销
全部成功才在 `/data` 归档，不自动放行生产。JSON/SSH 方式保留为回退。

同日用户确认审批台功能验收通过：approve/reject、supersede、Owner 隔离、不可覆盖证据链、
签名/验签/撤销和 fail-closed 均已真实执行。bbb Registry/KMS 与 ccc 法律 reject 属于故意
执行的负向路径；功能验收通过不改变 receipt 的 reject 语义，也不等同于专业批准。

## 当前技术事实

- Redis 7.2.14 官方候选：Critical 0、High 0，隔离竞争、重启、删除重建回归通过；bbb 已
  签名批准该候选，但 Registry/KMS freeze 为签名驳回；组合结果不授权部署或运行镜像切换。
- PostgreSQL 16.14 语见安全重建：Critical 0、High 0；registry digest 为
  `sha256:ca0b040c...`，OpenBao KMS 签名和 SPDX attestation 已验证；备份恢复、
  migration 001–011、事务 outbox/CAS 和容器删除重建回归已通过。
- OpenBao 2.5.4 语见安全重建：Critical 0、High 0；registry digest 为
  `sha256:8f0a9202...`，OpenBao KMS 签名和 SPDX attestation 已验证；2.4→2.5 三节点
  Raft snapshot/TLS/HA/API-key 生命周期与恢复回归已通过。
- Redis、PostgreSQL、OpenBao 与 Distribution Registry 四个 digest 已由
  `openbao://yujian-oci-release` 真实签名，外部客户端验证 4 个 manifest/44 个 blob。
  该技术结果不代表 bbb 已冻结目标；bbb 已单独批准 Redis，但 Registry/KMS freeze 为驳回。
- 原始 SPDX 的 335 条 `licenseDeclared=NOASSERTION` 保持不可变；独立签名结论层已将
  335 条逐项分类，`licenseConcluded=NOASSERTION` 为 0，并随包提供实际 OpenBao 源码、
  NOTICE 与全部许可证。`reedsolomon v1.0.0` 因 tag 不含许可证保留 1 个 pending-legal
  LicenseRef；工程人员没有宣告法律关闭。

## 四位 Owner 已归档且必须复核的决定

| Owner | 本人必须给出的专业结论 | 最小签字输入 |
| --- | --- | --- |
| aaa | 当前为 sequence 1 approve；原 reject 保留；后续只在新证据要求改变批准时再判断是否 supersede | 最终 scan、镜像 digest、KMS 公钥 hash、回归报告 |
| bbb | Redis 当前为 sequence 0 approve、Registry/KMS 当前为 sequence 1 reject；后续新证据要求改变时再判断是否 supersede | Redis receipt、OCI 验签结果、回滚引用 |
| ccc | 当前为 sequence 1 reject；本轮新增逐包结论、实际源码和唯一 pending-legal 项，须由本人判断是否改变结论 | `p1-license-remediation-evidence.json`、NOTICE、双 SPDX、source offer、签名 manifest |
| ddd | 当前为 sequence 1 approve；原 reject 保留；后续只在新证据改变合规判断时再判断是否 supersede | 部署区域/分发方式、ccc 意见、数据与留存边界 |

每份电子签字至少包含 `signer`、`role`、`decision`、`signed_at`、引用证据 SHA-256、签名
identity/KMS 公钥标识、签名 bundle/registry artifact 位置和验签结果。不得提交私钥或 token。

机器合同是
[`p1-m0-04-owner-signoffs.json`](../acceptance/p1-m0-04-owner-signoffs.json)。v2 acceptance
adapter 从 Beelink 不可变 decision/signature/receipt、Owner key registry 和 OpenBao audit
生成四位 Owner、五项决定及完整历史；理由只保存长度和 SHA-256，不复制正文。运行
`npm run supply-chain:verify-owner-signoffs` 校验 receipt 链、审计覆盖、四位/五项映射、
凭据不落库和 Gate fail-closed。aaa、bbb Registry/KMS、ccc 法律与 ddd 中国分发当前
sequence 1，仅 bbb Redis 为 sequence 0；原决定均未覆盖。v2 audit 按决定序号记录 aaa
原始 audit 缺口和四项
supersession 完整覆盖；后续如需改变必须继续
追加 superseding decision。

## P0 同步后的 supersede 判断

P0 acceptance adapter/verifier 完成后，系统不会替 Owner 判断。四位 Owner 应分别审阅：

| Owner | 当前有效决定 | 本轮必须判断的对象 | 未改变结论时 |
| --- | --- | --- | --- |
| aaa | 安全 approve（sequence 1） | 已完成本轮 supersede；生产回归已归档，继续跟踪专业资格和原始决定 audit 缺口，但这些不会改写旧记录 | 不再提交；当前 approve 继续有效，Gate 仍由其他阻断项关闭 |
| bbb | Redis approve；Registry/KMS reject（sequence 1） | 已再次确认 freeze reject；只有后续回滚接受、registry target 和 KMS URI 证据改变结论时才判断下一次 supersede | 当前 reject 继续有效，不再提交 |
| ccc | 法律 reject（sequence 1） | 审阅新增 LICENSE/NOTICE 整改包、实际 OpenBao 源码和 `reedsolomon` pending-legal 项，判断是否需要下一次 supersede | 在本人明确改变结论前，当前 reject 继续有效且不提交新决定 |
| ddd | 中国分发 approve（sequence 1） | 已完成本轮 supersede；后续继续跟踪 ccc 法律 reject、分发形态与留存边界，但不改写旧记录 | 不再提交；当前 approve 继续有效，Gate 仍由其他阻断项关闭 |

Owner 在明确判断需要改变后，才应签发新的 5 分钟 wrapped token。判断“不需要 supersede”
不产生新签名、不改旧证据；判断“需要”也只能追加下一序号，仍不能自动通过 Gate。
