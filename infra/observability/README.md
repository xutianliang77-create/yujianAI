# 可观测性边界

`slo.yaml` 只冻结目标和告警条件，不代表当前已有 Prometheus/OTel/Grafana 运行管线。媒体质量
必须区分 P50/P95/P99、队列等待、首帧/首音频、丢包、抖动、取消和降级；Beelink 验收时
将这些字段与双节点、Redis、GPU/模型 runtime 证据一并归档。

platform-api `/metrics` 使用受控路由类别（`/healthz`、`/readyz`、`/platform/v1`、`/other`）和
请求状态，不把资源 ID、participant identity 或正文放入 label；`yujian_http_request_duration_ms`
输出 Prometheus bucket/sum/count，P50/P95/P99 由部署侧按窗口计算。

客户端 telemetry 写入后同时生成全局低基数 histogram：RTT、jitter、packet-loss ratio、bitrate
和 audio level。指标不包含 tenant/project/environment、node、Room 或 participant label；带身份的
原始样本只保留在 PostgreSQL。`RtcTelemetryRetentionWorker` 默认分批删除 7 天前样本，生产可用
`YUJIAN_RTC_TELEMETRY_RETENTION_DAYS` 设置 1–90 天。长期趋势只通过无身份指标的私有
Prometheus-compatible remote-write 保存。

- `rules/rtc-quality.yml`：P50/P95/P99、丢包/无样本 recording 与 alert rules；
- `grafana/provisioning/` 和 `grafana/dashboards/`：只读 RTC 质量 dashboard provisioning；
- `prometheus-production.example.yml`：Kubernetes service discovery 和私有 remote-write 边界，
  token 只从挂载文件读取。
- `rules/agent-provider-alerts.yml` 和 `grafana/dashboards/agent-provider.json`：Provider 失败率、
  P95 延迟、文本/音频/图像 usage 和价格版本归因后的 micros 成本；不使用 tenant、
  dispatch 或 trace 作为 metric label。带范围引用的数值明细只进 PostgreSQL。
- `rules/media-quality-alerts.yml` 和 `grafana/dashboards/media-quality.json`：SIP PDD、接通率、
  connected duration、DTMF attempt 和低基数 terminal reason；provider 只有部署 allowlist 中的
  固定名称，其余统一为 `other`，不使用号码、Call/Room/environment label。

上述文件尚未加载到真实 Prometheus/Grafana，也未采集完整 SDK 矩阵；当前只能证明配置与代码
已提供，不能证明告警触发、长期保留或 Gate 3/Gate 4 通过。
