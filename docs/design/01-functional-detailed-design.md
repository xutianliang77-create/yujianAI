# 功能详细设计

版本：v2.0  
日期：2026-07-17  
状态：产品与功能评审稿

## 1. 范围

首个商业版本面向开发者和企业管理员，不建设终端消费者应用。功能范围分为：

1. 开发者控制台与组织管理。
2. LiveKit 兼容 RTC。
3. Agent 开发、部署与运行。
4. SIP、Ingress 和 Egress。
5. 用量、配额、账单和审计。
6. 托管云、私有化和运维支持。

机器翻译、翻译电话和翻译 App 不在本版本范围。

## 2. 角色与权限

| 角色 | 主要权限 |
| --- | --- |
| Tenant Owner | 商务、成员、项目、账单、删除 tenant |
| Tenant Admin | 成员、项目、环境、配额申请、审计 |
| Developer | API key、Room、Agent、SIP/媒体任务和日志 |
| Billing Admin | 用量、账单、发票和预算告警 |
| Security Auditor | 只读安全配置、审计和导出 |
| Support Operator | 经授权的短期诊断，不读取媒体正文 |
| Private Deployment Admin | 安装、升级、备份、恢复和 license |

权限采用最小授权。生产 API key、账单和高风险 SIP 操作不得仅凭普通 Developer 角色
执行。

## 3. 初次使用流程

### 3.1 注册与创建 Tenant

流程：

1. 用户完成账号验证。
2. 创建 tenant，选择个人试用或企业。
3. 创建第一个 project 和 `development` environment。
4. 平台分配 endpoint 和试用配额。
5. 用户创建 API key；secret 只显示一次。
6. 控制台生成 server token 示例，不在浏览器保存 secret。
7. 用户选择 SDK quickstart 并完成第一条 Room 连接。

验收结果：

- 10 分钟内完成两端加入、发布和订阅音频。
- 控制台可看到 Room、Participant 和基础质量。
- secret 泄露扫描不在浏览器存储、日志或 URL 中发现 key。

### 3.2 生产化向导

生产 environment 创建前要求：

- 绑定企业主体或完成所需验证。
- 选择数据驻留和主区域策略。
- 配置预算、配额和告警。
- 创建独立生产 API key。
- 配置允许的服务端来源或网络策略。
- 确认录制、日志和内容保留策略。

## 4. Tenant、Project 与 Environment

### 4.1 Tenant

功能：

- 基本信息和状态。
- 成员邀请、移除、角色和 SSO。
- 套餐、商务主体和账单账号。
- 数据导出、关闭和删除申请。

规则：

- Owner 不能删除最后一个 Owner。
- tenant suspended 后，控制台只保留账单、导出和申诉入口。
- 关闭操作显示资源、未结账费用和数据删除时间表。

### 4.2 Project

功能：

- 创建、重命名、归档。
- 查看所有 environment。
- 配置默认 region、Webhook 和标签。

规则：

- project slug 在 tenant 内唯一。
- 归档不删除 Room 记录、账单或审计。

### 4.3 Environment

功能：

- dev/test/staging/prod 分类。
- endpoint、region、quota、retention 和 Webhook 配置。
- 独立 API key、Agent、SIP 和媒体任务。

规则：

- 生产和非生产 secret 不可复用。
- 生产 environment 删除需要二次确认和冷静期。

## 5. API key 与 Token

### 5.1 API key 管理

功能：

- 创建、命名、设置 scope 和到期时间。
- 复制一次 secret。
- 轮换、双 key 过渡、撤销和使用记录。

异常：

- secret 丢失只能轮换，不能再次显示。
- 最后一个生产 key 被撤销前显示影响评估。
- 异常使用触发自动冻结或告警。

### 5.2 Token helper

控制台提供：

- server-side 签发示例。
- grant 可视化。
- 短期调试 token，带醒目标识和严格 TTL。
- token 解码器，只在本地解析，不把 token 上传日志。

禁止在控制台生成可长期用于生产的 Room token。

## 6. RTC 功能

### 6.1 Room

功能：

- 创建、列举、查看和关闭 Room。
- 设置 empty timeout、最大 participant 和 metadata。
- 查看活跃/历史 Room。
- 按 room name、SID、时间和 region 查询。

LiveKit 兼容要求：

- 官方 SDK 创建连接和加入 Room。
- 上游支持的 participant/track 操作按兼容矩阵工作。
- 未实现能力返回明确限制，不静默降级。

### 6.2 Participant

功能：

- 查看 identity、SID、kind、join 时间和连接信息。
- 管理员移除 participant。
- 在兼容范围内更新 metadata/attributes/permissions。
- 查看发布和订阅 Track。

隐私：

- 默认只显示必要网络诊断。
- IP 地址脱敏，敏感设备信息按权限展示。

### 6.3 Track 与媒体

功能：

- 音频、视频、屏幕共享。
- simulcast/SVC、订阅控制和自适应流。
- codec 能力与协商结果。
- mute、unpublish、订阅失败诊断。

质量面板：

- RTT、jitter、packet loss。
- audio concealment、video freeze、bitrate 和 resolution。
- ICE candidate 类型、TURN 使用和 reconnect。

### 6.4 Data 与 RPC

支持目标 LiveKit 版本的：

- reliable/lossy data packet。
- text/byte stream。
- RPC。

限制：

- 设置单消息、速率、并发和总流量上限。
- 不承诺离线消息或持久可靠队列。
- 大文件应使用对象存储和签名 URL。

### 6.5 网络诊断

开发者可运行：

- DNS/TLS/WebSocket。
- UDP/TCP/TLS TURN。
- 上下行带宽和丢包。
- region 延迟比较。
- 摄像头、麦克风和浏览器能力。

诊断结果可下载，但默认不包含 token、完整 IP 和媒体内容。

## 7. Agent Platform

### 7.1 Quickstart

用户选择 Python 或 Node.js：

1. 创建 agent。
2. 下载或复制模板。
3. 本地运行 worker。
4. 加入测试 Room。
5. 查看 dispatch 和 trace。
6. 构建 artifact。
7. 部署 preview。

### 7.2 Artifact

功能：

- 上传或通过 CI 推送。
- 记录 digest、runtime、入口、SBOM 和扫描结果。
- 签名验证。
- 保留版本和删除策略。

扫描失败或签名无效的 artifact 不得部署生产。

### 7.3 Deployment

功能：

- 选择 artifact、环境、region 和 provider binding。
- 配置副本、伸缩、资源、并发和 drain timeout。
- rolling、canary 和 blue-green。
- 一键回滚到最近稳定版本。

状态：

```text
draft -> validating -> deploying -> ready
                         |           |
                         v           v
                       failed     draining -> stopped
```

### 7.4 Dispatch

功能：

- 显式 dispatch。
- Room 创建时按规则 dispatch。
- participant 加入时按规则 dispatch。
- 按 metadata/attributes 条件选择 agent。

规则：

- 每个规则设置最大 worker 数和去重窗口。
- dispatch metadata 不放 secret。
- 失败支持重试、fallback deployment 或人工处理。

### 7.5 Provider

首批能力类型：

- realtime model
- LLM
- ASR
- TTS
- VLM
- moderation

用户配置：

- provider/model/region
- secret reference
- timeout/retry/fallback
- 数据处理和日志策略
- 预算和单 Room 成本上限

### 7.6 Trace 与评测

Trace 展示：

- dispatch 和 worker 生命周期。
- 模型请求阶段和耗时。
- 音频/文本事件时间线。
- 工具调用、授权和错误。
- token、字符、音频时长和估算费用。

默认不保存完整音频或用户正文；需要正文调试时必须显式、短期、可撤销。

## 8. SIP

### 8.1 Trunk

功能：

- 创建 inbound/outbound trunk。
- 配置 provider、认证、允许号码和目的地区。
- 健康检查、并发、费用和反欺诈规则。
- 凭据轮换。

### 8.2 入呼

流程：

1. provider 呼叫语见 SIP endpoint。
2. SBC/ACL/反欺诈检查。
3. dispatch rule 选择 Room 和 Agent。
4. SIP participant 加入 Room。
5. 控制台显示状态和质量。
6. 呼叫结束生成用量和审计。

### 8.3 外呼

流程：

1. 服务端提交幂等外呼请求。
2. 校验 tenant、配额、目的地区、授权和预算。
3. 创建 Room/dispatch。
4. 调用 SIP provider。
5. 返回 call ID 并通过事件更新状态。

高风险限制：

- 默认关闭国际、高资费和批量外呼。
- 异常失败率、短呼叫和费用触发熔断。
- 资质或实名不满足时返回 `COMPLIANCE_RESTRICTED`。

## 9. Ingress 与 Egress

### 9.1 Ingress

功能：

- 创建 RTMP/WHIP/URL/文件等上游支持的接入。
- 绑定 Room 和 participant identity。
- 查看连接、重连、Track 和流质量。
- 配额和自动过期。

### 9.2 Egress

功能：

- Room composite、participant/track 和 web egress。
- MP4/HLS/RTMP 等目标版本支持的输出。
- 选择存储 provider、路径模板和生命周期。
- 停止、重试和失败诊断。

录制规则：

- 默认关闭。
- 开始前有明确授权和告知责任配置。
- 控制台显示保存位置、保留期和删除状态。

## 10. Usage、Quota 与 Billing

### 10.1 Usage

查询维度：

- tenant/project/environment
- region
- RTC participant minutes
- egress/ingress
- SIP
- TURN traffic
- Agent compute
- provider usage

用量显示“预估/已结算”状态和统计延迟。

### 10.2 Quota

- 显示当前值、已用量和预计耗尽时间。
- 支持告警阈值和变更申请。
- 超限返回稳定错误，并提供建议操作。
- 紧急临时配额必须有到期时间和审计。

### 10.3 Billing

- 套餐、价格版本、优惠和试用额度。
- 月度账单、明细和导出。
- 预算告警和费用异常。
- 人民币结算与发票流程作为商业系统集成，不与媒体热路径耦合。

## 11. Webhook 与审计

Webhook 功能：

- endpoint、secret、event filter。
- 签名验证示例。
- 投递历史、重试、暂停和 replay。
- payload 预览自动脱敏。

审计功能：

- 按 actor、action、resource、时间和结果查询。
- 高风险操作单独筛选。
- 导出带水印或签名。
- support operator 访问也必须被审计。

## 12. 私有化

控制台或 CLI 提供：

- 集群预检。
- 安装和升级计划。
- component health。
- license 状态。
- 备份、恢复和演练。
- support bundle 生成和预览。
- 上游兼容性自测。

离线环境不得要求访问语见公网才能启动基础 RTC。

## 13. 异常与降级

| 异常 | 用户结果 |
| --- | --- |
| 单 RTC 节点故障 | 新 Room 避开；现有连接按上游恢复能力处理 |
| 区域容量满 | 新建返回明确错误或按策略选备选区域 |
| TURN 故障 | 尝试直连/其他 TURN，并记录质量风险 |
| 控制面短时不可用 | 已签发 token 和运行中 Room 尽量继续 |
| Agent worker 无容量 | 排队到上限、fallback 或失败，不无限等待 |
| 模型 provider 故障 | 依据绑定策略重试/切换/取消 |
| Billing 聚合延迟 | 标记预估，不阻断已有 entitlement 内的媒体 |
| Webhook 失败 | 重试、死信和人工 replay |
| 对象存储失败 | Egress 失败并停止计费到实际停止点 |

## 14. 产品指标

- 首次成功 Room 时间。
- SDK quickstart 成功率。
- Room join 成功率和 P95。
- 音频可用分钟比例、视频 freeze ratio。
- Agent dispatch 成功率、等待和首响应。
- SIP 接通率、PDD、异常费用拦截率。
- Egress 成功率与可播放率。
- 用量入账延迟、重复率和账单差异。
- 私有化一次安装成功率、升级和回滚耗时。

