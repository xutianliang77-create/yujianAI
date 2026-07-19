# @yujian/license-service

私有化许可证使用 Ed25519 detached signature。`issueLicense` 强制 feature allowlist、节点上限、
最长有效期和 grace 上限；`verifyLicense` 使用同一 canonical payload，拒绝未知字段、非法时间、
非 Ed25519 key 和过期文档。

签发命令：

```bash
npm run build -w @yujian/license-service
YUJIAN_LICENSE_PRIVATE_KEY_FILE=/secure/offline/issuer.pem \
  npm run private:issue-license -- request.json policy.json customer/license.json
```

私钥只从独立文件读取，不进入 license、manifest、离线包或日志。输出文件使用 `wx` 创建并附带
SHA-256 manifest；客户仅获得 license JSON 与发行公钥。真实 HSM/KMS custody、客户交付和断网
grace 演练未执行前，License Gate 仍保持未通过。
