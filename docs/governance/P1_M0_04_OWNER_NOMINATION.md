# P1-M0-04 个人 Owner 任命表

版本：v1.0

日期：2026-07-18

状态：四位个人 Owner 已实名指定；联系方式、备份人和本人签字待补

本表用于任命 P1-M0-04 供应链门禁所需的个人责任人。角色名、AI 或口头确认都不能
替代自然人姓名、联系方式、任命日期和可审计的决定记录。

## 1. 任命原则

1. `security-owner` 和 `release-owner` 不得由同一人对 Critical 例外同时实施与批准。
2. `legal-owner` 必须是有权给出法律意见的内部法务或外部执业律师；工程师不得
   以技术判断替代法律结论。
3. `compliance-owner` 必须是语见AI内部可追责的中国数据/产品合规 DRI；可聘请外部
   顾问复核，但外部顾问不替代内部 DRI。
4. 主 Owner 不可用公用邮箱或组名代替；备份联系人可在主 Owner 缺席时按书面授权
   代理，并在证据包中记录授权。
5. 任命本身不代表已批准候选镜像、漏洞豁免或生产切换。

## 2. 个人 Owner 任命

| 角色 | 建议人选与最小资格 | 主 Owner 实名 | 联系方式 | 备份人 | 任命日期 | 任命批准人 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `security-owner` | 高级安全工程师或独立外部安全评审人；能审核 CVE/VEX、威胁模型和限期例外 | aaa | 待补 | 待补 | 2026-07-18 | eee | 原 receipt=reject；sequence 1 supersession=approve；资料待补 |
| `release-owner` | 拥有语见发布仓库/镜像仓权限的技术负责人；能承担签名、回滚和证据归档 | bbb | 待补 | 待补 | 2026-07-18 | eee | Redis sequence 0=approve；Registry/KMS sequence 0/1=reject；资料待补 |
| `legal-owner` | 内部法务或外部执业律师；能对 LICENSE/NOTICE、source offer 和商标描述出具意见 | ccc | 待补 | 待补 | 2026-07-18 | eee | sequence 0/1=reject；资料待补 |
| `compliance-owner` | 语见AI内部中国数据/产品合规 DRI；能组织 PIPL、数据驻留、产品分发和上线条件复核 | ddd | 待补 | 待补 | 2026-07-18 | eee | 原 receipt=reject；sequence 1 supersession=approve；资料待补 |

## 3. 必须签字的决定

| Owner | 必须引用的证据 | 必须留下的决定 |
| --- | --- | --- |
| `security-owner` | commit、镜像 digest、当前/候选 run id、advisory 清单 | 修复、驳回或按 advisory 给出有到期日的例外；不得整体忽略扫描结果 |
| `release-owner` | 发布 commit、registry digest、Cosign identity/bundle、回滚版本 | 批准或驳回 RC，并确认回滚和归档位置 |
| `legal-owner` | 实际分发物 SBOM、LICENSE/NOTICE、上游版本与商标措辞 | 书面确认许可证义务、source offer 和商标使用边界 |
| `compliance-owner` | 部署/分发形态、数据流、区域、留存和当前法务意见 | 确认在中国上线的前置条件、阻断项和后续追踪人 |

## 4. 本次候选镜像的待决策输入

- Redis 7.2.14-alpine：Critical 从 11 降为 0，隔离竞争/重启/重建回归已通过；bbb 已签名
  approve，但 Registry/KMS freeze 的 sequence 1 仍为 reject，当前未批准部署。
- PostgreSQL 16.14 语见安全重建：Critical 0、High 0；许可证原文已进镜像，registry
  digest、OpenBao KMS 签名及 attestation 已验证；11 条迁移、事务/outbox/CAS、备份恢复和
  删除重建回归通过；aaa 当前 approve，
  ccc sequence 1 仍为签名 reject，ddd sequence 1 为 approve。
- OpenBao 2.5.4 语见安全重建：Critical 0、High 0；MPL-2.0 与依赖许可证已进镜像，
  registry digest、OpenBao KMS 签名及 attestation 已验证；2.4→2.5 三节点滚动升级、Raft
  快照恢复、TLS/HA、Transit 和 API key 生命周期/恢复回归通过；
  aaa/ddd 当前 approve，ccc sequence 1 仍为签名 reject。

扫描证据见
[`p1-supply-chain-candidate-evidence.json`](../acceptance/p1-supply-chain-candidate-evidence.json)
和
[`p1-remediated-candidate-evidence.json`](../acceptance/p1-remediated-candidate-evidence.json)。

## 5. 任命完成条件

- 四个主 Owner 均填写自然人实名、有效联系方式、任命日期和批准人。
- 任命记录由受任人或批准人书面确认，并归档到不含 secret 的证据包。
- 任命后另行完成候选镜像、许可证和发布签名决策；不将“已任命”写成“已批准”。

当前只完成“实名指定+批准人登记”；由于联系方式、备份人及受任人本人确认未补，
本节任命完成条件仍未全部满足。
