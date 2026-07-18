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
