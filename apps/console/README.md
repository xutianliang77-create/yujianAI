# 语见AI 控制台 onboarding

`index.html`、`app.js` 和 `styles.css` 提供一个无框架静态控制台：健康/就绪检查和短期
Room token quickstart、Preview entitlement/配额/用量、支持工单，以及 environment-scoped
webhook destination 的列出、保存和禁用，以及 Ingress/Egress/SIP 的创建和查询。生产媒体
请求仍由服务端 entitlement、合规、风险、预算和 provider gate 判定；页面确认不会绕过这些
约束。凭据只保存在页面内存，号码和 DTMF 在提交后立即清空，响应中的 token/secret/
credential 自动脱敏；它不直接访问
LiveKit API secret、数据库、Redis 或模型服务。

生产部署优先与 platform-api 同源托管；若跨域，设置 `YUJIAN_PLATFORM_CORS_ORIGIN` 为精确
origin。Tenant/Project/Environment 的管理员创建仍按 `quickstart.http` 使用 admin credential，
前端不绕过控制面授权。
