# 验收任务与计划

版本：v2.0  
日期：2026-07-17  
状态：执行稿（实现与运行证据分离；运行验收等待 Beelink）

## 1. 验收原则

- 验收按证据 Gate 进行，不以“演示成功一次”代替可重复结果。
- clean upstream 和语见发行版使用相同核心兼容测试。
- 托管云与私有化共享合同验收，部署差异单独验收。
- 媒体质量按地域、运营商、设备、SDK 和网络条件分层。
- 许可、备案和运营商合作未完成时，对应商业能力不得标记通过。

## 2. 证据包

每个 Gate 交付：

- 版本 manifest、Git commit、image digest。
- 配置和环境说明，不含 secret。
- 自动测试报告。
- 媒体/负载/故障数据。
- 安全、许可证和 SBOM 报告。
- 缺陷、豁免、风险 owner 和到期时间。
- 安装、回滚和复现命令。

## 3. Gate 0：设计与上游基线

验收项：

- 产品章程明确 RTC/Agent 平台和非目标。
- LiveKit 组件和 SDK 版本冻结。
- LICENSE、NOTICE、商标和第三方依赖评审。
- 平台边界、ID、API、事件和数据模型批准。
- 历史翻译合同不进入默认构建或发布。
- 合规适用性清单有结论或明确 blocker。

阻断：

- 计划直接修改上游协议而无兼容方案。
- 计划复制旧项目 secret、数据或整库。
- 首区、数据驻留或 SIP 合规边界完全未定义。

## 4. Gate 1：LiveKit 兼容

### 4.1 Token

- 正确 grant 可加入、发布、订阅和执行允许操作。
- 过期、错误 audience、错误签名和越权 grant 被拒绝。
- 最小 TTL、轮换和撤销策略生效。
- token 不进入日志、错误、URL 或 trace。

### 4.2 Room API

- 创建、列举、获取、更新 metadata 和关闭 Room。
- 列举、更新权限和移除 participant。
- 目标 Server SDK 的请求和响应兼容。
- 错误码和重试行为记录在兼容矩阵。

### 4.3 跨 SDK

至少覆盖：

- JavaScript Web
- Flutter
- iOS
- Android
- Node.js Server
- Python Server/Agent

核心用例：

- 两端加入。
- 发布/订阅音频。
- 发布/订阅视频。
- 屏幕共享。
- mute/unmute。
- reconnect。
- Data Packet/Data Stream/RPC。

M1 Beelink 双节点专项还必须记录：

- Node.js、Web 和 Flutter 分别从 primary/secondary 入口加入同一 Room。
- Node.js PCM 和 Web Audio 发布后，另一节点的 `TrackSubscribed`、`source=microphone`、
  publisher identity 与 RTP bytes 校验。
- Flutter Web 使用官方 `livekit_client 2.8.1` 发布音频并在另一节点校验
  `TrackSubscribedEvent`、`RemoteAudioTrack.getReceiverStats().bytesReceived > 0`。
- `/readyz` 同时返回两个节点健康结果；节点故障不被误报为已通过的 HA/failover。

### 4.4 Webhook

- 签名验证。
- Room、participant、track 生命周期。
- 重复、乱序、重试和 replay。
- 未知字段兼容。

通过条件：目标矩阵中 `compatible` 用例 100% 通过；有限兼容项有文档和替代方案。

## 5. Gate 2：控制面

### 5.1 Tenant 隔离

- 跨 tenant IDOR、查询、缓存和对象存储访问被拒绝。
- 不同 environment key 不能交叉使用。
- suspended tenant 不能创建新 token/任务。
- 管理员和 support operator 操作有审计。

### 5.2 Secret

- 创建只显示一次。
- 数据库无明文 secret。
- 轮换和双 key 过渡。
- 撤销传播在目标时间内完成。
- 日志、trace、support bundle 无 secret。

### 5.3 Onboarding

- 新用户从注册到两端音频不超过目标时间。
- quickstart 在干净环境可复现。
- 错误提示包含 request ID 和可操作建议。

### 5.4 Quota

- participant、Room、数据、Agent 和媒体任务上限有效。
- 并发竞争不会突破硬上限。
- 超限错误稳定且产生事件/审计。
- 临时配额按时失效。
- 多副本 token 请求使用 Redis `tokenQuota` reservation，不依赖单进程计数；重试和释放不造成
  并发计数泄漏。
- `resourceUsage` 同时覆盖 durable media/Agent 计数与 RTC 实时计数；缺失 provider 时生产
  进程拒绝启动，不以零值放行配额。
- outbox webhook 投递失败按指数退避；`next_attempt_at` 到期前不重复领取，达到最大尝试后写入
  `dead_lettered_at`，失败状态存储异常也必须保留可审计的失败记录；运维 replay 只能重新排队
  未发布的 dead-letter 事件。
- production platform-api 必须启动 `OutboxPublisherWorker`；停止 HTTP server 时 worker 先停止领取，
  多副本依靠 PostgreSQL `SKIP LOCKED` 不重复投递。

### 5.5 控制面和媒体恢复

- platform runtime 缺少 persistence、rate limiter、resource usage 或 token quota 时启动失败。
- platform persistence 缺少 `listUsage/listAudit` durable read projection 时 production 启动失败；
  `/usage` 和 `/audit` 重启后必须读取 PostgreSQL，不得返回进程内空列表。
- platform runtime 缺少 `storePersistence` 时 production 启动失败；重启后 Tenant/Project/
  Environment、API key metadata/hash、usage/audit/outbox snapshot 可恢复，快照中不得出现明文
  API secret；多副本 stale writer 触发 version CAS 冲突，不得覆盖较新的 snapshot。
- media-ops 重启后从 `004_media_ops.sql` snapshot 恢复资源、幂等指纹和 transfer/hangup 结果。
- media-ops/Agent Control 多副本 stale snapshot 写入触发 CAS 冲突，不得覆盖新状态。
- snapshot 写入失败时请求不返回成功；恢复后的重复请求不能再次调用上游 provider。

## 6. Gate 3：媒体质量与容量

### 6.1 网络矩阵

至少覆盖：

- 中国移动/联通/电信。
- Wi-Fi、4G/5G 和有线。
- 华北、华东、华南测试点。
- iOS、Android、Chrome、Safari。

### 6.2 弱网

注入：

- 1%、3%、5%、10% 丢包。
- 50/100/200 ms RTT。
- jitter。
- 上下行限速。
- UDP 禁用、TURN TCP/TLS。
- Wi-Fi/蜂窝切换。

采集：

- join time/success。
- audio concealment。
- video freeze ratio。
- bitrate/resolution。
- reconnect time/success。

### 6.3 容量

代表场景：

- 1:1 音视频。
- 小组语音。
- 主播 + 多订阅者。
- 多发布者会议。
- Data/RPC 高频但在配额内。

每个场景输出：

- 单节点安全容量。
- CPU、内存、网络和 TURN。
- P50/P95/P99。
- 扩缩阈值和容量余量。

### 6.4 长稳

- 24 小时：每个 RC 必跑。
- 72 小时：Preview/GA Gate。
- 节点内存、goroutine、连接、Redis 和质量无不可接受漂移。

## 7. Gate 4：Agent

### 7.1 生命周期

- worker 注册、接受 job、加入 Room、退出和 drain。
- artifact digest、签名和 SBOM。
- production 缺少 `YUJIAN_AGENT_ARTIFACT_VERIFIER_MODULE` 时 Agent Control 必须拒绝启动；
  verifier 返回拒绝时 artifact 不得进入 deployment。
- canary、rolling、rollback。
- worker crash 和节点驱逐恢复。

### 7.2 延迟

按 provider 和场景记录：

- dispatch wait。
- worker startup。
- 模型连接。
- first token/first audio。
- end-to-end response。

### 7.3 故障

- 无 worker 容量。
- provider timeout/rate limit/outage。
- secret 无效。
- Room 提前结束。
- 客户取消。
- rollout 新版本错误率上升。

结果必须受 deadline、并发和预算限制，不产生孤儿任务或持续计费。

### 7.4 工具

- L0/L1/L2/L3 权限。
- L2 显式授权。
- 幂等和重复执行。
- 人工接管。
- 审计和敏感字段脱敏。

## 8. Gate 5：SIP、Ingress 与 Egress

### 8.1 SIP

- inbound/outbound。
- busy/no-answer/reject/timeout。
- DTMF。
- hangup 和转接。
- provider webhook 重复/乱序。
- 幂等外呼。
- 并发、频率、目的地区和费用熔断。

### 8.2 电话质量

- PDD、接通率、单通/无声、丢包、DTMF 成功率。
- 不同运营商和号码类型。
- SIP/TLS/SRTP 或 provider 可用的安全配置。

### 8.3 Ingress/Egress

- 每个支持协议/输出格式。
- 对象可播放、校验和、生命周期和删除。
- 长任务取消和失败清理。
- 存储不可用、配额不足和网络中断。
- 重复创建不产生重复计费。

### 8.4 合规 Gate

- 资质和合作条件书面确认。
- 录音告知与授权。
- 外呼反骚扰、实名和目的地区策略。
- 未通过时能力保持禁用。

## 9. Gate 6：计量与账单

- 原子 usage 与资源生命周期可对账。
- 重复事件不重复计费。
- 迟到事件和冲正。
- 价格版本在时间边界正确应用。
- provider 账单差异在阈值内。
- tenant/project/environment 聚合一致。
- 预估与已结算状态清晰。
- 导出总额与账单一致。

财务验收必须由产品、工程和财务共同签字。

## 10. Gate 7：安全

### 10.1 应用安全

- 认证、RBAC、IDOR、CSRF、SSRF、注入、上传和 webhook。
- API/WebSocket 限流和 payload 上限。
- tenant 隔离和 support 权限。

### 10.2 RTC

- token grant 越权。
- Room metadata/attributes 注入和大小限制。
- 非授权发布/订阅。
- TURN credential 滥用。
- 恶意连接和资源耗尽。

### 10.3 Agent

- artifact 供应链。
- prompt/tool 注入的权限边界。
- secret exfiltration。
- egress network policy。
- 高风险工具授权绕过。

### 10.4 SIP/媒体

- toll fraud。
- 暴力呼叫和扫描。
- 录制未授权访问。
- 签名 URL 泄漏。

### 10.5 供应链

- SBOM 完整。
- 无 critical 未豁免漏洞。
- 镜像签名验证。
- 第三方许可证和 NOTICE。
- 上游安全更新同步演练。

## 11. Gate 8：私有化

环境：

- 空白 Kubernetes 集群。
- 无语见公网依赖模式。
- 最小拓扑和高可用拓扑。

用例：

- 安装。
- 健康检查。
- 创建项目/key/token/Room。
- Agent deployment。
- 备份和恢复。
- 升级和回滚。
- 证书与 secret 轮换。
- support bundle。
- 卸载和数据保留。

通过条件：

- 按文档一次安装成功。
- 恢复后控制面真值和必要对象一致。
- 回滚不会破坏目标兼容合同。
- 离线环境不请求未声明外部地址。

## 12. Gate 9：可靠性与灾备

注入：

- LiveKit node crash。
- TURN node crash。
- Redis failover。
- PostgreSQL primary failover。
- Agent node drain。
- 对象存储/模型/provider outage。
- Webhook endpoint 长时间不可用。
- 单可用区不可用。

验收：

- 失败范围符合设计。
- 新流量停止或切换可控。
- 无账单/审计永久丢失。
- 告警、runbook、升级和复盘流程有效。
- RPO/RTO 达到当前发布通道目标。

## 13. Gate 10：合规和发布

检查：

- ICP/增值电信/等保的适用结论。
- PIPL 告知、同意、权利和影响评估。
- 数据驻留、出境和 provider。
- 生成式 AI/拟人化功能的适用要求。
- SIP、号码、外呼和录音。
- 隐私政策、服务协议、DPA 和安全白皮书。

没有完成的适用项必须关闭相关能力，不能仅以“测试版”绕过。

## 14. 缺陷等级

| 等级 | 示例 | 发布规则 |
| --- | --- | --- |
| P0 | 跨 tenant、secret 泄露、重复外呼/严重错账 | 阻断 |
| P1 | 核心 SDK 不兼容、Room 大面积失败、无法回滚 | 阻断 |
| P2 | 有替代方案的功能错误、局部质量退化 | 需明确豁免 |
| P3 | 文案、低风险 UI、非关键诊断 | 可带入计划 |

豁免必须包含 owner、影响、替代方案、到期时间和客户沟通。

## 15. GA 签字

需要：

- 产品负责人
- 技术负责人
- RTC 负责人
- SRE/运维负责人
- QA 负责人
- 安全负责人
- 合规/法务
- 财务（如启用计费）
- 电话业务负责人（如启用 SIP/PSTN）
