# `@yujian/billing`

`UsageLedger` 是账务 adapter，不替代财务系统。用量记录按 `dedupeKey` 幂等，价格计划和发票
状态保持版本化；provider 对账通过 `reconcile` 比较分，差异通过 `createAdjustment` 生成
可审计的 credit/debit adjustment，绝不静默覆盖原发票金额。

查询接口提供按 tenant 列出票据、按 ID 获取发票，以及列出发票冲正；业务 API 接入时必须
继续使用环境级 credential 和 `billing_admin` 权限，不能把账单数据暴露给普通 RTC key。

`PostgresBillingReadModel` 提供控制面只读 SQL 投影，按 invoice 聚合明细行。
`PostgresBillingSettlementService` 是独立财务写模型：事务生成草稿、使用版本 CAS 签发/付款/
作废、把审批 receipt 写入不可变跃迁表，并按 statement digest 幂等执行 provider 对账。
只有 issued/paid 发票可导出到内容寻址的对象存储；控制面不能调用这些写操作。
