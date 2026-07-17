# ADR-0002：Agent 与 Provider 边界

状态：accepted

决策：Agent worker、provider plugin、tool policy 和 deployment controller 通过 `@yujian/platform-contracts` 交互；Translation Runtime 不纳入本项目，Speech Runtime 只提供共享音频能力。高风险工具必须有角色授权、幂等键、超时和审计。
