# GA 当前版本安全审计合同

每个 RC 必须对同一 source commit 和 release digest 执行以下八项：secret scan、SAST、依赖
扫描、容器扫描、SBOM、制品签名、渗透测试和合规评估。每项记录状态、不可变 evidence URI、
SHA-256、Critical 和 High 数量。

`release:create-security-audit` 使用 exclusive create 生成 manifest：八项必须恰好各一份；
`passed` 不允许遗留 Critical/High；任一 failed 或未关闭发现使总结果 failed；not-run/blocked
使结果 incomplete。`PostgresReleaseGovernanceService` 以 release digest 唯一归档 manifest 和
逐项证据，不允许用历史版本报告覆盖当前 RC。

仓库工具不执行渗透、不豁免漏洞、不签名制品，也不替代 security/legal/compliance Owner。
当前实际扫描、签名、渗透和合规评估完成前 Gate 7 保持 blocked。
