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
