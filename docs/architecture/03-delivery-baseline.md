# 交付基线

版本：v2.0  
日期：2026-07-17  
状态：实现基线（运行验证 deferred）

## 1. 交付形态

| 形态 | 目标客户 | 语见负责 | 客户负责 |
| --- | --- | --- | --- |
| 托管云 | 开发者、SaaS、中小企业 | 控制面、RTC、升级、容量、安全和支持 | 应用、token 后端、内容和终端 |
| 专有云 | 大型企业、监管行业 | 独占控制面/RTC、升级工具和 SRE 服务 | 网络、身份、数据策略和联合运维 |
| 私有化 | 数据不出域客户 | 安装包、Helm/Operator、验证和支持 | 集群、域名、证书、存储、备份和日常运维 |
| 开源自托管 | 社区和开发者 | 上游兼容代码、文档和社区发行 | 全部部署与运维 |

## 2. 区域规划

首版托管云按“华北、华东、华南”设计区域策略，但区域和运营商覆盖仅在资源与合规
评审完成后承诺。

每个生产区域至少具备：

- 两个故障域的 LiveKit 节点。
- 独立 TURN 容量和公网出口监控。
- 控制面多副本和数据库高可用。
- 对象存储、日志和指标的数据驻留配置。
- 区域容量上限、准入策略和灾难恢复手册。

## 3. 服务等级目标

以下是设计目标，不是当前承诺：

| 指标 | Preview | GA 目标 |
| --- | --- | --- |
| 控制面月可用性 | 99.5% | 99.9% |
| RTC 信令月可用性 | 99.9% | 99.95% |
| Room join 成功率 | ≥99.5% | ≥99.9% |
| Token API P95 | <300 ms | <150 ms |
| 同区域音频端到端 P95 | 建立基线 | 按场景承诺 |
| RPO | 24 h | ≤15 min |
| RTO | 4 h | ≤60 min |

媒体延迟必须按设备、运营商、网络类型、编解码器和地域分层，不用单个实验室数字代替
生产 SLO。

## 4. 环境

| 环境 | 用途 | 数据规则 |
| --- | --- | --- |
| local | 单机开发与合同测试 | 仅合成数据 |
| integration | 多服务集成 | 自动生成短期测试数据 |
| staging | 发布候选与压测 | 禁止复制生产正文和密钥 |
| production | 正式服务 | 最小权限、审计和数据驻留 |
| private-validation | 私有化离线验收 | 客户环境内生成数据 |

当前 `integration` 的唯一物理服务器是 Beelink：Linux `x86_64`、Tailscale
`100.110.127.117`、单 NVIDIA GeForce RTX 5090。两个 RTC 节点在该机运行并共享
Redis；RTX 5090 保留给 Agent/模型 runtime。该配置不代表 production 容量或高可用，
也不能替代双故障域设计。

不同环境不得共享：

- API secret
- KMS key
- 数据库
- 对象存储 bucket
- SIP credential
- Agent provider credential

## 5. 私有化交付包

每个发行版本包含：

- 锁定 digest 的容器镜像清单。
- Helm chart 或 Operator 与默认 values schema。
- SBOM、许可证清单、漏洞扫描和签名证据。
- 容量规划表、网络端口表和依赖矩阵。
- 安装、升级、回滚、备份、恢复和卸载手册。
- 离线镜像包与 checksum。
- 健康检查、兼容性测试和验收报告模板。
- 支持包采集工具，默认脱敏且不采集媒体正文。

## 6. 发布通道

| 通道 | 用途 | 升级策略 |
| --- | --- | --- |
| nightly | 内部兼容与上游同步 | 不保证升级 |
| preview | 设计伙伴试用 | 可破坏，但提供迁移说明 |
| stable | 一般生产 | 语义化版本、回滚与支持周期 |
| lts | 私有化和监管行业 | 安全修复、有限功能变更 |

LiveKit 上游升级先进入 nightly，完成协议、SDK、媒体和数据迁移测试后才能进入 stable。

## 7. 容量与准入

每个区域、租户和环境至少设置：

- 并发 Room、Participant、Publisher 和订阅数。
- 音视频码率与 Track 数。
- Data Packet、Data Stream 和 RPC 速率。
- Agent dispatch、worker 并发、模型 QPS 和 token 上限。
- SIP 并发、呼叫频率、目的地区和单呼叫时长。
- Ingress/Egress 并发、录制时长和对象存储上限。

超限必须返回稳定错误码，并产生配额事件和审计；不得依赖节点 OOM 作为限流方式。

## 8. 可观测基线

### RTC

- join 成功率与耗时
- ICE 连接类型与 TURN 比例
- RTT、jitter、packet loss
- 音频 concealment、视频 freeze 和 bitrate
- reconnect、migration、disconnect reason

### Agent

- dispatch 等待、worker 接受和启动耗时
- 模型首包、首字、首音频与总延迟
- provider 错误、重试、取消和降级
- 工具调用授权、耗时和结果

### 平台

- API P50/P95/P99
- 配额拒绝和限流
- 用量入账延迟与重复率
- Webhook 成功率和重试
- 数据库、Redis、队列、对象存储和 KMS 健康

所有指标必须包含 `region`、`service`、`version` 和受控的租户维度，禁止把高基数
participant identity 直接作为指标标签。

## 9. 安全基线

- mTLS 或等价服务身份用于内部管理接口。
- API secret、SIP credential 和 provider key 通过 KMS envelope encryption 保存。
- 容器最小权限、只读文件系统和非 root 运行，例外需记录。
- 互联网入口设置 WAF、DDoS、防重放、速率和 payload 上限。
- 发布物必须有签名、SBOM、依赖锁和漏洞门禁。
- 生产运维采用审批、短期权限、操作审计和 break-glass 机制。

## 10. 中国合规交付清单

正式商用前逐项确定“适用/不适用/待法律意见”：

- ICP 备案或许可。
- 增值电信业务经营许可范围。
- 网络安全等级保护。
- 个人信息保护影响评估。
- 数据出境、境内存储和跨境 provider。
- 算法备案、生成合成内容标识或安全评估。
- SIP trunk、号码、外呼和呼叫中心规则。
- 录音告知、内容安全和未成年人保护。

参考：

- [增值电信业务经营许可办事指南](https://gdca.miit.gov.cn/bsfw/bszn/jyxk/tzgg/art/2025/art_9802f0eeae4647b5bc22a6af33ae0bf7.html)
- [生成式人工智能服务管理暂行办法](https://www.cac.gov.cn/2023-07/13/c_1690898326795531.htm)
- [人工智能拟人化互动服务管理暂行办法](https://www.cac.gov.cn/2026-04/10/c_1777558395078289.htm)
