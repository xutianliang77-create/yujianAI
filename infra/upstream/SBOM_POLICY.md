# SBOM 与供应链策略

Package SBOM is generated and structurally verified by `npm run supply-chain:verify`. Current
container evidence is generated from digest-pinned local images with Syft, scanned from that SBOM
with Grype and signed as one immutable image/SBOM/scan statement with Cosign. Cosign v3 Sigstore
bundles are preferred and verified with `npm run supply-chain:verify-signature`; detached signatures
remain a compatibility input for Cosign v2 environments.

The technical vulnerability gate allows zero unwaived Critical findings. High findings remain
visible and require `security-owner` review before release. Digests, tool checksums, vulnerability
database timestamp, signing identity and exceptions are stored with release evidence, never in
runtime configuration. Clean upstream and Yujian adapter images must have separate provenance and
patch reports. An engineering evidence key proves bundle integrity but is not a production release
identity and does not replace an OCI registry signature, transparency-log proof or owner approval.
