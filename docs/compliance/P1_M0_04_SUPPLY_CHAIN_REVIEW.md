# P1-M0-04 供应链、许可证与 Owner 评审记录

日期：2026-07-18

当前镜像 run：`p1-m0-04-20260718T074700Z`

候选镜像 run：`p1-m0-04-candidates-20260718T084500Z`

Redis 回归 run：`p1-m0-04-redis-regression-20260718T101047Z`

安全重建 run：`p1-m0-04-remediated-scan-20260718T120238Z`

安全重建生产回归 run：`p1-m0-04-remediated-regression-20260718T162844Z`

许可证整改 run：`p1-m0-04-license-remediation-20260718T165733Z`

状态：PostgreSQL/OpenBao 安全重建达到 Critical 0、High 0；私有 Registry、OpenBao KMS
签名、SPDX attestation 和外部读取通过。五份 Owner 原始 receipt 已归档；aaa 安全已追加
sequence 1 批准，bbb Registry/KMS 与 ccc 法律均已追加 sequence 1 驳回，ddd 中国分发已
追加 sequence 1 批准。当前 bbb Redis、aaa 安全与 ddd 中国分发批准，bbb Registry/KMS 和
ccc 法律驳回。PostgreSQL/OpenBao 隔离生产回归已通过且当前 P2 未切换；335 个原始
`licenseDeclared=NOASSERTION` 已在不覆盖原 SBOM 的独立结论层中全部分类，结论层
`licenseConcluded=NOASSERTION` 为 0，并已随包提供实际 OpenBao 源码。`reedsolomon v1.0.0`
仍有 1 个显式法律待判项；两项 Owner reject、当前运行镜像 76 个 Critical、aaa 原始决定
audit 缺口及 Owner 专业资格材料仍阻断。

## 1. 范围与结论

本次只扫描语见当前固定的 Linux AMD64 镜像：LiveKit Server v1.13.3、Redis 7.2.7、
PostgreSQL 16.4 和 OpenBao 2.4.1。平台 API 当前没有已部署的发布镜像，因此不把源码验收
冒充镜像证据。`ai-phone-*` 不属于本仓库范围，未扫描、未修改。

Syft 为每个镜像生成 SPDX 2.3，Grype 使用同一次数据库快照扫描，Cosign v3 对包含镜像
digest、SBOM/扫描哈希和工具哈希的聚合声明签名并验签。原始文件全部位于 Beelink
`/data/models/yujianAI/evidence/p1-m0-04/p1-m0-04-20260718T074700Z`，mode 为 `0600`。

零 Critical 策略没有通过，不能关闭 P1-M0-04、Gate 0、Gate 1 或生产发布：

| 镜像 | SPDX 包 | High 匹配 | Critical 匹配 | Critical 唯一 advisory | 结果 |
| --- | ---: | ---: | ---: | ---: | --- |
| LiveKit Server v1.13.3 | 137 | 1 | 0 | 0 | 通过该漏洞阈值 |
| Redis 7.2.7 | 23 | 82 | 11 | 9 | 阻断 |
| PostgreSQL 16.4 | 149 | 210 | 42 | 21 | 阻断 |
| OpenBao 2.4.1 | 338 | 87 | 23 | 20 | 阻断 |
| 合计 | 647 | 380 | 76 | 按镜像计 50 | 阻断 |

没有创建漏洞豁免。Redis 和 OpenBao 的所有 Critical 匹配都有已知修复版本；PostgreSQL
镜像的 42 个匹配中 16 个有修复、12 个未修复、14 个被数据源标记为 `wont-fix`。完整
advisory、包版本、修复版本和数据源保留在原始 Grype JSON，不能只依据汇总表批准发布。

### 1.1 候选补丁镜像扫描

用户授权的边界仅为拉取与扫描，不切换运行容器。候选镜像使用与当前镜像完全相同的
Grype DB 快照，已生成 SPDX、Grype 和 Cosign 验签证据：

| 服务 | 候选 | 当前 Critical | 候选 Critical | 决定 |
| --- | --- | ---: | ---: | --- |
| Redis | 7.2.14-alpine | 11 | 0 | 隔离回归通过且 bbb 已批准；Registry/KMS freeze 驳回，未获部署授权 |
| PostgreSQL | 16.14-bookworm | 42 | 27 | 阻断 |
| PostgreSQL 备选 | 16.14-alpine | 42 | 1 | 阻断；需解决 `gosu` Go stdlib Critical 且评审基础发行版切换 |
| OpenBao | 2.5.4 | 23 | 13 | 阻断；跨 2.4→2.5 次版本 |

两个 PostgreSQL 候选互斥，所以“候选合计 41 Critical”不是一组可部署组合。没有为
OpenBao 可能的自版本匹配创建 VEX/豁免；它必须由实名 `security-owner` 按原始 advisory
复核。候选证据索引为
[`p1-supply-chain-candidate-evidence.json`](../acceptance/p1-supply-chain-candidate-evidence.json)。

Redis 候选已在 loopback-only、独立 `/data` 数据目录完成初始、容器重启和容器删除重建
三个阶段。每阶段的限流竞争为 100/20，Token quota 竞争为 30/3，租约保持单 owner；
AOF marker 在重启/重建后恢复，清理后 DB size 为 0。候选容器已删除，受保护的 P2 Redis
容器 ID、固定 7.2.7 digest 和 `restartCount=0` 未变化。该结果不包含部署批准。

### 1.2 PostgreSQL/OpenBao 安全重建

由于官方补丁候选仍有 Critical，本轮使用固定上游源码、固定 builder 和最小依赖 patch
生成两个本地 pre-registry 候选；没有修改当前 P2 容器：

| 服务 | 本地 image ID | Critical | High | 许可证载荷 | 状态 |
| --- | --- | ---: | ---: | --- | --- |
| PostgreSQL 16.14 Alpine + gosu 1.19/Go 1.25.12 | `sha256:290eff57...` | 0 | 0 | PostgreSQL + gosu Apache-2.0 | 隔离生产回归通过；aaa/ddd 当前批准；ccc 法律驳回；未授权切换 |
| OpenBao 2.5.4 + x/crypto 0.52/x/net 0.55/Go 1.25.12 | `sha256:5aa72789...` | 0 | 0 | MPL-2.0 + 官方 dependency notice | 2.4→2.5 隔离生产回归通过；aaa/ddd 当前批准；ccc 驳回；未授权切换 |

原三项 High 已通过 Go 1.25.12 与 x/net 0.55.0 消除，未建立漏洞豁免。aaa 已追加绑定旧
receipt/artifact 哈希的 sequence 1 approval；原 reject、签名和 receipt 未覆盖。该安全批准
不替代许可证/合规结论或正式 Gate。
工程签名 statement SHA-256 为
`a7f9d159d2a27dd2727afd523ccd1204f46d4cf8a1d53354539b46348e1417ea`，bundle SHA-256
为 `3ab64698f8e039bbaf8e8a5068e69f3e30f2720b323465279fd0b799d7195e6c`。机器索引见
[`p1-remediated-candidate-evidence.json`](../acceptance/p1-remediated-candidate-evidence.json)。

生产回归 run 在独立 bridge、仅 loopback 端口和独立 `/data` 数据目录执行。PostgreSQL
应用 001–011，事务 usage/audit/outbox 同时可见，stale CAS 被拒绝；`pg_dump` custom-format
隔离恢复 RTO 为 722 ms，迁移、outbox/audit/usage 和 revoked API-key metadata 全部恢复，
容器删除重建后数据仍在。OpenBao 从 2.4.1 三节点逐节点升级到 2.5.4-yujian.2，升级前、
升级后和快照恢复后均为 3 peers/3 voters；TLS、Transit 旧签名、运行 secret、leader 停止后
survivor 读取及 API key create/rotate/revoke/restart recovery 全部通过。报告 SHA-256 为
`b3592a9863a002e0480f1af70b85985481e6ae1909b3394b9b05e88cc2345169`，所有证据 mode 0600；
候选容器/网络已删除，当前 P2 五个容器 ID、镜像、healthy 和 restart=0 前后相同。

## 2. LICENSE、NOTICE 与商标边界

当前 4 份运行 SBOM 共识别 647 个包，其中 465 个包的 SPDX `licenseDeclared` 为
`NOASSERTION`；两个安全重建候选共 405 个包，其中 335 个原始声明为 `NOASSERTION`。
原始 SBOM 与声明保持不可变，整改 run 另生成逐包 inventory 和 SPDX `licenseConcluded`
层：

| 分类 | 数量 | 处理 |
| --- | ---: | --- |
| 固定许可证证据 | 331 | 映射到 Apache-2.0、BSD、MIT、MPL-2.0、PostgreSQL 等表达式 |
| 无独立内容的 Alpine 虚拟包 | 1 | `NONE`，保留无内容理由 |
| OCI 镜像聚合记录 | 2 | `LicenseRef-Yujian-Image-Aggregate`，指向逐包 SPDX 与 NOTICE |
| 法律待判 | 1 | `LicenseRef-Yujian-ReedSolomon-Pending-Legal` |

因此 335 条均有显式工程分类，两个结论层 SPDX 的 `licenseConcluded=NOASSERTION` 为 0。
整改包还实际包含 OpenBao 37,337,832 字节官方源码归档、构建配方、主许可证、342 段依赖
许可证、NOTICE、SHA256SUMS 和已验工程签名；manifest SHA-256 为
`b8ed96caebb64f3121d0ab9f33bb33d8e27eb0f0aa7e62d3a287c9f2ac043d79`。

唯一未作法律推断的依赖是 `github.com/yeqown/reedsolomon@v1.0.0`：tag commit
`5441098c...` 不含 LICENSE/COPYING/NOTICE，上游到 2026-03-08 commit `c5f4bc9...` 才增加
MIT 文件。后续 MIT 文本已归档但没有静默追溯到旧 tag。ccc 必须判断该证据是否足以分发，
并同时复核 source offer、NOTICE 和商标措辞；当前 ccc sequence 1 reject 保持有效。
机器索引见
[`p1-license-remediation-evidence.json`](../acceptance/p1-license-remediation-evidence.json)。

## 3. 签名证据边界

工程 scan statement 继续使用独立工程证据密钥。生产候选则已推送到语见控制的私有
Registry，并用 OpenBao transit key 对四个 digest 附着 Cosign 签名与 SPDX attestation；
公钥 hash 为 `5f362c145a7b...`。本机客户端已通过 TLS/认证读取全部 manifest/blob 并校验 digest。
bbb 已本人审阅 repository/KMS URI，并以 sequence 1 再次签名驳回该冻结项；sequence 0
原始记录保持不变。在形成新的有效批准前不得执行生产切换。Redis 候选的独立决定为签名批准，
但不能覆盖 freeze 驳回。

生产执行合同与 fail-closed 工具见
[`P1_M0_04_PRODUCTION_OCI_SIGNING.md`](../governance/P1_M0_04_PRODUCTION_OCI_SIGNING.md)。
技术配置和签名已完成；bbb freeze 决定为 reject，`releaseOwnerFreezeConfirmed=false`、
`releaseAuthorized=false`。

## 4. Owner 记录

角色责任已经冻结，五项个人决定也已归档。本表是 P1-M0-04 的正式决定记录：

| Owner | 必须完成的决定 | 个人负责人 | 决定/日期 | 当前状态 |
| --- | --- | --- | --- | --- |
| `security-owner` | Critical 修复或逐项时限豁免；High 风险评审 | aaa | 2026-07-18 原 reject；sequence 1 approve | 当前批准；原决定保留 |
| `release-owner` | registry 签名身份、归档、回滚版本 | bbb | 2026-07-18 Redis approve；Registry/KMS sequence 0/1 均 reject | 两项已签；freeze 当前驳回阻断 |
| `legal-owner` | LICENSE/NOTICE、source offer、商标措辞 | ccc | 2026-07-18 sequence 0/1 均 reject | 当前驳回；阻断 |
| `compliance-owner` | 中国分发、数据与产品适用性复核 | ddd | 2026-07-18 原 reject；sequence 1 approve | 当前批准；原决定保留 |

Owner 签字必须引用 commit、镜像 digest、本 run id 和决定；只写角色名或口头确认无效。
用户已提供角色代号与任命批准人，但未提供联系方式、备份人或专业资格材料。五项签名
receipt 只证明对应 key 与一次性凭证完成决定，不自动证明实名或专业资格；当前两项 reject
已足以保持发布阻断。aaa、bbb Registry/KMS 与 ccc 法律的 sequence 1 审计完整，但 aaa 原始
sequence 0 仍保留早期 audit 缺口。
四类个人的资格、职责分离、联系人和任命字段见
[`P1_M0_04_OWNER_NOMINATION.md`](../governance/P1_M0_04_OWNER_NOMINATION.md)。

## 5. 根因与修复顺序

问题不是扫描脚本误把门禁写坏：固定镜像版本较旧，基础系统包和内置 Go 依赖已经出现
当前漏洞库中的 Critical；此前流水线只验证 package-lock SBOM 结构，没有扫描实际运行
镜像，也没有定期刷新固定 digest。

1. 候选补丁版本已拉取并重新扫描；Redis 零 Critical 候选的隔离竞争/重启/重建回归已
   通过；PostgreSQL/OpenBao 最小安全重建也达到零 Critical，运行容器保持不变。
2. bbb 已批准 Redis 候选，但 Registry/KMS freeze 的 sequence 1 仍为 reject；在 bbb 基于
   后续整改证据追加有效 superseding approval 前，不得修改 Compose、固定 manifest 或当前 P2 Redis。
3. PostgreSQL 备份恢复/migration/outbox/CAS 与 OpenBao 2.4→2.5 Raft snapshot/TLS/HA/
   API-key 回归已通过；新证据不自动改变已有 Owner reject，确需改变只能追加 superseding decision。
4. 335 条声明缺口已形成不覆盖原 SBOM 的逐项结论；ccc 仍需对唯一 pending-legal 项、
   source offer、NOTICE、商标和中国分发适用性作专业结论。
5. 由 Owner 选择升级或逐项、限期、可追踪的例外；禁止整体忽略 scanner 结果。
6. 升级获得批准后再修改固定 digest、重建服务并生成新 run。
7. 新 run 必须满足未豁免 Critical 为 0、许可证清单完成、Cosign 验签通过并有对应 Owner
   的当前有效批准；旧 receipt、artifact 和签名不得覆盖。

机器可读索引见
[`p1-supply-chain-evidence.json`](../acceptance/p1-supply-chain-evidence.json)。
