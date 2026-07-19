# 生产 Registry / KMS 冻结与恢复控制

本目录的配置是 P1-M0-04 的技术整改实现，不是发布批准。当前 bbb 的有效决定仍是
sequence 1 `reject`；任何脚本都不得覆盖原 receipt，也不得把隔离恢复结果解释为生产发布许可。

## 冻结合同

`beelink/freeze-policy.json` 固定以下内容：

- Registry host、Tailscale 绑定、TLS 续期窗口、`/data/models/yujianAI` 数据/备份/证据路径；
- Redis、PostgreSQL、OpenBao、Registry 四个不可变 digest；
- `openbao://yujian-oci-release`、三节点单主机故障域、Raft 快照和非导出 ECDSA P-256 key；
- RPO 24 小时、RTO 4 小时目标，以及“只做回环隔离恢复”的默认恢复边界；
- bbb sequence 1 reject 的原 receipt path/hash 和必须追加 superseding decision 的条件。

`prepare-registry-kms-freeze.mjs` 只生成 append-only plan，不访问或修改运行容器。默认输出使用
大盘证据目录；目标文件已存在时以 `wx` 方式失败，不覆盖旧计划。

## Registry 恢复链

```bash
P1_M0_04_REGISTRY_KMS_PLAN=/data/models/yujianAI/registry/evidence/registry-kms-freeze/<run>/plan.json \
node tools/supply-chain/prepare-registry-kms-freeze.mjs

YUJIAN_CONFIRM_REGISTRY_QUIESCE=YES \
YUJIAN_REGISTRY_KMS_RUN_ID=<backup-run> \
./tools/supply-chain/run-registry-recovery.sh backup

YUJIAN_REGISTRY_BACKUP_RUN=/data/models/yujianAI/registry/evidence/registry-kms-freeze/<backup-run> \
YUJIAN_COSIGN_PUBLIC_KEY=/data/models/yujianAI/p2/backups/registry-kms/<kms-run>/public-key-v1.pem \
YUJIAN_REGISTRY_KMS_RUN_ID=<restore-run> \
./tools/supply-chain/run-registry-recovery.sh restore-verify
```

备份会在显式维护确认后短暂 pause Registry，以不变 restart count 生成 registry data tar 和可自举
OCI image archive。恢复只启动 `127.0.0.1:55443` 临时 Registry，逐一校验冻结 manifest、所有 blob、
Cosign 签名和 SPDX attestation；没有“覆盖生产目录”的 action。

## KMS 恢复与生命周期

```bash
YUJIAN_CONFIRM_KMS_SNAPSHOT=YES \
YUJIAN_REGISTRY_KMS_RUN_ID=<kms-snapshot-run> \
./tools/supply-chain/run-kms-recovery.sh snapshot

YUJIAN_KMS_SNAPSHOT_RUN=/data/models/yujianAI/registry/evidence/registry-kms-freeze/<kms-snapshot-run> \
YUJIAN_REGISTRY_KMS_RUN_ID=<kms-restore-run> \
./tools/supply-chain/run-kms-recovery.sh restore-verify
```

快照是 OpenBao 加密 Raft 数据，不导出 transit 私钥；隔离恢复使用临时单节点、回环端口和临时初始化
材料，恢复后只保留脱敏 key metadata/public key hash，临时 secret 不归档。

bbb 追加批准后，先以 `create-registry-kms-freeze-authorization.mjs` 生成绑定 exact policy hash 的维护
授权，再运行 `run-kms-key-lifecycle.sh rotate-probe`。轮换只给冻结 digest 追加
`candidate-not-authorized` probe 签名；旧 public key 和旧签名仍用于回滚验证，OpenBao key version 不支持
降级。旧版本的 `min_available_version` 退役不可逆，必须在轮换后由 bbb 与 aaa 分别追加新 receipt，生成
`create-kms-retirement-authorization.mjs`，并再次显式输入 `RETIRE`；任何生命周期结果都保持
`productionReleaseAuthorized=false`。

本轮遵照用户要求未执行这些脚本或测试。运行后仍需对 result JSON 做 verifier、Owner 专业复核和正式
Gate 判定。
