# On-call 与 Error Budget

## 预算判定

每个窗口使用 `goodEvents / totalEvents` 和冻结的 availability target 计算失败比例。实际失败
比例除以允许失败比例得到 `consumedRatio`：

- `0–0.5`：`normal`，允许常规变更。
- `>0.5 且 <1`：`slowdown`，只允许低风险、可快速回滚的变更。
- `>=1`：`freeze`，停止非修复发布并进入事故处理。

同一 service/window 只允许一份证据；重复写入必须完全一致，否则拒绝。过期、缺失或无法验证
的 SLI 不得按 0 故障处理，执行侧必须形成 blocked evidence。

## 事故状态机

`triggered → acknowledged → mitigated → resolved`，不允许跳跃或回退。每次跃迁绑定 actor、
evidence URI 和时间；resolved 还必须提供脱敏 postmortem URI。相同 alert fingerprint 只生成
一个事故，指纹对应的 service/severity/escalation policy 不得改变。

P0/P1 必须进入公开状态页、30/60 分钟更新节奏、回滚评估和复盘。未关闭 P0/P1 或任一服务
处于 `freeze` 时，release manifest 的禁止状态阻断 RC。
