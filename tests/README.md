# Tests

| 目录 | 范围 |
| --- | --- |
| `compatibility/` | LiveKit Token、Server API、Webhook、协议和多 SDK |
| `contracts/` | 语见 OpenAPI、事件和跨语言 fixtures |
| `integration/` | 控制面、LiveKit、Agent、SIP、媒体任务、计量和数据库 |
| `media/` | 音视频、Data、TURN、弱网、设备和运营商矩阵 |
| `load/` | 并发、长稳、背压、网络损伤和故障注入 |
| `security/` | Tenant 隔离、Token、Agent、SIP、Webhook 和供应链 |
| `private-deployment/` | 离线安装、升级、回滚、备份和恢复 |

模型评测和真机参数实验必须使用独立 model-lab，不得把实验开关写入生产 App。

`packages/contracts/test/contracts-v1.test.mjs` 只验证历史翻译合同未被意外破坏，
不代表新平台合同已经实现或通过。新开发先建立 LiveKit 兼容测试，再实现控制面。

当前真实集成测试：

```bash
npm run rtc:up
YUJIAN_RTC_PRIMARY_URL=ws://127.0.0.1:7880 \
YUJIAN_RTC_SECONDARY_URL=ws://127.0.0.1:7980 \
LIVEKIT_API_KEY=<local-key> \
LIVEKIT_API_SECRET=<local-credential> \
YUJIAN_PLATFORM_TEST_CREDENTIAL=<environment-scoped-test-credential> \
npm run test:integration:rtc
```

该测试通过官方 `RoomServiceClient` 创建/查询/删除 Room，通过语见平台 API 签发
Room token，再用官方 `@livekit/rtc-node` 从两个节点入口连接 Participant，验证环境
隔离、可靠 Data、RPC 和非静音 PCM 音频 Track。当前所有测试统一在 Beelink 服务器
执行；本机只编写代码与测试，不运行验证。

跨 SDK 兼容 target：

- `compatibility/web/`：固定 `livekit-client 2.20.1`，真实 Chrome 验证双节点、Data、
  RPC 和音频 Track RTP。
- `compatibility/flutter/`：固定 `livekit_client 2.8.1`，隔离执行 API 合同、Dart分析、
  Flutter Web 构建和真实 Chrome 入房；自动入口从 primary/secondary 双节点发布并订阅
  音频 Track，校验 `TrackSubscribedEvent` 与 RTP bytes。

平台 token 端点会在配置了 `YUJIAN_RTC_PRIMARY_URL` 与 `YUJIAN_RTC_SECONDARY_URL` 时
轮询返回 `nodeId` 和对应 `url`。双节点 `/readyz` 是全节点门禁，但当前切片不承诺运行中
节点故障迁移；完整故障注入等待后续 Beelink Gate。
