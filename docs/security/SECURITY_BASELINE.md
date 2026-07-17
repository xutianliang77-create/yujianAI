# 安全基线

版本：v2.0  
日期：2026-07-17  
状态：设计评审稿

## 身份与权限

- tenant、project、environment 在 API、数据库、缓存、对象存储和队列层重复校验。
- 控制台用户使用 MFA；企业 SSO 使用 OIDC/SAML。
- LiveKit token 使用目标版本官方 SDK、最小 grant 和短 TTL。
- Room 客户端通过客户后端换取 token，不持有 LiveKit API secret。
- 生产 key 只显示一次，支持到期、轮换、撤销和用途 scope。
- support operator 使用审批后的短期权限，所有访问进入审计。

## 网络

- API、LiveKit Signal 和必要媒体端口是唯一公网入口。
- PostgreSQL、Redis、模型服务和 Worker 管理接口只在私网或服务身份网络。
- SIP 经 SBC、Provider IP 白名单、TLS/SRTP、频率和并发限制。
- WebSocket、HTTP、Room、Data、Agent 和模型队列均设置硬上限。
- TURN credential 短期签发，监控滥用、异常流量和目的地址。
- Agent worker 默认限制出口网络，按 provider 和工具需要放行。

## 数据

- 默认不保存原始 PCM。
- 音视频、Data Packet 和 Agent 用户正文不写普通日志。
- 手机号保存加密值、hash 和 masked 值。
- 录制、Agent trace 正文和支持包使用独立对象权限和短期 URL。
- Agent 工具参数、授权和结果单独审计。
- 用量、质量、审计和媒体内容使用不同保留策略。
- 生产数据不得复制到 staging 或开发环境。

## 多租户

- 每个数据访问函数都必须接收 tenant context。
- 对象存储使用 tenant/project/environment prefix 和独立策略。
- 分析仓查询使用强制 tenant filter，不依赖 UI 隐藏。
- 共享 RTC 集群中的 tenant 标签不能由普通客户端伪造。
- 私有化和托管云使用同一隔离合同，拓扑不同不降低要求。

## RTC

- 限制 Room、participant、track、metadata、Data 和 RPC 的大小与速率。
- 管理操作只接受服务端 credential。
- 对恶意 ICE、连接洪泛、重连风暴和超大 metadata 进行测试。
- 客户端遥测采用 opt-in、字段 allowlist 和保留期。
- 官方 SDK 兼容不能成为绕过语见 quota 和安全策略的理由。

## Agent

- artifact 需要 digest、SBOM、漏洞扫描和签名。
- worker 使用非 root、只读文件系统、资源限制和 workload identity。
- provider secret 只挂载到对应 deployment。
- 流式模型调用传播 deadline 和取消，防止孤儿任务与失控计费。
- 工具按风险分级；资金、账号、外呼等高风险动作需要显式授权和幂等。

## SIP 与媒体

- 外呼默认限制目的地区、频率、并发、单次时长和费用。
- 重复请求必须按幂等键返回同一 call，不重复拨号。
- 录制默认关闭，开启必须有授权、存储位置和保留期。
- Egress 对象采用最小权限和生命周期，删除需要可验证状态。
- 反欺诈和异常费用熔断是生产启用 SIP 的阻断条件。

## 供应链

- 禁止使用 `latest` 镜像。
- 依赖、容器和 SBOM 必须扫描。
- secret 通过 Secret Manager、KMS 或只读 mount 注入。
- 上游 patch 记录来源、测试、回滚和移除条件。
- 发布前执行 token、WebRTC、SIP、Webhook、Agent tools 和 tenant 隔离安全测试。
- 私有化离线包包含 checksum 和签名，不运行未声明的在线安装脚本。

## 合规

- 未完成适用的许可、备案、数据和 AI 合规评审前，不对外宣称已经具备。
- 数据最小必要、告知同意、导出、删除和影响评估形成可验证流程。
- 跨境模型或存储 provider 必须记录数据区域和处理策略。
- 电话、录音和公众生成式 AI 能力分别设置上线 Gate。
