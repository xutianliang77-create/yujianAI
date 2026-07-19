# M7 GA 加固：开发实现与证据合同

状态：**development implemented；真实测试和 Gate 6/7/9/10 判定未执行。**

## 实现映射

- M7-01：PostgreSQL 账单草稿、CAS 状态跃迁、不可变审批账本、发票导出和 provider 对账。
- M7-02：带序号和过期时间的 RTC 区域健康观测；不可用、draining 或过期节点失败关闭，
  不跨数据驻留和故障域策略。
- M7-03：error budget 自动计算 release policy；on-call 事件和跃迁保存不可变证据。
- M7-04：安全审计 manifest 生成器覆盖 secret/SAST/依赖/容器/SBOM/签名/渗透/合规。
- M7-05：沿用 PostgreSQL 数据权利 worker/executor，导出、删除、纠正均写保护证据。
- M7-06/07：LTS、升级窗口、迁移和公开状态事件合同已补齐。
- M7-08：商业压测和灾备场景、真实证据格式已冻结；本轮未执行。
- M7-09：RC 只能基于 Gate 0–10 完整快照冻结；任一非 passed 状态生成 rejected 记录。
- M7-10：GA approve 要求冻结 RC、11 个 Gate 全通过和八类 Owner receipt；reject 至少保留
  一位 Owner receipt。所有输出使用 `wx`，不提供覆盖路径。

数据库源码 schema 为 001–016；migration 016 尚未在 PostgreSQL 执行。

## 真实证据合同

`tools/acceptance/verify-m7-evidence.mjs` 要求十个 M7 task 恰好各出现一次。`passed` 和
`failed` 必须绑定不可变 URI 与 SHA-256；`not-run`/`blocked` 必须写明原因。只有设置
`M7_REQUIRE_PASS=true` 且十项均 passed 时，verifier 才允许正式验收通过。

本轮按用户要求未运行 verifier、测试、build、migration、压测、灾备、渗透、真实账单、
区域故障、状态页或 RC/GA 签署，因此不得把开发完成写成 Gate 通过或 GA 发布授权。
