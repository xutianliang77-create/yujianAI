# M5 SIP、Ingress 与 Egress 实现记录

状态：`implemented-not-run`，Gate 5 未通过，SIP/Egress 默认关闭。

## 已实现

- Provider/SBC 边界：生产回调使用独立 credential，并强制部署侧 edge-attestation verifier；
  只保存 receipt digest、低基数 provider name、provider sequence 和 event time。乱序/重复事件
  不回退状态，入呼没有已验证证明不能被采用。
- Trunk/反欺诈：`SipTrunkV1` 只保存号码引用/哈希、KMS credential ref、TLS-SRTP 或
  provider-managed 安全方式、dispatch/fraud policy ref、目的前缀、国内/国际策略和费用/频率/
  并发上限；默认 E.164、国内和 allowlist fail-closed。
- 分布式准入：Redis Cluster same-slot Lua 分离 SIP 每分钟频率、活动并发、每日 micros 预算，
  以及 Ingress/Egress 活动容量。终态可由任意 media-ops 副本按确定性 key 释放；进程崩溃由
  有界 TTL 失败安全清理。
- 生命周期：入呼只由 provider callback 采用；外呼幂等，风险策略解析出的 trunk 回写 Call；
  DTMF/号码/幂等键只保存 SHA-256；transfer/hangup 经过授权与幂等；终态释放 lease。
- Ingress/Egress：官方 LiveKit adapter、HTTPS URL ingress SSRF literal/内部域拒绝、录制合规
  回执、稳定无凭据 object URI、CAS snapshot、provider callback、retention 删除和 deletion
  evidence 已接线。
- 计量/质量：migration 014 清除 002 表中的历史 raw idempotency key，新增不可变 provider
  usage、确定性 reconciliation、CAS checkpoint、SIP PDD/接通时长/DTMF 尝试摘要；低基数
  metrics 使用 provider allowlist，重复终态不重复发指标。
- 平台与控制台：platform-api 在媒体创建前执行 entitlement、运行时 quota 和 RBAC，写不含
  号码/目标的高风险 audit；静态控制台可创建/查询 Ingress/Egress/SIP，外呼后立即清空号码与
  DTMF。
- 生产门禁：media runtime 必须提供 persistence、provider、完整 admission、status verifier、
  reconciliation worker；SIP 还必须提供 durable lifecycle observer，Egress 必须提供 retention
  worker。Helm 使用 workload identity，不向 media-ops 注入长期 LiveKit secret。

## 未执行

按用户要求，本轮未执行 build/lint/test、OpenAPI/Helm 校验、migration 014、Redis 多副本竞争、
SBC/TLS/SRTP、真实运营商/号码、LiveKit SIP/Ingress/Egress、对象存储、provider webhook/账单、
Prometheus/Grafana 或故障/灾备演练。

## Gate 5 不可替代项

源码不能替代运营商合作条件、适用资质、反骚扰/实名/录音告知法律签字。后续必须用不可变
commit/image digest 绑定真实 trunk、SBC 安全配置、号码范围、provider receipt、对象删除、
账单差异和电话质量报告；任何一项缺失时 SIP/Egress 保持关闭。
