# M3 Preview 执行与证据合同

版本：v1
状态：开发完成，运行未执行
适用：M3-05 运营商网络、M3-09 设计伙伴、M3-10 24/72 小时和故障注入

## 1. 失败关闭原则

- 计划文件只能是 `not-executed`，不得被当成运行证据。
- HTTP `/healthz`/`readyz` 合成样本不等于 RTC 入房、发布、订阅、TURN 或重连证据。
- 最终 verifier 要求 immutable Git commit、不可变 artifact digest 和完整矩阵；
  任一格缺失、P0/P1 未关闭、长稳中断或 fault 未恢复都拒绝。
- 证据不允许 token、secret、authorization、cookie、号码、SDP、录音、媒体或用户正文。
- verifier 通过也只表示 M3 Preview 证据符合 policy，固定输出
  `productionReleaseAuthorized=false`，不能越过 Gate 0/1/7 或 Owner 决定。

## 2. 生成待执行计划

```bash
cd /data/models/yujianAI
GIT_COMMIT="$(git rev-parse HEAD)" \
YUJIAN_M3_EXECUTION_PLAN=/data/models/yujianAI/evidence/m3-preview/execution-plan.json \
npm run m3:execution-plan
```

计划从 `infra/acceptance/m3-preview-evidence-policy.json` 生成：

- 移动/联通/电信 × 华北/华东/华南，共 9 格；
- 至少 2 个伪名设计伙伴试用；
- 24 小时和 72 小时长稳；
- RTC 节点、Redis、PostgreSQL、provider、TURN 五个故障场景。

文件以 `wx`/0600 创建，已存在时拒绝覆盖。

## 3. 运营商样本

每台授权客户端先收集不含凭据的 HTTP readiness 样本：

```bash
GIT_COMMIT="$(git rev-parse HEAD)" \
YUJIAN_PLATFORM_URL=https://preview.example.cn \
YUJIAN_SYNTHETIC_CARRIER=cmcc \
YUJIAN_SYNTHETIC_REGION=north \
YUJIAN_SYNTHETIC_NETWORK=5g \
YUJIAN_SYNTHETIC_ATTEMPTS=30 \
YUJIAN_SYNTHETIC_OUTPUT=/data/models/yujianAI/evidence/m3-preview/cmcc-north-http.json \
npm run ops:probe
```

同一格还必须由 Web/Flutter/iOS/Android/Node/Python 中计划指定的 SDK harness
产生 join 成功数、P50/P95/P99、RTT、丢包和 UDP/TCP/TLS 路径证据。最终
`m3-carrier-network-evidence` 的 `matrix[]` 每格至少包含：

- `carrier` / `region` / `joinAttempts` / `joinSuccesses`；
- `joinLatencyMs.{p50,p95,p99}`；
- `quality.{p95RttMs,p95PacketLossRatio}`；
- `transportCounts.{udp,tcp,tls}`；
- 一个以 `sha256:` 绑定的 `artifacts[]`。

## 4. 设计伙伴状态机

`createPreviewTrial()` / `applyPreviewTrialEvent()` 固定以下规则：

```text
planned -> onboarding -> active <-> paused -> closing -> closed
```

- partner 只保存 `partner-*` 伪名，每个 trial 必须独立 tenant/environment。
- P0/P1 defect 在 active 时自动暂停 trial；没有 fix version 和 regression SHA-256
  不能标记 fixed/closed，有 blocker 时不能 resume。
- token/join/publish-audio/subscribe-audio/data/rpc/reconnect 必须全部 passed。
- 只有撤销 API key、删除资源、生成 audit export digest 且无未关闭 P0/P1 时
  才能 `closed`。closed state 不可继续变更。
- feedback 只记录 ID/分类/优先级/状态，不把用户原文写入 Gate evidence。

## 5. 24/72 小时长稳

```bash
GIT_COMMIT="$(git rev-parse HEAD)" \
YUJIAN_PLATFORM_URL=https://preview.example.cn \
YUJIAN_STABILITY_DURATION_HOURS=24 \
YUJIAN_STABILITY_OUTPUT_ROOT=/data/models/yujianAI/evidence/m3-preview/stability \
npm run ops:stability
```

72 小时轮次将 duration 改为 `72`。runner 以独立 run directory 写入 0600
`plan.json`、每轮 fsync 的 `samples.ndjson` 和最终 `summary.json`。SIGINT/SIGTERM
只能得到 `aborted`，不会补写 completed。最终 reliability evidence 还必须合并 RTC
质量、队列、降级与取消指标，HTTP 采样不替代这些证据。

## 6. 故障注入

不提供“一键破坏生产”脚本。每个 fault task 必须先有 release-owner 维护批准，
批准窗口覆盖 injectedAt 到 recoveredAt，然后在隔离/宣告的演练环境按
`docs/reliability/fault-injection-plan.md` 执行。证据必须记录：

- `status=recovered`、injected/recovered 时间和 recovery milliseconds；
- `ledgerLoss=false`、`residualResources=false`、`productionOverwrite=false`；
- 维护批准 receipt SHA-256 和每场景 artifact SHA-256。

## 7. 最终验证

```bash
YUJIAN_M3_CARRIER_EVIDENCE=/data/models/yujianAI/evidence/m3-preview/carrier.json \
YUJIAN_M3_DESIGN_PARTNER_EVIDENCE=/data/models/yujianAI/evidence/m3-preview/design-partners.json \
YUJIAN_M3_RELIABILITY_EVIDENCE=/data/models/yujianAI/evidence/m3-preview/reliability.json \
npm run m3:evidence:verify
```

policy 要求 9 格运营商矩阵、2 个完整关闭 trial、24/72 小时及 5 个 fault
场景全部同时满足。验证器不接受 partial pass、待补占位或手工声明。
