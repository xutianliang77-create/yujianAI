# 语见AI设计开发任务与开发计划（翻译方向历史归档）

> 已于 2026-07-17 被新的 RTC 平台开发计划取代。

版本：v1.0  
日期：2026-07-17  
状态：计划基线，所有开发任务均未开始

## 1. 计划假设

工期用于排序和资源评估，不代表已经批准开工。

基线团队假设：

- 2 名 Backend/Platform。
- 1 名 Realtime/Media。
- 1 名 Flutter/Web。
- 1 名 AI/Model。
- 1 名 QA/SRE/Security，可跨阶段参与。

估算单位为人日。若只有 1 至 2 名开发者，保留任务顺序和验收门禁，按实际人力延长
日历工期，不压缩测试。

## 2. 总体里程碑

| 里程碑 | 周期 | 目标 | 发布结果 |
| --- | ---: | --- | --- |
| M0 设计与来源冻结 | 1周 | 评审五类文档、冻结迁移来源 | 不发布 |
| M1 平台基础 | 3周 | 合同、Domain、Control API、PostgreSQL | 开发环境 |
| M2 单设备翻译 | 3周 | 面对面、聆听、Speech/Translation 主链路 | 内部 Alpha |
| M3 Call Link | 3周 | LiveKit、Web Guest、双向字幕/译音 | 邀请制 Alpha |
| M4 数据与 Agent Assist | 3周 | 历史、观测、全双工、建议回复 | 内测 Beta |
| M5 PSTN 与 Agent Call | 4周 | SIP、外呼、DTMF、接管、转接 | 灰度 Beta |
| M6 商用加固 | 3周 | HA、安全、负载、真机、发布证据 | 商用候选 |

基线关键路径约 20 周。任何 P0 安全或可靠性门禁失败都暂停下一里程碑。

## 3. M0：设计与来源冻结

| ID | 任务 | 交付物 | 依赖 | 人日 | 完成门槛 |
| --- | --- | --- | --- | ---: | --- |
| GOV-001 | 五类设计评审 | 评审记录、未决项、批准版本 | 无 | 2 | 产品/架构/开发/验收口径一致 |
| MIG-SRC-001 | 无界AI来源冻结 | commit、patch hash、文件清单 | GOV-001 | 2 | 明确 HEAD/未提交文件选择 |
| MIG-LIC-001 | 权属和许可证清单 | 旧源码授权、LiveKit LICENSE/NOTICE | MIG-SRC-001 | 1 | 每个来源可追溯 |
| MIG-SEC-001 | 迁移排除扫描 | secret/data/model/build 排除规则 | MIG-SRC-001 | 2 | 白名单复制演练不含敏感文件 |
| LK-BASE-001 | LiveKit版本决策 | SDK/tag/image digest 候选表 | GOV-001 | 2 | 无 `latest`，SCA/SBOM 计划明确 |

M0 Gate：只允许评审和来源冻结；未通过前不复制源码。

## 4. M1：平台基础

### 4.1 合同与领域

| ID | 任务 | 交付物 | 依赖 | 人日 | 完成门槛 |
| --- | --- | --- | --- | ---: | --- |
| CON-001 | 首批事件 payload schema | session/participant/speech/translation/billing | GOV-001 | 4 | Node/Dart/Python fixture 兼容 |
| CON-002 | 命令信封和错误合同 | command、expectedRevision、error | CON-001 | 3 | 重放和未知字段负例通过 |
| DOM-001 | Session状态机 | 纯 Domain 包和迁移测试 | CON-002 | 3 | 合法/非法/重复转换全覆盖 |
| DOM-002 | Playback状态机 | generation、clear、终态 | CON-002 | 3 | 乱序和迟到 chunk 无副作用 |
| DOM-003 | Agent task/run状态机 | 授权、重试、取消、接管 | CON-002 | 3 | task 与 run 不相互覆盖 |

### 4.2 Control API与数据

| ID | 任务 | 交付物 | 依赖 | 人日 | 完成门槛 |
| --- | --- | --- | --- | ---: | --- |
| API-001 | Control API骨架 | Fastify、配置、健康、错误、日志脱敏 | CON-002 | 4 | lint/unit/contract 通过 |
| DB-001 | PostgreSQL migration v1 | session/participant/leg/binding | DOM-001 | 5 | up/down、约束、事务测试 |
| DB-002 | Speech/translation/playback表 | turn/segment/revision/translation/playback | DOM-002 | 5 | revision 和唯一约束通过 |
| EVT-001 | inbox/outbox | 原子写、去重、重试、死信 | DB-001 | 5 | crash/restart 不丢不重 |
| BILL-001 | hold和append-only ledger | reserve/settle/release/refund | EVT-001 | 5 | 重复 End 只结算一次 |
| SEC-API-001 | 服务身份和限流 | JWT audience、rate/payload/timeout | API-001 | 4 | 越权和洪泛测试通过 |
| OBS-001 | OTel基线 | trace、metrics、redaction | API-001 | 3 | 正文和 token 不进入普通日志 |

### 4.3 迁移适配

| ID | 任务 | 交付物 | 依赖 | 人日 | 完成门槛 |
| --- | --- | --- | --- | ---: | --- |
| MIG-CON-001 | 旧合同迁移 | 选定事件/测试改写到新 schema | MIG-SEC-001、CON-001 | 4 | 无旧包名和 `sessionId` |
| MIG-API-001 | 旧API领域逻辑适配 | 账号/同意/历史/用量 mapper | API-001 | 6 | 不复制 SQLite/Map 真值 |

M1 Gate：`npm run check`、合同、migration、事务、权限和 secret scan 全部通过。

## 5. M2：单设备实时翻译

### 5.1 Speech和Translation

| ID | 任务 | 交付物 | 依赖 | 人日 | 完成门槛 |
| --- | --- | --- | --- | ---: | --- |
| SP-001 | Speech Runtime接口 | audio/VAD/turn/ASR/TTS contracts | CON-001 | 4 | mock provider contract 通过 |
| SP-002 | Audio Frontend | frame、resample、clock、ring buffer | SP-001 | 5 | 丢帧/乱序/采样率测试 |
| SP-003 | VAD/Turn profiles | conversation/listen/agent | SP-002 | 5 | 固定语料端点指标通过 |
| ASR-001 | 流式ASR adapter | create/write/flush/cancel/close | SP-001 | 6 | 尾句、超时和 fallback |
| TR-001 | Translation Core | direction、terms、protected fields | CON-001 | 5 | 数字/姓名/型号测试 |
| TR-002 | Translation Runtime | final queue、MT、events | ASR-001、TR-001 | 7 | 顺序、幂等、降级 |
| TTS-001 | 流式TTS adapter | chunk、first audio、cancel | SP-001 | 5 | chunk 顺序和取消 |
| TTS-002 | Playback Runtime | target leg queue、generation、clear | DOM-002、TTS-001 | 6 | 双向隔离和迟到帧丢弃 |

### 5.2 Mobile

| ID | 任务 | 交付物 | 依赖 | 人日 | 完成门槛 |
| --- | --- | --- | --- | ---: | --- |
| APP-001 | Flutter壳和设计系统 | 中文、主题、导航、可访问性 | GOV-001 | 6 | iOS/Android lint/test |
| APP-002 | 合同适配层 | schema DTO、错误、本地快照 | CON-001 | 4 | 与 Node fixture 一致 |
| APP-003 | 面对面模式 | 状态控制、字幕、TTS、降级 | TR-002、TTS-002 | 8 | 真机基本闭环 |
| APP-004 | 聆听模式 | 大字幕、静音默认、章节 | APP-003 | 5 | 30分钟 UI/内存稳定 |
| APP-005 | 音频协调器 | 采集、播放、耳机、中断 | SP-002 | 6 | TTS 后自动恢复采集 |
| MIG-APP-001 | 迁移旧Flutter feature | 白名单 Dart/原生 bridge | APP-001、MIG-SRC-001 | 8 | 不复制平台签名和旧ID |

### 5.3 Gateway

| ID | 任务 | 交付物 | 依赖 | 人日 | 完成门槛 |
| --- | --- | --- | --- | ---: | --- |
| RTG-001 | Realtime Gateway | auth、bounded WS、session adapter | API-001、SP-001 | 6 | maxPayload/queue/backpressure |
| RTG-002 | 最终事件提交 | Runtime到Control API inbox | EVT-001、TR-002 | 4 | 断线恢复和重复提交 |

M2 Gate：iPhone/Android 面对面与聆听固定语料、尾句 100 次、30 分钟稳定性通过。

## 6. M3：LiveKit与Call Link

| ID | 任务 | 交付物 | 依赖 | 人日 | 完成门槛 |
| --- | --- | --- | --- | ---: | --- |
| LK-INF-001 | LiveKit/Redis/TURN模板 | 固定 tag/digest、非敏感配置 | LK-BASE-001 | 5 | config/security scan |
| LK-ADP-001 | LiveKit adapter | Room/participant/track/binding | DB-001 | 6 | provider ID 不成为业务主键 |
| LK-TOK-001 | 最小权限token | grant matrix、120秒TTL | SEC-API-001 | 4 | 人类不能发 data/video/screen |
| LK-TKT-001 | 一次性join ticket | nonce、role、expiry、use count | LK-TOK-001 | 4 | 重放/过期/跨room失败 |
| LK-WEBHOOK-001 | Webhook inbox | signature、hash、dedupe、reconcile | EVT-001、LK-ADP-001 | 4 | 丢 webhook 可校准 |
| LK-DSP-001 | 显式Agent Dispatch | dispatch/list/delete adapter | LK-ADP-001 | 5 | metadata 无 PII |
| JOB-001 | Translation job wrapper | Agents Node job、load、idle、drain | LK-DSP-001、TR-002 | 7 | job 隔离和滚动 drain |
| WEB-001 | Web Guest壳 | 同意、ticket、媒体、字幕 | APP-002、LK-TKT-001 | 7 | 主流浏览器 |
| CALL-001 | Call Link管理 | create/share/expire/max participants | LK-ADP-001 | 5 | API重启可恢复 |
| CALL-002 | 双向字幕和译音 | Host/Guest target leg | JOB-001、WEB-001 | 8 | 两方向并行不串音 |
| CALL-003 | 重连和快照补齐 | lastSequence、snapshot、rejoin | CALL-002 | 5 | 断线不依赖 data 重放 |

M3 Gate：Host + Guest + Runtime 连续 30 分钟，字幕/译音/历史/结算一致。

## 7. M4：数据、性能与Agent Assist

| ID | 任务 | 交付物 | 依赖 | 人日 | 完成门槛 |
| --- | --- | --- | --- | ---: | --- |
| HIST-001 | 历史聚合查询 | 摘要/全文/质量视图 | DB-002 | 6 | evidence 可回溯 |
| OBS-002 | Session质量报告 | stage latency/queue/fallback | OBS-001、TR-002 | 5 | 每 session 可诊断 |
| PERF-001 | 容量准入 | jobs/ASR/GPU/queue综合负载 | JOB-001 | 6 | 过载在接通前拒绝 |
| DUPLEX-001 | 全双工抢话 | echo gate、pre-roll、clear | TTS-002、APP-005 | 8 | 停播P95达标 |
| AGT-001 | Agent Assist core | context、suggestion、entity cards | HIST-001 | 7 | 不自动发声 |
| AGT-POL-001 | Policy/Tool Registry | L0-L3、授权、审计 | DOM-003 | 7 | 越权工具全部拒绝 |
| TYPE-001 | Type-to-Speak | 三文本预览、目标 leg | TTS-002 | 4 | 用户确认后才播放 |
| TERM-001 | 术语包 | ASR hotword、MT保护、版本 | TR-001 | 4 | 六类固定术语回归 |

M4 Gate：50 并发 session、Agent Assist、全双工故障降级和历史质量通过。

## 8. M5：PSTN与Autonomous Agent

| ID | 任务 | 交付物 | 依赖 | 人日 | 完成门槛 |
| --- | --- | --- | --- | ---: | --- |
| SIP-INF-001 | LiveKit SIP + SBC模板 | trunk、ports、TLS/SRTP、ACL | LK-INF-001 | 7 | 公网安全评审 |
| SIP-ADP-001 | SIP adapter | trunk/rule/participant/status | LK-ADP-001 | 6 | mock与真实 provider合同 |
| PSTN-001 | 拨号和费用hold | number policy、waitUntilAnswered | BILL-001、SIP-ADP-001 | 6 | 忙线/拒接/无人接 |
| PSTN-002 | 双向8kHz翻译 | SIP leg audio/译音/降级 | JOB-001、PSTN-001 | 10 | 真实号码闭环 |
| DTMF-001 | DTMF/IVR | 用户/Agent受控操作 | AGT-POL-001、SIP-ADP-001 | 5 | 菜单和扩展号 |
| AGT-002 | Agent task/run API | 草稿、授权、排队、取消 | DOM-003、BILL-001 | 7 | 重试不覆盖授权 |
| AGT-003 | Voice Agent Runtime | disclosure、LLM、tools、TTS | AGT-002、JOB-001 | 10 | 端到端任务 |
| TAKE-001 | 监听和接管 | stop tools/TTS、用户 leg 激活 | AGT-003 | 5 | P95停播门槛 |
| HOF-001 | Warm transfer | hold、consult、summary、merge | AGT-003、SIP-ADP-001 | 8 | 成功/拒绝/无人接 |
| EGR-001 | Egress录音 | consent、object、retention | LK-INF-001 | 5 | 默认关闭、失败不影响通话 |

M5 Gate：真实 SIP trunk、小流量白名单、AI 披露、禁拨、接管、转接和退款全部通过。

## 9. M6：商用加固

| ID | 任务 | 交付物 | 依赖 | 人日 | 完成门槛 |
| --- | --- | --- | --- | ---: | --- |
| HA-001 | 多节点LiveKit | Redis routing、drain、region | LK-INF-001 | 7 | 节点故障/下线 |
| HA-002 | PostgreSQL HA | failover、backup、restore | DB-002 | 6 | 无重复结算 |
| SEC-001 | 安全专项 | token/SIP/webhook/tools/PII | M5 | 10 | P0=0 |
| LOAD-001 | 100并发与soak | 1/10/25/50/100、2小时 | PERF-001 | 8 | 商用SLO |
| CHAOS-001 | 故障注入 | SFU/Worker/Model/Redis/DB | HA-001、HA-002 | 8 | 自动降级/恢复 |
| QA-DEVICE-001 | 真机矩阵 | iOS/Android/Web/蓝牙/后台 | M5 | 10 | 目标设备全通过 |
| RELEASE-001 | 发布供应链 | SBOM、digest、scan、rollback | SEC-001 | 6 | 无未接受high/critical |
| OPS-001 | 运维手册 | deploy/status/drain/incident/restore | CHAOS-001 | 5 | 值班演练通过 |

## 10. 关键路径

```text
GOV-001
 -> MIG-SRC-001 / LK-BASE-001
 -> CON-001 -> DOM-001
 -> API-001 -> DB-001 -> EVT-001 -> BILL-001
 -> SP-001 -> ASR-001 -> TR-002 -> TTS-002
 -> LK-ADP-001 -> LK-DSP-001 -> JOB-001
 -> CALL-002
 -> SIP-ADP-001 -> PSTN-002
 -> AGT-003 -> HOF-001
 -> SEC/LOAD/CHAOS -> RELEASE
```

Flutter、Web、模型 Provider 和观测可以在合同冻结后并行，但不得提前定义自己的
字段或 session 状态。

## 11. 进度管理

每个任务状态：

```text
planned -> ready -> in_progress -> code_complete
        -> acceptance_pending -> accepted
        -> blocked/rejected
```

`code_complete` 不等于完成。只有验收证据通过并标记 `accepted` 才能进入下一发布
门槛。

每周更新：

- 当前状态和 owner。
- 实际/剩余人日。
- 合同、风险和未决项。
- 测试和证据链接。
- feature flag 和回滚状态。

## 12. Definition of Ready

任务开始前必须有：

- 批准的功能和技术设计章节。
- 输入/输出合同。
- 源码来源和许可证。
- 验收 ID、fixture 和环境。
- 安全/隐私分类。
- 回滚或禁用方式。

## 13. Definition of Done

- 变更范围与任务一致。
- lint、单元、合同、集成测试通过。
- 跨服务变更有 integration test。
- 性能/媒体任务有 P50/P95/P99。
- secret、SCA、license、SBOM 检查通过。
- 文档、运行手册和 `PROGRESS_LOG.md` 更新。
- 对应验收任务已 accepted。

## 14. 当前执行状态

本文件创建时只完成设计研究。所有开发任务状态为 `planned`；没有开始复制无界AI
源码，也没有部署或修改 LiveKit。
