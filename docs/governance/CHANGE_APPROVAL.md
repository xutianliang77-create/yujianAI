# 变更审批矩阵

| 变更 | 必须审批 |
| --- | --- |
| LiveKit 版本/协议/媒体 patch | RTC owner + security + legal/NOTICE owner |
| Token grant、权限、API key、KMS | platform owner + security |
| SIP/外呼/录音/模型 provider | capability owner + compliance/legal |
| 数据库 migration/outbox/usage | data owner + SRE |
| 公网/私有化 release | release owner + SRE + security + product |

审批记录要关联 commit、manifest、风险和回滚方案；未审批的能力保持 feature-disabled。
