# 设计伙伴试用与反馈计划

每个设计伙伴获得独立 tenant/environment、短期 API key、固定配额和支持联系人；使用合成
或已授权数据。试用入口复用 console quickstart，结束时撤销 key、关闭 Room、导出 audit、
删除对象并记录证据。

反馈每周按 P0（无法加入/数据隔离/安全）和 P1（核心媒体流程受阻）分类；P0 必须停止扩展
试用并在复盘中有 owner、修复版本和回归证据，不能用临时手工操作关闭。

实现使用 `packages/platform-contracts/src/preview-trial.ts` 的带 version CAS 状态机。
P0/P1 自动暂停 active trial，不得在 blocker 未关闭时 resume。trial 只有在七个
核心流程全通过、API key 撤销、资源删除和 audit digest 完整时才能 closed。
执行和最终证据见 [M3 Preview 执行与证据合同](../acceptance/M3_PREVIEW_EXECUTION_AND_EVIDENCE.md)。
