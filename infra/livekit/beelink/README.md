# Beelink 语见服务器验收环境

Beelink 是当前语见AI唯一服务器端和验收环境：Linux `x86_64`、Tailscale 地址
`100.110.127.117`、一块 NVIDIA GeForce RTX 5090。远程入口使用
`beelink@100.110.127.117`，不使用旧的 `ssh 5090` alias。

## 责任边界

- 两个语见 RTC 兼容节点运行官方固定 digest 的 LiveKit Server `v1.13.3`，共享 Redis。
- RTC SFU 不使用 GPU；RTX 5090 保留给后续 Agent/模型 runtime。
- 当前机器是 `integration`，不是 production；只使用合成数据和短期测试凭据。
- Mac 工作区和手机是客户端；Beelink 不安装 Flutter/Chrome，只运行服务器和 Node 集成阶段。

## 开机后的唯一验收入口

在 Beelink 克隆本仓库后，根据 `acceptance.env.example` 从安全存储注入环境变量，执行：

```bash
npm run beelink:preflight
npm run beelink:acceptance
```

验收会检查 Linux/AMD64、Tailscale、Docker、Node 24、唯一 RTX 5090，随后执行上游联网校验、合同/单元测试和双节点 Room/Data/RPC/音频测试。Web/Flutter Web 兼容测试在本机客户端运行，报告写到被 Git 忽略的 `outputs/client/`。

不得提交 env 文件、JWT、真实用户媒体或测试凭据。验收完成后脚本会关闭双 RTC 节点。
