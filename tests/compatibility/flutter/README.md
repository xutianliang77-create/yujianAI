# 语见 RTC Flutter 兼容工程

本目录是隔离测试 target，只验证官方 `livekit_client 2.8.1` 对语见 RTC 的兼容性，
不属于任何生产 App。

基础检查：

```bash
PUB_HOSTED_URL=https://pub.dev flutter pub get
dart analyze
flutter test
flutter build web --base-href /flutter/
```

真实 Chrome 入房测试通过同源测试服务在运行时获取短期 token；token 不进入 URL、日志或仓库。
`/flutter/?autorun=1` 会在同一 Room 中分别连接 primary/secondary 两个 RTC 入口，使用
官方 Flutter SDK 发布麦克风音频 Track，并在另一节点等待 `TrackSubscribedEvent` 和
`RemoteAudioTrack` RTP bytes。Beelink runner 为隔离 target 开启 fake media device；这
只用于兼容验收，不进入生产 App。Chrome DevTools Protocol 读取明确的通过/失败信号；该
参数只存在于兼容测试工程，不进入生产 App。
