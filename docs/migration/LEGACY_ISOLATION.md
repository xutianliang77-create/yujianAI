# 旧项目隔离与迁移规则

## 旧项目

以下目录不是语见AI工作区的一部分：

- `/Users/xutianliang/Downloads/翻译软件app`
- `/Users/xutianliang/Downloads/ai phone`
- 任何名称为无界AI的旧客户端、服务端或部署目录

## 允许迁移

- 已验证的功能需求和用户反馈。
- 架构决策、数据合同和测试用例描述。
- 模型评测结果与参数结论。
- 经单独审计后决定重写或复制迁入的源码模块。

源码复制的前提：

- 不修改旧项目。
- 记录源仓库、commit、未提交 patch hash 和文件白名单。
- 在语见AI先冻结目标合同和验收用例。
- 复制后改为 `@yujian/*`、`yujian_*` 和 `ai.yujian.*` 命名。
- 不保留对旧目录的软链接、workspace dependency 或运行时 import。

## 禁止直接迁移

- `.env`、JWT secret、API key、证书和号码凭据。
- SQLite、PostgreSQL dump、用户字幕、录音和声音样本。
- `build/`、Pods、Gradle、node_modules、模型和缓存。
- 未确认归属、许可证或测试状态的源码。
- 旧 bundle ID、包名、端口和生产域名默认值。
- 旧项目整库复制、脏工作区无选择复制和未记录来源的文件。

## 代码迁移门

每个迁移模块必须记录：

1. 来源和 commit。
2. 能力边界。
3. 是否重写。
4. 许可证和安全扫描。
5. 新合同与旧行为差异。
6. 单元、合同、集成和回滚验证。

没有迁移记录的旧代码不得进入本仓库。

当前来源和 LiveKit 采用清单见
[SOURCE_REUSE_AND_UPSTREAM_STRATEGY.md](SOURCE_REUSE_AND_UPSTREAM_STRATEGY.md)。
