# 上游许可证、NOTICE、商标与 SBOM 门禁

LiveKit upstream components are consumed under their published licenses and retain upstream
copyright/NOTICE text. The `@yujian/*` adapter code is separate and must not imply LiveKit
trademark ownership. Release requires:

1. manifest tag/commit and image digest match;
2. third-party notice inventory updated;
3. SPDX SBOM generated from lockfile and container artifacts;
4. vulnerability and secret scans attached to the release evidence bundle;
5. legal-owner approval for redistribution and Chinese trademark/product wording.

An unknown license, missing source offer, signature mismatch or unreviewed media patch blocks release.

## Current review record

The 2026-07-18 Beelink run generated SPDX and signed scan evidence for four pinned images. It found
76 unwaived Critical matches and 465 of 647 packages with `licenseDeclared=NOASSERTION`. This is an
evidence-complete but blocked result, not a legal approval. See
`docs/acceptance/p1-supply-chain-evidence.json` and
`docs/compliance/P1_M0_04_SUPPLY_CHAIN_REVIEW.md`. Release remains blocked until remediation,
complete attribution, registry signing and personal legal/compliance/security/release signoff.

The remediated PostgreSQL/OpenBao build and scan run reached zero Critical and zero High findings
and embedded the PostgreSQL, gosu, OpenBao MPL-2.0 and generated OpenBao dependency notices. The
original SPDX remains immutable with 335 `licenseDeclared=NOASSERTION` records. The signed
`p1-m0-04-license-remediation-20260718T165733Z` package adds a separate conclusion layer with zero
`licenseConcluded=NOASSERTION`: 331 evidence-backed conclusions, one no-content virtual package,
two image aggregate records and one explicit legal-review LicenseRef for
`github.com/yeqown/reedsolomon@v1.0.0`. The package includes actual OpenBao source, NOTICE,
SHA256SUMS and an engineering signature. This closes the ambiguous engineering inventory, not
ccc's current legal reject or bbb's Registry/KMS reject; see
`docs/acceptance/p1-license-remediation-evidence.json`.
