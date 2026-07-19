# P1-M0-04 Redis 发布决定包

日期：2026-07-18

Owner：`release-owner` bbb

当前状态：bbb 已签名批准 Redis 候选；Registry/KMS freeze sequence 1 仍为签名驳回，未授权运行时切换

## 1. 决策对象

- 当前：`redis:7.2.7-alpine@sha256:1de7ca6a3f63a083036fa1d95dddbd6bdfcdf5865bb692c1e412d4bdf9cb1e37`
- 候选：`redis:7.2.14-alpine@sha256:dfa18828cbc07b3ae6a95ec7343f6c214fdee2d836197b4be8e9904420762cd8`
- 扫描：候选 Critical 0、High 0；不能外推为其他镜像或完整 Gate 通过。
- 回归：`p1-m0-04-redis-regression-20260718T101047Z`，初始、重启和删除重建三阶段通过。
- 原始报告 SHA-256：`b52848641e435b69302275e0d042f5ce4779226855d8c6d46c7ea4067dfd66bd`。

## 2. 已归档决定与变更边界

bbb 已通过本人 OpenBao key 提交 `approve`，current sequence 为 0；原始 decision、signature
和 receipt 保存在 Beelink `/data`，机器合同只保留路径、SHA-256 和验签状态，不复制决定
理由正文。原决定所要求的字段如下，不能由 AI、角色名或任命批准人代填：

```text
decision: approve | reject
reason: 至少说明候选 digest、回归 run、回滚和 registry 签名判断
decided_at: ISO-8601 UTC
registry_target: 语见控制的 OCI repository
rollback_reference: 保留的当前 Redis 7.2.7 digest
signing_identity_or_key: 生产签名 identity/KMS key URI，不得填写私钥
bbb_confirmation: 本人确认
```

该批准只确认 Redis 候选判断，不代表 P1-M0-04、Gate 0/1/7 或全平台生产发布通过。
由于回滚接受和 Registry/KMS freeze 均未满足，`deploymentAuthorized=false`。如 bbb 改变
结论，必须追加绑定当前 receipt/artifact SHA-256 的 superseding decision，不能覆盖序号 0。

## 3. 发布前置条件

1. 候选扫描和真实回归证据 hash 已复核。
2. bbb 尚需明确接受回滚方案：保留当前镜像；先备份并校验 AOF/RDB；canary 失败立即停止新容器，
   不反向写入旧格式未知的数据；恢复时验证 key count、quota 和 lease。
3. 生产 OCI repository 名称和 immutable tag/digest 策略冻结。
4. 候选 digest 已由生产身份签名，并从 registry 重新拉取后验签。
5. bbb 的 Redis 决定已签名并在 Beelink evidence 根归档；Registry/KMS freeze 仍须当前有效批准。

机器合同为
[`p1-redis-release-decision.json`](../acceptance/p1-redis-release-decision.json)。在全部前置条件
和签名满足前，`deploymentAuthorized` 必须为 `false`，当前 P2 Redis 不得切换。v2 adapter
从不可变 receipt/audit 生成此合同，`npm run supply-chain:verify-redis-decision` 会拒绝旧式
手工签字字段、原始理由、凭据内容和错误的 Gate 放行。
