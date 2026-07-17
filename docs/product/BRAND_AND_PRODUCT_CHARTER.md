# 品牌与产品章程

版本：v2.0  
日期：2026-07-17  
状态：目标重置评审稿

## 品牌

- 品牌：语见AI
- 英文工程名：Yujian Realtime
- 暂定定位语：让实时智能，连接每一次互动

“中国的 LiveKit”是产品方向描述，不作为公司名称、商标或对外比较广告。正式品牌、
英文名、域名和定位语需要单独完成商标、域名和市场评审。

## 产品使命

让中国开发者和企业能够用开放、可迁移、可私有部署的基础设施，快速构建实时音视频
和语音 AI 产品。

## 产品定位

语见AI是 LiveKit 兼容的中国实时互动开发平台，覆盖：

1. 实时音视频基础设施。
2. 面向语音和多模态交互的 Agent Runtime。
3. SIP/PSTN、录制、媒体接入和媒体导出。
4. 中国大陆优化的托管云、控制台、计量计费和技术支持。
5. 企业私有化、专有云和离线部署。

本版本不提供翻译产品，不建设面向终端消费者的翻译 App。

## 目标用户

- 构建实时社交、直播互动、在线会议和在线教育的开发团队。
- 构建语音客服、陪伴、游戏 NPC、数字人和多模态 Agent 的 AI 团队。
- 需要国内托管、专有云、私有化或混合云的企业客户。
- 需要 SIP、呼叫中心和 PSTN 接入的通信集成商。
- 希望采用开放协议和可迁移架构、降低供应商锁定的 SaaS 厂商。

## 五条产品线

### 1. RTC Engine

- Room、Participant、Track、Subscription 和 metadata。
- 音频、视频、屏幕共享、Data Packet、Data Stream 和 RPC。
- iOS、Android、Web、Flutter、React Native、Unity 和服务端 SDK 兼容。
- TURN、SFU、Simulcast/SVC、弱网恢复、区域选择和网络诊断。

### 2. Realtime Cloud

- 中国大陆网络优化的多可用区托管服务。
- 租户、项目、环境、API key、域名、配额和告警。
- 用量查询、套餐、人民币计价、合同和发票流程。
- 运行状态、质量分析、回放诊断和工单支持。

### 3. Agent Platform

- Agent worker 注册、版本、dispatch、伸缩、灰度和回滚。
- 国内外 ASR、TTS、LLM、VLM 和实时模型插件。
- 工具授权、风险分级、人工接管、会话 trace 和评测。
- Python 与 Node.js Agent 开发体验优先。

### 4. Telephony & Media

- SIP trunk、号码、入呼、外呼、转接和 DTMF。
- Ingress：RTMP/WHIP/文件/URL 等媒体接入。
- Egress：录制、合流、单轨导出、HLS/RTMP 转推。
- 运营商和号码能力以资质、合作协议和区域可用性为前提。

### 5. Private Deployment

- 单租户 Kubernetes、专有云、信创适配和离线交付。
- 可复现安装、升级、备份、恢复、容量规划和健康检查。
- 客户自管密钥、存储、模型和日志留存策略。

## 差异化

相对 LiveKit 上游：

- 中国大陆网络、区域与数据驻留。
- 中文控制台、文档、支持和本地交付。
- 国内云、模型、对象存储、短信和身份服务集成。
- 人民币商务流程、私有化和合规证据包。

相对国内闭源 RTC 平台：

- LiveKit API、协议和 SDK 兼容优先。
- 开源核心、可自托管和可迁移。
- Agent-first 的 worker、模型插件和可观测体系。
- 语见扩展可被关闭，不强迫业务使用专有客户端。

## 产品原则

1. 兼容优先：已使用 LiveKit 的应用应以最小改动接入。
2. 开放优先：核心媒体与协议能力不以专有客户端锁定用户。
3. 中国优先：网络、数据、支付、发票、支持和部署适配中国市场。
4. Agent 原生：AI worker 是平台一等公民，但不能破坏普通 RTC 能力。
5. 私有部署可验证：安装、升级、回滚和灾备必须有自动化证据。
6. 合规诚实：未取得的资质、备案和认证不得写成已具备能力。

## 首版非目标

- 不建设终端消费者社交、会议或翻译应用。
- 不自研浏览器 WebRTC 协议栈或编解码器。
- 不承诺在首版支持所有 LiveKit Cloud 专有能力。
- 不在未完成法律和运营商评审前直接经营公众电话业务。
- 不在首版自研通用大模型、ASR 或 TTS 基座模型。

## 成功标准

- 现有 LiveKit 客户端和 Server SDK 可通过兼容性清单接入。
- 国内三类网络和弱网条件下形成可重复的质量基线。
- Agent worker 可完成部署、dispatch、观测、升级和回滚闭环。
- 托管云与私有化使用同一协议合同和兼容性测试。
- 计量、账单、租户隔离和审计可以独立验收。

## 参考基线

- [LiveKit overview](https://docs.livekit.io/intro/overview/)
- [LiveKit rooms, participants and tracks](https://docs.livekit.io/intro/basics/rooms-participants-tracks/)
- [腾讯云实时音视频 TRTC](https://cloud.tencent.com/document/product/647)
- [声网 RTC 产品概述](https://doc.shengwang.cn/doc/rtc/harmonyos/overview/product-overview)
- [阿里云超低延时直播与实时互动](https://help.aliyun.com/zh/live/interactive-streaming-overview/)
