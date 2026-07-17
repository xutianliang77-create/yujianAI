# 上游与源码复用策略

版本：v2.0  
日期：2026-07-17  
状态：实施前门禁

## 1. 总原则

语见AI以 LiveKit 开源项目作为兼容上游，以旧无界AI项目作为有限的人工参考来源。

- 可以复制必要源码进入语见AI。
- 永远不得修改无界AI、旧翻译软件或其他旧项目。
- 不允许运行时引用旧目录、软链接或 workspace dependency。
- 不允许直接复制 secret、数据、模型、录音、缓存和构建产物。
- 当前开发优先使用官方发行物和 SDK，不执行旧项目源码复制。

## 2. LiveKit 上游组成

候选官方仓库：

- [livekit/livekit](https://github.com/livekit/livekit)
- [livekit/protocol](https://github.com/livekit/protocol)
- [livekit/sip](https://github.com/livekit/sip)
- [livekit/ingress](https://github.com/livekit/ingress)
- [livekit/egress](https://github.com/livekit/egress)
- [livekit/agents](https://github.com/livekit/agents)
- [livekit/agents-js](https://github.com/livekit/agents-js)
- [livekit/node-sdks](https://github.com/livekit/node-sdks)
- [livekit/client-sdk-js](https://github.com/livekit/client-sdk-js)
- [livekit/client-sdk-flutter](https://github.com/livekit/client-sdk-flutter)

实际采用范围和 commit/tag 必须在 M0 manifest 中冻结，并重新核对 LICENSE、NOTICE、
依赖和安全状态。

## 3. 采用方式

优先级：

1. 直接使用上游 release/image/package。
2. 通过配置、adapter 或外围控制面扩展。
3. 向上游贡献通用修改。
4. 维护最小语见 patch。
5. 只有在无法同步上游时才考虑独立实现，且需要架构评审。

不采用“复制全部仓库后自由改造”的方式。

## 4. Git 模型

建议：

```text
upstream/livekit
        |
mirror branch
        |
clean/<version>
        |
yujian/<version> + ordered patch queue
        |
nightly / preview / stable release
```

每次同步：

1. 拉取上游 tag/commit 和安全公告。
2. 在 clean branch 构建并跑兼容测试。
3. 自动重放 patch queue。
4. 冲突立即失败，不自动选择语见版本。
5. 跑协议、SDK、媒体、SIP、Agent 和升级测试。
6. 更新 manifest、SBOM、NOTICE 和差异报告。
7. 通过后进入 nightly。

## 5. Patch 门禁

每个 patch 需要记录：

| 字段 | 要求 |
| --- | --- |
| Source | upstream repo、base commit/tag |
| Purpose | 中国平台必须解决的问题 |
| Scope | 修改文件和接口 |
| Compatibility | 对协议、SDK、部署和数据影响 |
| Security | 威胁和权限影响 |
| Tests | 自动与人工证据 |
| Rollback | 移除或关闭方式 |
| Upstream | issue/PR 或不回馈原因 |
| Owner | 维护人和复查日期 |

没有记录的 patch 不得进入发行分支。

## 6. 语见扩展策略

- 控制面 API 使用 `/platform/v1`。
- 事件使用 `yujian.*`。
- protobuf package 或 metadata key 使用 `yujian` 命名空间。
- 数据库与上游 schema 分离，禁止直接写上游内部表。
- 官方 SDK 无需语见 patch 即可使用基础 RTC。
- 专有能力通过辅助 SDK、OpenAPI 或 feature negotiation 暴露。

## 7. 无界AI可参考内容

旧项目可能可参考：

- 部署健康检查和故障诊断思路。
- 日志脱敏、错误分类和 provider 抽象。
- 移动端音频设备、权限和真机测试经验。
- 独立 model/RTC 测试 harness。
- 通用的 CI、发布或运维脚本模式。

这些内容必须重新判断是否适合平台产品，不因“已有代码”自动进入迁移清单。

## 8. 明确不迁移

- 翻译 worker、翻译 gateway、翻译模式和翻译 UI。
- 面向消费者 App 的产品状态机。
- 历史 `communicationSessionId` 合同。
- 旧业务数据库和用户记录。
- 旧域名、端口、bundle ID 和生产默认值。
- `.env`、API key、JWT、证书、手机号、录音和模型文件。
- `node_modules`、Pods、Gradle、build、cache 和 outputs。

## 9. 旧源码复制流程

若未来确需复制：

1. 创建独立迁移任务。
2. 冻结源仓库、commit 和 dirty patch hash。
3. 列出文件白名单和排除项。
4. 进行许可证、secret、依赖和安全扫描。
5. 在语见先创建目标合同和失败测试。
6. 复制到隔离 staging 目录。
7. 去除旧命名、路径、配置和隐式依赖。
8. 只保留平台需要的最小代码。
9. 通过单元、合同、集成和回归测试。
10. 保存迁移证据和回滚方案。

复制过程不得在旧项目运行 formatter、build、package install 或任何写操作。

## 10. 许可证与品牌

- LiveKit 关键仓库当前通常采用 Apache-2.0，但每次固定版本都要复核。
- 保留所需版权、LICENSE 和 NOTICE。
- 第三方依赖按最终二进制和分发形态生成清单。
- “LiveKit”是上游项目标识；对外兼容性描述需经过品牌/法律评审。
- 不暗示语见AI由 LiveKit 官方运营、授权或背书。

## 11. 安全门

任何来源代码进入前必须检查：

- secret/credential。
- 硬编码域名、IP、号码和 bucket。
- 未授权遥测或远程调用。
- 安装脚本和 postinstall。
- 容器权限、hostPath、host network。
- 用户内容日志。
- 依赖漏洞和许可证。
- 动态下载模型/二进制的完整性验证。

## 12. 当前结论

- 本轮不复制 LiveKit 或无界AI源码。
- 产品章程、统一架构、平台合同和验收门已获批准。
- 第一份代码交付采用固定 digest 的官方 LiveKit Server、官方 Server SDK、版本
  manifest、兼容合同和最小 Token API，没有修改媒体核心。
