# ADR-0002：Agent 与 Provider 边界

状态：accepted

Owner：`agent-owner`
评审人：`security-owner`、`compliance-owner`
关闭前置：Gate 0 owner 记录、Gate 4 provider/5090 runtime 和 artifact 验证证据

决策：Agent worker、provider plugin、tool policy 和 deployment controller 通过 `@yujian/platform-contracts` 交互；Translation Runtime 不纳入本项目，Speech Runtime 只提供共享音频能力。高风险工具必须有角色授权、幂等键、超时和审计。
