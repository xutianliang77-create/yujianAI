# Realtime Cloud Preview 试用计划

Preview 只开放 RTC、token、Room/Participant、Data/RPC 和基础 telemetry；SIP、外呼、录制
和高风险 Agent tool 默认关闭。每个设计伙伴独立 environment、短期 API key 和配额，使用
合成数据，试用结束后撤销 key、导出审计并删除测试资源。

试用入口：管理员创建 Tenant → Project → Environment → API key → quickstart Room。支持包
只允许导出脱敏诊断，不能导出音频、视频、手机号或用户正文。上线前必须完成合规清单和
Beelink 双节点运行验收。
