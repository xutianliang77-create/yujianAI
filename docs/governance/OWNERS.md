# 语见AI角色 Owner 与 Gate 责任矩阵

版本：v1.1

日期：2026-07-18

状态：角色已定义；P1-M0-04 四类个人负责人已指定、签字待补；其他角色待指派

本文件只定义工程角色责任，不把角色名误认为已经完成的法务、合规或发布签字。每个
Gate 关闭前必须把个人负责人、评审记录、commit、manifest 和回滚方案写入对应证据包。

| Owner 角色 | 责任范围 | 必须签字/确认的 Gate | 当前个人负责人 |
| --- | --- | --- | --- |
| `product-owner` | 产品范围、非目标、Preview/GA 决策 | Gate 0、Gate 10 | 待指派 |
| `platform-owner` | Tenant、IAM、API、Token、quota、控制面合同 | Gate 0、Gate 2、Gate 6 | 待指派 |
| `rtc-owner` | LiveKit 版本、Room/Track、节点、TURN、质量矩阵 | Gate 0、Gate 1、Gate 3 | 待指派 |
| `agent-owner` | Worker、dispatch、provider、tool policy、5090 runtime | Gate 4 | 待指派 |
| `data-owner` | PostgreSQL、Redis、migration、usage、outbox、恢复 | Gate 2、Gate 3、Gate 9 | 待指派 |
| `security-owner` | Threat model、RBAC、secret、供应链、渗透和漏洞门禁 | Gate 0、Gate 1、Gate 2、Gate 7 | aaa |
| `compliance-owner` | PIPL、等保、AI 内容和数据留存适用性 | Gate 0、Gate 5、Gate 6、Gate 10 | ddd |
| `legal-owner` | LICENSE/NOTICE、商标、ICP/增值电信、DPA | Gate 0、Gate 5、Gate 10 | ccc |
| `telephony-owner` | SIP、号码、运营商、录音和反欺诈 | Gate 5 | 待指派 |
| `sre-owner` | K8s、发布、备份恢复、SLO、故障演练和 on-call | Gate 3、Gate 8、Gate 9 | 待指派 |
| `release-owner` | SBOM、签名、镜像、RC/GA、证据归档 | Gate 1、Gate 7、Gate 8、Gate 10 | bbb |

## Owner 使用规则

1. 角色 owner 可以先负责实现，但不能代替需要独立性的 security/legal/compliance 评审。
2. `待指派` 的个人负责人不阻止代码开发，但阻止对应 Gate 关闭和公网/商业能力启用。
3. 高风险能力（SIP、录音、Agent 高风险工具、外部 provider）必须同时有 capability owner、
   security owner 和 compliance/legal owner 的记录。
4. 证据包只能引用不含 secret、JWT、真实号码、录音或用户正文的脱敏报告。

## 当前阻断记录

| 任务 | 需要的角色 | 个人负责人 | 证据 | 状态 |
| --- | --- | --- | --- | --- |
| P1-M0-04 供应链/许可证 | `security-owner`、`release-owner`、`legal-owner`、`compliance-owner` | aaa / bbb / ccc / ddd；由 eee 于 2026-07-18 指定；联系/备份/签字待补 | `docs/acceptance/p1-supply-chain-evidence.json`、`docs/acceptance/p1-supply-chain-candidate-evidence.json`、`docs/governance/P1_M0_04_OWNER_NOMINATION.md` | 当前镜像 76 个未豁免 Critical；候选仅 Redis 可进回归，PostgreSQL/OpenBao 仍阻断；阻断 Gate 0/1 和生产发布 |

四类角色的资格、职责分离和待填字段见
[`P1_M0_04_OWNER_NOMINATION.md`](P1_M0_04_OWNER_NOMINATION.md)。该记录只证明责任角色
和待办已经可审计，不表示个人 Owner 已完成本人确认、专业决策或 Gate 签字。
