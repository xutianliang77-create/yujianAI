# 可观测性边界

`slo.yaml` 只冻结目标和告警条件，不代表当前已有 Prometheus/OTel/Grafana 管线。媒体质量
必须区分 P50/P95/P99、队列等待、首帧/首音频、丢包、抖动、取消和降级；Beelink 验收时
将这些字段与双节点、Redis、GPU/模型 runtime 证据一并归档。

platform-api `/metrics` 使用受控路由类别（`/healthz`、`/readyz`、`/platform/v1`、`/other`）和
请求状态，不把资源 ID、participant identity 或正文放入 label；`yujian_http_request_duration_ms`
输出 Prometheus bucket/sum/count，P50/P95/P99 由部署侧按窗口计算。
