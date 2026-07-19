# P1：M0/M1 关闭计划

版本：v1.0  
日期：2026-07-17  
状态：P1-M0-03 运行证据已补；P1-M0-04 的 PostgreSQL/OpenBao 安全重建已达零 Critical，
Redis 隔离回归通过但未获部署批准；安全重建和生产 OCI 技术签名达到 Critical 0/High 0，
bbb 已签名批准 Redis，Registry/KMS freeze 已追加 sequence 1 reject；aaa 安全已由原始 reject
追加为 sequence 1 approve；ccc 法律已追加 sequence 1 reject，ddd 中国分发已追加 sequence 1 approve；
PostgreSQL/OpenBao 隔离生产回归已通过且当前 P2 未切换；335 条原始许可证声明缺口已由
签名结论层全部分类且实际源码随包提供，但 `reedsolomon v1.0.0` 仍有 1 个法律待判项；
两项当前驳回、aaa 原始决定 audit 缺口和专业资格材料仍阻断；
五份 receipt 已由 `owner-receipt-audit/v2` adapter 归一化并通过 fail-closed verifier；
完整 Gate 0/1 未通过

本计划把当前审计中的 P1 缺口拆成可审查任务。每项任务必须关联 owner、commit、运行报告
和回滚方案；没有运行证据的任务只能标记 `implemented-deferred`，不能标记 Gate 通过。

## 任务清单

| ID | 工作包 | 当前状态 | Owner | 退出证据 |
| --- | --- | --- | --- | --- |
| P1-M0-01 | ADR-0001..0004 owner、评审人和 review date | role-defined；个人待指派 | `platform-owner` + `security-owner` | ADR 评审记录、冲突决策和回滚说明 |
| P1-M0-02 | PIPL/等保/ICP/AI/SIP 适用性与阻断条件 | role-defined；法律结论待补 | `compliance-owner` + `legal-owner` | 适用性结论、owner、签字或 blocker |
| P1-M0-03 | clean upstream mirror、patch replay、digest 复现 | Beelink 真实 10 bare mirror/fsck、11 component replay 和重复 clean build/核心包静态测试已通过；owner 审批/fork 权限待补 | `rtc-owner` + `release-owner` | `p1-upstream-evidence.json`、mode 0600 原始报告、artifact SHA-256 |
| P1-M0-04 | LICENSE/NOTICE、SBOM、漏洞与签名策略 | 当前 4 镜像仍为 76 Critical/465 原始 `NOASSERTION`；Redis 与 PostgreSQL/OpenBao 隔离生产回归通过但未部署；PostgreSQL/OpenBao 与 Registry 重建达到 Critical 0/High 0，四个 OCI 签名/attestation/外部读取通过；335 条安全重建原始声明已在独立签名结论层中全部分类，`licenseConcluded=NOASSERTION` 为 0，实际 OpenBao 源码已随包提供；`reedsolomon v1.0.0` 保留 1 个法律待判项；bbb Registry/KMS 与 ccc 法律 sequence 1 仍为签名驳回，另有 aaa 原始决定 audit 和专业资格缺口 | `legal-owner` + `release-owner` + `security-owner` + `compliance-owner` | 当前/候选/安全重建/生产 OCI/生产回归/license-remediation evidence、五份原始 receipt、aaa、bbb Registry/KMS、ccc 与 ddd supersession、逐序号 audit 和 v2 verifier；驳回项如需改变必须走 supersede 流程 |
| P1-M1-01 | Web/Flutter/Node 已通过基线；补 iOS/Android/Python | A-C passed；Python smoke harness added；iOS/Android/Python runtime deferred | `rtc-owner` | 每个 SDK 的 token/join/audio/Data/RPC/reconnect 报告 |
| P1-M1-02 | 视频、屏幕共享、mute/unpublish、订阅失败 | Web/Flutter/Node synthetic camera/screen + lifecycle checks added; runtime deferred；subscription-failure injection pending | `rtc-owner` | Web/Flutter/Node TrackSubscribed、bytes/stats 报告 |
| P1-M1-03 | TURN、UDP 禁用后的 TCP/TLS、弱网、reconnect | SDK synthetic reconnect + Linux netem runner added; real network/TURN not verified | `rtc-owner` + `sre-owner` | 网络矩阵、ICE candidate、恢复时间和失败注入报告 |
| P1-M1-04 | RTT、jitter、packet loss、bitrate、freeze 和 P50/P95/P99 | Web receiver sample + server telemetry P50/P95/P99 contract; runtime/aggregation deferred | `rtc-owner` + `data-owner` | 客户端采样、服务端聚合、Prometheus/OTel 对照 |
| P1-M1-05 | Webhook 签名、生命周期、重试、乱序、replay/DLQ | adapter/SQL boundary + publisher unit tests added；runtime deferred | `platform-owner` + `security-owner` | provider webhook 端到端报告和审计记录 |
| P1-M1-06 | nightly sandbox：租户隔离、短期凭据、自动销毁 | digest/credential lifecycle runner + scheduled workflow added; runtime deferred | `sre-owner` + `security-owner` | nightly run、资源清理、失败告警和访问审计 |

## Gate 0 退出条件

- [ ] `docs/governance/OWNERS.md` 中每个阻断项有个人 owner。
- [ ] ADR、LICENSE/NOTICE、合规适用性和威胁模型有当前版本评审记录。
- [ ] clean upstream 与语见发行版可用同一测试套件重放，冲突会失败。
- [ ] 当前 manifest、SBOM、签名和漏洞扫描证据可复现。

## Gate 1 退出条件

- [x] Beelink 双节点 Node、Web/Flutter Web 音频、Data/RPC baseline。
- [ ] iOS、Android、Python 目标运行证据。
- [ ] 视频、屏幕共享、mute/unpublish、reconnect。
- [ ] TURN/TCP/TLS、弱网和质量指标基线。
- [ ] Webhook 全生命周期、replay/DLQ 和安全证据。
- [ ] nightly sandbox 与供应链证据。

Gate 1 在所有未勾选项完成前保持未通过；当前只能称为 **A-C baseline passed**。
