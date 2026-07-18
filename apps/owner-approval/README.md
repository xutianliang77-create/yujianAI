# 语见 Owner 审批台

该静态界面由 `@yujian/owner-approval` 同源托管，展示五项 P1-M0-04 Owner 决定并提交
本人决定。页面不使用 localStorage/sessionStorage，不保存 wrapped token；提交完成或失败后
立即清空输入。

审批台不能签发个人凭据、不能代替 Owner 选择决定，也不会自动更新发布 Gate。实际提交必须
携带管理员通过独立安全通道交付的一次性 OpenBao wrapped token，后端核对 Owner policy 与
metadata、签名、验签并撤销个人 token 后才归档。

已签名任务会展示完整的不可变决定链，并允许同一 Owner 用新的一次性凭据追加
superseding decision。页面必须提交当前 receipt SHA-256 和替代原因；如页面已过期或有并发
提交，后端返回冲突并不使用该次凭据。任何替代都不会覆盖原始证据或自动改变 Gate。

## 真实运行验收

2026-07-18 已由用户确认功能验收通过。Beelink 服务端、OpenBao HA 和本机 Clash 绕行入口
真实完成以下路径：

- aaa、bbb、ccc、ddd Owner 隔离及五项任务读取；
- 一次性 wrapped token 解包、Owner metadata/policy 校验、签名、验签和 revoke-self；
- approve、reject 与 superseding decision 提交；
- sequence 递增、前一 receipt/artifact SHA-256 绑定和原始证据不可覆盖；
- 重复、旧页面、跨 Owner 凭据和未满足合同的 fail-closed 测试；
- 最终 active Owner signing token 为 0，生产发布始终未被审批台自动放行。

bbb Registry/KMS 与 ccc 法律的当前 `reject` 是用户故意执行的负向路径，作为审批台功能
验收证据判定通过。该判定只覆盖审批台的软件功能和安全合同，不把 `reject` 改写为专业
`approve`，也不关闭 P1-M0-04 或任何正式 Gate。
