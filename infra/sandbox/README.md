# Nightly developer sandbox

Sandbox 是短时、合成数据、独立 tenant/environment 的开发入口，不承诺生产 SLA。启动器必须
注入短期 RTC/API credentials，结束时销毁 Room、key、Redis 数据和临时对象；禁止使用真实
号码、录音、模型 secret 或旧项目路径。
