# GA Readiness Review

状态：决策合同；当前未创建 RC，未授权 GA。

| 角色 | 必须确认 |
| --- | --- |
| Product | 范围、价格、SLA、迁移和支持政策 |
| Platform/SRE | SLO/error budget、容量、备份恢复、on-call |
| Security | 漏洞、SBOM、签名、权限、数据删除和供应链 |
| Legal/Compliance | PIPL/等保/ICP/AI/SIP 适用结论与资质 |
| Finance | usage ledger、价格版本、发票和 provider 对账 |
| RTC/Agent | 目标 SDK、节点、provider、GPU 和回滚证据 |

任何 P0、未关闭合规 blocker、缺失 Beelink 运行证据或未签名 artifact 都阻断 GA。

## 决策顺序

1. 当前 source commit 生成 artifact manifest、安全审计、SBOM/签名和运行证据。
2. 将 Gate 0–10 各自状态、evidence URI 和 SHA-256 固定为唯一快照。
3. `release:create-rc-freeze` 写入新文件；只在 11 个 Gate 全为 passed 时产生 `frozen`，否则
   产生 `rejected`。输出还返回 RC 文件自身 SHA-256。
4. Product、SRE、Security、Legal、Compliance、Finance、RTC/Agent 和 Release 八类 Owner
   分别提交不可变 receipt。
5. `release:create-ga-decision` 必须同时接收 RC 路径与 `freezeSha256`。approve 仅接受 frozen
   RC、11 Gate passed 和八类 receipt；reject 至少绑定一位 Owner receipt。
6. PostgreSQL archive 再校验 RC artifact digest、Gate snapshot digest 和 Owner receipt；
   `ga_decisions.release_candidate_id` 唯一，不允许覆盖原决定。

Owner 的 reject 是有效阻断结论，不能解释为通过。结论变化必须新建后续 RC/GA 决策并保留
旧 artifact；工具和数据库均不提供 update/overwrite 路径。
