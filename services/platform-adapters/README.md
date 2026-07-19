# `@yujian/platform-adapters`

模块提供 KMS、对象存储、企业身份和日志导出合同，以及一个不绑定厂商的 HTTPS adapter
实现。HTTP adapter 只通过 `x-yujian-adapter-token` 发送注入的服务凭据，限制请求超时、
对象大小和签名 URL 有效期；默认拒绝非 loopback 明文 HTTP，并严格校验 canonical base64、
算法、subject、对象 key、URI 和 expiry 响应。

`HttpKmsAdapter`、`HttpObjectStorageAdapter`、`HttpIdentityAdapter` 和
`HttpLogExportAdapter` 对接客户域内的 gateway。gateway 仍必须由客户提供真正的 KMS、
S3 兼容对象存储、OIDC/SAML 或日志系统；本包不内置密钥、云厂商账号或公网回调。

`OidcIdentityAdapter` 提供不依赖第三方运行时的 RS256/JWKS token 校验：校验 issuer、audience、
签名、`exp`/`nbf`，并从受控 claims 提取 tenant/roles。

`OpenBaoTransitKmsAdapter` 是首个具体 KMS 实现：只接受 HTTPS/loopback、短期 token lease，
并要求 Transit key 使用 derived-key 模式，让排序后的 tenant encryption context 参与加解密。
存储层只持有 `vault:vN:*` ciphertext，不持有 OpenBao token 或私钥。

`SamlGatewayIdentityAdapter` 将 XML-DSig 解析留在部署方 SAML gateway，并再次校验 gateway 的
Ed25519 detached attestation、audience 与有效期；`ScimDirectorySyncAdapter` 支持 SCIM 2.0
分页/cursor 增量同步；`ObjectStorageAuditExportAdapter` 只导出低基数、摘要化 JSONL。
任何身份 adapter 都不能把未验证的前端 claims 直接当作 RBAC 依据。

`OidcPlatformIdentityBridge` 可把已验证的 OIDC subject 交给部署侧 scope resolver，映射到单一
tenant/project/environment 和最小角色/权限集合，再注入 platform-api 的
`PlatformIdentityProvider`。未解析或多义身份必须拒绝。
