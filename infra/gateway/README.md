# 公网入口安全边界

Platform API 不直接承担公网 TLS/WAF/DDoS；生产入口由客户/云网关提供。网关必须配置
TLS 1.2+、HSTS、payload/连接/请求速率上限、可信 proxy header、证书轮换和脱敏审计日志。
UDP/TCP/TLS TURN 入口单独限流，不能与控制面共享凭据。

`edge-security-contract.json` 冻结厂商无关的入口合同。公网 HTTP 只允许 `/platform/*` 和
`/healthz`；`/internal/*`、`/metrics`、`/readyz` 必须保持集群内访问。Helm 的可选
`platform-api-ingress.yaml` 只创建这两类 route，并要求：

- 精确 ingress controller namespace/pod selector，NetworkPolicy 不接受任意 namespace；
- TLS Secret、ingress class 和唯一 host；
- WAF policy、网络 DDoS policy 和证书 rollover plan 的证据引用；
- provider-specific annotation 由部署方注入，本仓库不虚构已开通的云防护。

证书轮换先复制 `certificate-rollover-plan.example.json`，填入当前/下一张公钥证书的绝对路径、
SHA-256 fingerprint、激活和回滚窗口，再执行：

```bash
npm run gateway:verify-certificate-rollover -- /absolute/path/to/plan.json
```

校验器只读取 X.509 公钥证书，检查 SAN、有效期、双证书重叠和不可变 fingerprint；它明确拒绝
需要读取私钥的计划，也不会更新 Secret、切换流量或把“ready”写成已完成轮换。模板中的
placeholder 故意不能通过校验。

`nginx.conf.example` 仅是语义参考，不等于生产 WAF/DDoS。真实 provider policy、origin bypass
阻断、证书 Secret 更新、回滚和外部扫描仍必须形成运行证据。
