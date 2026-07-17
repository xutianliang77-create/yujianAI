# Nightly developer sandbox

Sandbox 是短时、合成数据、独立 tenant/environment 的开发入口，不承诺生产 SLA。启动器必须
注入短期 RTC/API credentials，结束时销毁 Room、key、Redis 数据和临时对象；禁止使用真实
号码、录音、模型 secret 或旧项目路径。

Linux/CI 的真实生命周期入口为 `infra/sandbox/run-nightly.sh`。它要求 digest 固定的
LiveKit/Redis 镜像和短期 key/secret，启动两个 sandbox 容器，记录脱敏状态，并在退出时执行
`down --volumes --remove-orphans`；残留容器会使任务失败。该入口只验证 sandbox 生命周期和
清理，不替代租户隔离、Webhook 或完整 Gate 1 验收。
