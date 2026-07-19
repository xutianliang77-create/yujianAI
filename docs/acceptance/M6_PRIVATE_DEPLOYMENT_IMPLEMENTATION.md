# M6 私有化部署与国内生态实现状态

状态：`implemented-not-run`。本文件只证明源码和合同已实现，不证明任何客户环境、云账号、
Kubernetes 集群、企业 IdP、OpenBao、模型 provider、HarmonyOS 或小程序真机已经验收。

## 已实现

- M6-01：`YujianPlatform` CRD、namespace RBAC、轮询 Operator、摘要锁定 Helm executor、atomic
  upgrade/approved rollback，以及拒绝软链接/覆盖/空文件的离线 bundle 生成器。
- M6-02：生产 values 强制 external-HA、PG/Redis TLS、三个故障域和 topology evidence ref；
  capacity planner 输出 RTC/TURN/PG/Redis 初始拓扑和 RPO/RTO 目标。
- M6-03：`OpenBaoTransitKmsAdapter` 使用 derived Transit key、短期 token lease 和 canonical
  encryption context；保留 HTTPS KMS/object/log gateway adapter。
- M6-04：RS256 OIDC、Ed25519-attested SAML gateway、SCIM 2.0 cursor 同步，以及对象存储
  JSONL 审计导出。
- M6-05：001–015 连续 migration、schema skew/previous-image preflight、digest-verified chart
  pull、atomic upgrade 和只回滚工作负载不降级数据库的策略。
- M6-06：Ed25519 canonical license 签发/验签、feature/node/validity/grace policy、一次性文件
  输出和不含私钥的 distribution manifest。
- M6-07：远程巡检/执行 permission、稳定审批 receipt 绑定、一次性 grant/session token、最长
  900 秒执行窗口、命令分类授权和只保存 command digest 的不可变审计。
- M6-08：国内 `cn-*` region OpenAI-compatible LLM provider factory，凭据只由短期 credential
  lease 注入，沿用 deadline、限长、usage、熔断和低基数 telemetry。
- M6-09：HarmonyOS WebView/微信小程序受限 client adapter；只负责控制面 token 和原生 RTC
  bridge 能力门禁，不复制 LiveKit media core。
- M6-10：客户 acceptance report 生成器、SHA-256 manifest、对象存储归档与 PostgreSQL
  scope/digest/outcome 索引。

## 未执行验证

按用户要求，本阶段没有运行 build/lint/test、JSON/YAML/OpenAPI verifier、migration 015、
Helm/Kubernetes/Operator、离线 OCI bundle、PG/Redis HA、OpenBao Transit、OIDC/SAML/SCIM、
国内模型调用、HarmonyOS/小程序真机或客户安装/升级/回滚/恢复演练。

因此 M6 开发实现完成，但私有化 Gate、客户验收和 GA 兼容性均未通过。
