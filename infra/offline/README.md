# 语见AI 离线包边界

离线包必须包含：Helm chart、锁定的 LiveKit 镜像 digest、平台 API 镜像 digest、SBOM、签名和升级预检清单。

离线运行只允许使用客户注入的 PostgreSQL/Redis/KMS/对象存储与 OIDC 端点；禁止默认回连语见外部服务。secret 通过安装时的 Kubernetes Secret 或客户 KMS 绑定提供，不进入压缩包。

安装或升级前运行 `npm run private:upgrade-preflight`。未提供运行时 schema/image 环境变量时，
工具只输出声明式迁移清单；实际升级必须同时提供 `YUJIAN_CURRENT_SCHEMA_VERSION`、
`YUJIAN_TARGET_SCHEMA_VERSION` 和上一版 `YUJIAN_PREVIOUS_IMAGE_DIGEST`，并通过 release manifest
的 schema skew 与回滚策略校验。迁移仅支持向前升级，禁止把回滚伪装成 SQL 降级。

使用 `npm run private:create-offline-bundle -- <inventory.json> <new-output-directory>` 生成客户包。
生成器拒绝软链接、空文件、重复名称和覆盖目标目录，将每个 OCI image archive、Helm chart、
SBOM 与签名 bundle 复制为普通文件并计算 SHA-256。随后设置
`YUJIAN_OFFLINE_ARTIFACT_ROOT=<output-directory>` 执行 `verify-offline-manifest.mjs`；只有实际
文件与 manifest 全部匹配才是可交付离线包，仓库内带占位符的声明清单不算验收证据。
