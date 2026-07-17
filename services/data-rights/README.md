# `@yujian/data-rights`

数据主体请求只保存请求元数据和证据 URI，不保存用户正文、录音或导出文件内容。

- `DataRightsService`：开发/合同验证用内存状态机，submit 支持 tenant 作用域幂等键，并拒绝同 key 的 subject/kind 冲突。
- `PostgresDataRightsService`：生产 SQL adapter，使用 `data_subject_requests` 表和唯一幂等索引；数据库条件 upsert 同样拒绝字段冲突。
- `DataRightsExecutor`：由数据扫描、导出和删除系统注入；`DataRightsService.process` 和
  `PostgresDataRightsService.process` 负责 claim、执行、证据回写和失败拒绝，本服务不自行读取业务数据。

控制面未注入 adapter 时，相关 API 返回 `UPSTREAM_UNAVAILABLE`，不会伪造完成状态。
