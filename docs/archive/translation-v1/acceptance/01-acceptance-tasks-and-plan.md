# 语见AI验收任务与验收计划（翻译方向历史归档）

> 已于 2026-07-17 被新的 RTC 平台验收计划取代。

版本：v1.0  
日期：2026-07-17  
状态：验收基线，尚未执行

## 1. 验收原则

- 验收对象是用户结果、业务真值和可恢复性，不只是接口返回 200。
- 自动化先于人工；媒体、音质、可访问性和真实电话保留人工验收。
- 每个结论必须有环境、版本、输入、原始输出和判定。
- LiveKit room/participant 状态只作为媒体证据，不能单独证明业务成功。
- 失败用例与成功用例同等重要。
- 生产 App 的模型评测使用独立 model-lab，不在主 App 试参。

## 2. 角色

| 角色 | 职责 |
| --- | --- |
| Development Owner | 提交可验收版本和自测证据 |
| QA Owner | 执行功能、回归、真机和证据归档 |
| Realtime Owner | 音频、LiveKit、SIP、性能判定 |
| Security Owner | token、SIP、Webhook、Agent tools 和隐私 |
| Product Owner | 功能、文案、降级和用户体验签字 |
| Release Owner | 汇总 Gate，批准或拒绝发布 |

开发者不能单独批准自己负责的 P0 安全和计费验收。

## 3. 环境矩阵

| 环境 | 目的 | 数据 |
| --- | --- | --- |
| Local | 单元/合同/组件 | 全 mock、合成音频 |
| Integration | API+DB+LiveKit+Runtime | 假账号、假号码 |
| Model Lab | ASR/MT/TTS/Speaker 评测 | 授权固定语料 |
| Staging | 固定版本全栈、真实设备 | 测试账号和白名单号码 |
| PSTN Sandbox | SIP trunk/DTMF/provider | 白名单号码 |
| Production Canary | 低比例真实流量 | 明确同意和监控 |

每份证据记录：

- Git commit、镜像 digest、SDK/模型版本。
- 配置 hash，不包含 secret。
- 设备/OS/网络。
- 测试用例和 fixture version。
- trace ID 和脱敏日志。

## 4. Gate A：来源与合同

| ID | 对应任务 | 验收动作 | 通过标准 |
| --- | --- | --- | --- |
| AC-MIG-001 | MIG-SRC-001 | 对照 source manifest 和目标文件 | 每个文件有 commit/patch/目标路径 |
| AC-MIG-002 | MIG-SEC-001 | 扫描复制 staging 目录 | 无 secret、数据、模型、录音、build |
| AC-MIG-003 | MIG-LIC-001 | 检查 LICENSE/NOTICE | LiveKit Apache-2.0 归属完整 |
| AC-CON-001 | CON-001 | Node/Dart/Python 验证同一 fixture | valid 全过、invalid 全拒绝 |
| AC-CON-002 | CON-002 | 注入旧 `sessionId`、未知字段、v2 | v1 schema 拒绝 |
| AC-DOM-001 | DOM-001 | 遍历 Session 转换矩阵 | 非法转换 100% 拒绝 |
| AC-DOM-002 | DOM-002 | playback 乱序/重复/generation | 终态不可逆，迟到帧为0 |

Gate A 未通过，不允许迁移业务源码。

## 5. Gate B：Control API与数据

| ID | 对应任务 | 验收动作 | 通过标准 |
| --- | --- | --- | --- |
| AC-API-001 | API-001 | schema/auth/error/health | 响应合同一致、日志脱敏 |
| AC-DB-001 | DB-001/002 | migration up/down/restore | 数据和约束一致 |
| AC-EVT-001 | EVT-001 | 重复 eventId、payload hash 冲突 | 重复幂等，冲突告警拒绝 |
| AC-EVT-002 | EVT-001 | commit 后进程 SIGKILL | outbox 重启后继续发送 |
| AC-BILL-001 | BILL-001 | 100次重复 End/webhook | 每 session 一次 settle |
| AC-BILL-002 | BILL-001 | 未接通、失败、取消、退款 | hold 全部释放或正确结算 |
| AC-SEC-API-001 | SEC-API-001 | 越权、跨租户、重放 | 全部拒绝并审计 |
| AC-SEC-API-002 | SEC-API-001 | 大 body、慢请求、连接洪泛 | 不 OOM，有结构化限流 |

## 6. Gate C：面对面与聆听

| ID | 场景 | 通过标准 |
| --- | --- | --- |
| AC-RT-001 | 开始、暂停、继续、结束、再次开始 | 状态/按钮一致，新开始生成新 session |
| AC-RT-002 | 100次说完立即结束 | 原文和译文保存率达到门槛，无重复结算 |
| AC-RT-003 | 中文、英文、中英混合、姓名/数字/型号 | 不错误反向，不丢保护字段 |
| AC-RT-004 | 20句连续TTS | 字幕顺序与播放一致，结束后无残留 |
| AC-RT-005 | 扬声器/有线/蓝牙 | 不自激，TTS后完整恢复采集 |
| AC-RT-006 | ASR/MT/TTS超时和5xx | 自动 fallback 或字幕降级 |
| AC-LISTEN-001 | 30分钟聆听 | 无内存持续增长、无UI溢出 |
| AC-LISTEN-002 | 2至4人和unknown speaker | 不跨speaker合并，低置信度如实显示 |
| AC-APP-001 | 320dp、横屏、200%字体 | 无遮挡、核心操作可见 |
| AC-APP-002 | VoiceOver/TalkBack | 核心状态和按钮可读可操作 |

## 7. Gate D：LiveKit与Call Link

### 7.1 Token与身份

| ID | 验收动作 | 通过标准 |
| --- | --- | --- |
| AC-LK-TOK-001 | 解码 Host/Guest token | room绑定、TTL<=300s、仅mic publish |
| AC-LK-TOK-002 | Guest publish data/video/screen | 全部被服务器拒绝 |
| AC-LK-TKT-001 | ticket 重放/过期/跨room/超人数 | 全部拒绝 |
| AC-LK-ID-001 | 重复 LiveKit identity 入房 | 业务 participant/leg 状态可解释 |
| AC-LK-DATA-001 | 伪造 topic/sender/schema | 客户端忽略并记录安全指标 |

### 7.2 功能

| ID | 场景 | 通过标准 |
| --- | --- | --- |
| AC-CALL-001 | Host创建、Guest免安装加入 | P95入房达到目标 |
| AC-CALL-002 | 双方连续交替20句 | 字幕/译音方向正确 |
| AC-CALL-003 | 双方向同时生成TTS | 队列互不阻塞、不串音 |
| AC-CALL-004 | Guest断网30秒后重连 | 媒体恢复，历史由snapshot补齐 |
| AC-CALL-005 | API重启 | Call Link、participant、历史可恢复 |
| AC-CALL-006 | Runtime SIGKILL | session降级/重派/结束符合策略 |
| AC-CALL-007 | 连续30分钟 | 成功率、顺序、计费和资源达标 |

### 7.3 Webhook

- 签名或 body hash 错误必须拒绝。
- 重复 webhook 无副作用。
- 故意丢弃 webhook 后 reconciliation 恢复 provider observation。
- webhook 到达顺序异常不回滚业务终态。

## 8. Gate E：性能、数据和Agent Assist

| ID | 对应任务 | 验收动作 | 通过标准 |
| --- | --- | --- | --- |
| AC-PERF-001 | PERF-001 | 1/10/25/50并发 | admission和P95达标 |
| AC-DUPLEX-001 | DUPLEX-001 | TTS中抢话100次 | 停播P95<=350ms内测 |
| AC-DUPLEX-002 | DUPLEX-001 | AEC/clear故障 | 自动半双工/字幕降级 |
| AC-HIST-001 | HIST-001 | 摘要、全文、质量 | 结论可回溯segment |
| AC-OBS-001 | OBS-002 | 任意失败session | trace可定位具体stage |
| AC-AGT-001 | AGT-001 | 建议回复和实体卡片 | 默认不自动发声 |
| AC-AGT-POL-001 | AGT-POL-001 | L0-L3工具矩阵 | L2确认、L3拒绝 |
| AC-TYPE-001 | TYPE-001 | 号码/地址/金额/字母串 | 三文本一致且TTS可懂 |

## 9. Gate F：PSTN与Autonomous Agent

### 9.1 PSTN

| ID | 场景 | 通过标准 |
| --- | --- | --- |
| AC-SIP-001 | trunk认证、TLS/SRTP、ACL | 未授权来源不可接入 |
| AC-PSTN-001 | 正常拨号/接听/结束 | 状态、时长、账本一致 |
| AC-PSTN-002 | 忙线/拒接/无人接/无路由 | 错误结构化，hold正确释放 |
| AC-PSTN-003 | 8kHz双向翻译 | 双方可懂，方向正确 |
| AC-PSTN-004 | 100次抢话 | 支持clear时达标；否则明确半双工 |
| AC-DTMF-001 | 扩展号和IVR菜单 | digit和等待时序正确 |
| AC-PSTN-005 | provider webhook重复/延迟 | 不重复结束和结算 |

### 9.2 Agent

| ID | 场景 | 通过标准 |
| --- | --- | --- |
| AC-AGENT-001 | 未授权启动 | 拒绝拨号 |
| AC-AGENT-002 | 开场披露 | 未披露不得进入任务对话 |
| AC-AGENT-003 | 只读查询 | 工具结果有证据，无伪造 |
| AC-AGENT-004 | L1预约 | 授权范围内成功并可审计 |
| AC-AGENT-005 | L2敏感修改 | 必须二次确认 |
| AC-AGENT-006 | L3支付/医疗/法律决定 | 自动执行被拒绝 |
| AC-TAKE-001 | 用户接管 | 新工具停止，TTS按门槛停播 |
| AC-HOF-001 | warm transfer成功 | caller、manager、summary、merge完整 |
| AC-HOF-002 | manager拒绝/无人接 | 返回caller并解释，不丢session |
| AC-AGENT-007 | Runtime重启 | task授权不丢，run结果不覆盖 |

## 10. 安全验收

### 10.1 必测攻击面

- LiveKit token 越权、过期、重放、跨 room。
- Guest link 枚举、ticket 重放和人数绕过。
- data topic/sender 伪造。
- webhook 伪造、重放和 body 篡改。
- SIP 扫描、恶意 INVITE、DTMF、transfer 和高资费号码。
- Agent prompt injection、工具越权、参数污染和结果伪造。
- 字幕、号码、token、声音对象和 secret 泄漏。
- SSRF、路径、对象存储越权和导出链接重放。
- 依赖、容器、SBOM、许可证和 secret scan。

### 10.2 阻断标准

- P0/Critical：必须为零。
- High：必须修复，或由安全负责人和产品负责人共同书面接受且有到期日。
- Medium：进入发布风险清单。
- 字幕正文、token、API secret、真实号码出现在普通日志：直接阻断。

## 11. 性能与稳定性

| 指标 | 内测 | 商用 |
| --- | ---: | ---: |
| ASR first partial P95 | <=900ms | <=700ms |
| End-of-speech到final P95 | <=1400ms | <=1000ms |
| Translation P95 | <=500ms | <=350ms |
| TTS first audio P95 | <=600ms | <=300ms |
| Barge-in stop P95 | <=350ms | <=250ms |
| Call Link join P95 | <=5s | <=3s |
| 30分钟成功率 | >=99% | >=99.9% |
| 重复结算 | 0 | 0 |

负载：

1. 1/10/25/50/100 session 阶梯。
2. 30分钟和2小时 soak。
3. 网络 2%/5% 丢包、100/300ms RTT、短断网。
4. ASR/MT/TTS/LLM 5xx、超时、断流和限流。
5. Worker SIGKILL、SFU drain、Redis重启、PostgreSQL failover。
6. GPU OOM 和 queue saturation。

## 12. 数据恢复和删除

| ID | 验收动作 | 通过标准 |
| --- | --- | --- |
| AC-DATA-001 | 在线备份并恢复 | session/ledger/object hash一致 |
| AC-DATA-002 | PostgreSQL failover | 无重复结算和终态回滚 |
| AC-DATA-003 | 删除session | 正文/摘要/媒体删除，账本脱敏保留 |
| AC-DATA-004 | outbox积压后恢复 | 顺序和幂等收敛 |
| AC-DATA-005 | 同session并发冲突 | revision冲突可检测 |

## 13. Egress和隐私

- 未同意时创建 Egress 必须失败。
- 撤销/结束后不能继续录制。
- Egress 上传失败不影响实时通话。
- 对象 URL 最小权限、短期有效、可撤销。
- retention 到期执行删除并有证据。
- 云端 AI 模式不得宣称服务器不可解密。

## 14. 证据包

每个 Gate 产生：

```text
evidence/<release-candidate>/
  manifest.json
  versions.json
  contract/
  unit/
  integration/
  security/
  load/
  device/
  pstn/
  model/
  screenshots/
  traces/
  acceptance-summary.md
```

`manifest.json` 记录文件 hash。证据包不包含 secret、真实号码、未脱敏字幕和未经授权
录音。

## 15. 发布判定

### Internal Alpha

- Gate A、B、C 全部通过。
- 面对面和聆听主链路可用。
- 不开放 Call Link/PSTN/Agent 公测。

### Invitation Alpha

- Gate D 通过。
- Call Link 白名单和资源上限启用。
- 30分钟稳定性通过。

### Beta

- Gate E 通过。
- 50并发、Agent Assist 和历史质量通过。

### PSTN/Agent Canary

- Gate F 和安全专项通过。
- 白名单号码/账号、小流量、费用上限。
- 随时可关闭 feature flag。

### Commercial

- 全部 Gate、100并发、2小时soak、HA、备份恢复和外部安全测试通过。
- P0=0，无未接受 high/critical。
- 发布、回滚、事故和数据恢复手册完成演练。

## 16. 验收日程

验收与开发并行：

- 每个 Sprint 第一天冻结 fixture 和验收版本。
- 日常 CI 运行 lint/unit/contract。
- 每个任务 code complete 后 1 至 2 天执行组件验收。
- 里程碑最后 3 至 5 天执行跨模块、真机和故障验收。
- M5/M6 预留真实 SIP、安全和负载专项窗口，不压缩到普通回归中。

## 17. 当前状态

本文件只建立验收任务和计划，尚未运行任何新系统验收。旧工程历史结果可作为用例
来源，但不能自动成为语见AI的验收证据。
