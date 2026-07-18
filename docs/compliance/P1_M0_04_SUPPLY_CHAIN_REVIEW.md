# P1-M0-04 供应链、许可证与 Owner 评审记录

日期：2026-07-18

当前镜像 run：`p1-m0-04-20260718T074700Z`

候选镜像 run：`p1-m0-04-candidates-20260718T084500Z`

状态：当前/候选证据已验签；四类个人 Owner 已指定、联系/备份/签字待补；技术门禁阻断

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
| Redis | 7.2.14-alpine | 11 | 0 | 可进入隔离回归，未批准部署 |
| PostgreSQL | 16.14-bookworm | 42 | 27 | 阻断 |
| PostgreSQL 备选 | 16.14-alpine | 42 | 1 | 阻断；需解决 `gosu` Go stdlib Critical 且评审基础发行版切换 |
| OpenBao | 2.5.4 | 23 | 13 | 阻断；跨 2.4→2.5 次版本 |

两个 PostgreSQL 候选互斥，所以“候选合计 41 Critical”不是一组可部署组合。没有为
OpenBao 可能的自版本匹配创建 VEX/豁免；它必须由实名 `security-owner` 按原始 advisory
复核。候选证据索引为
[`p1-supply-chain-candidate-evidence.json`](../acceptance/p1-supply-chain-candidate-evidence.json)。

## 2. LICENSE、NOTICE 与商标边界

4 份 SBOM 共识别 647 个包，其中 465 个包的 SPDX `licenseDeclared` 为 `NOASSERTION`。
这不自动表示许可证不兼容，但说明当前自动清单不足以形成最终法律结论。发布前必须：

1. 对 `NOASSERTION` 包回查固定源码/发行物许可证并补全归属；
2. 生成与实际分发镜像一致的 LICENSE/NOTICE；
3. 确认 Apache-2.0、BSD 等许可证的 notice/source-offer 要求；
4. 复核“语见AI兼容 LiveKit”的描述，不暗示拥有 LiveKit 商标；
5. 由个人 `legal-owner` 和 `compliance-owner` 对中国分发形态留下签字记录。

## 3. 签名证据边界

签名使用加密的工程证据密钥，私钥位于 evidence 根目录之外且 mode `0600`。报告只归档
公钥、Sigstore bundle 和验签日志。它证明本次镜像/SBOM/扫描声明未被修改，但不是生产
发布身份，也没有把签名附着到语见控制的 OCI registry，未使用透明日志。正式 RC 仍需
registry digest 签名、发布身份、密钥托管/轮换和 `release-owner` 批准。

## 4. Owner 记录

角色责任已经冻结，但不能替个人负责人签字。本表是 P1-M0-04 的正式待签记录：

| Owner | 必须完成的决定 | 个人负责人 | 决定/日期 | 当前状态 |
| --- | --- | --- | --- | --- |
| `security-owner` | Critical 修复或逐项时限豁免；High 风险评审 | aaa | eee 于 2026-07-18 指定；安全决定待签 | 已指定；阻断 |
| `release-owner` | registry 签名身份、归档、回滚版本 | bbb | eee 于 2026-07-18 指定；发布决定待签 | 已指定；阻断 |
| `legal-owner` | LICENSE/NOTICE、source offer、商标措辞 | ccc | eee 于 2026-07-18 指定；法律意见待签 | 已指定；阻断 |
| `compliance-owner` | 中国分发、数据与产品适用性复核 | ddd | eee 于 2026-07-18 指定；合规决定待签 | 已指定；阻断 |

Owner 签字必须引用 commit、镜像 digest、本 run id 和决定；只写角色名或口头确认无效。
用户已提供实名与任命批准人，但未提供联系方式、备份人或四位受任人的本人确认，
因此当前只记录为 `assigned-pending-signoff`。
四类个人的资格、职责分离、联系人和任命字段见
[`P1_M0_04_OWNER_NOMINATION.md`](../governance/P1_M0_04_OWNER_NOMINATION.md)。

## 5. 根因与修复顺序

问题不是扫描脚本误把门禁写坏：固定镜像版本较旧，基础系统包和内置 Go 依赖已经出现
当前漏洞库中的 Critical；此前流水线只验证 package-lock SBOM 结构，没有扫描实际运行
镜像，也没有定期刷新固定 digest。

1. 候选补丁版本已拉取并重新扫描；运行容器保持不变。
2. 获得进一步运行授权后，只对零 Critical 的 Redis 候选执行竞争/重建回归；PostgreSQL
   和 OpenBao 先继续修复或形成可审计的逐项评审。
3. 对通过安全门禁的 PostgreSQL 候选执行备份恢复与 migration 回归，对 OpenBao
   执行 Raft snapshot/TLS/HA 回归。
4. 由 Owner 选择升级或逐项、限期、可追踪的例外；禁止整体忽略 scanner 结果。
5. 升级获得批准后再修改固定 digest、重建服务并生成新 run。
6. 新 run 必须满足未豁免 Critical 为 0、许可证清单完成、Cosign 验签通过并有个人签字。

机器可读索引见
[`p1-supply-chain-evidence.json`](../acceptance/p1-supply-chain-evidence.json)。
