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
Production signing must operate on an immutable registry digest with a managed OpenBao/KMS identity,
attach the matching SPDX attestation, fresh-pull and verify the artifact, and still leave release
authorization to bbb. The fail-closed implementation is `tools/supply-chain/sign-production-oci.sh`.

`licenseDeclared=NOASSERTION` is never rewritten in the original Syft document. Remediation creates
a separately named SPDX 2.3 document and may only add `licenseConcluded` plus REVIEW annotations
backed by fixed source or license hashes. A synthetic package with no independent content may use
`NONE`; an OCI document root uses an explicit aggregate LicenseRef; genuinely ambiguous evidence
uses a named pending-legal LicenseRef instead of guessing a standard license. A zero
`licenseConcluded=NOASSERTION` count closes the engineering inventory only. Any pending-legal
LicenseRef or current legal/release reject keeps production blocked.

The reproducible runner is `tools/supply-chain/run-license-remediation.sh`; its policy is
`infra/upstream/license-remediation/noassertion-policy.json`. It emits the original and concluded
SBOMs, a 335-record inventory, LICENSE/NOTICE, actual OpenBao source, SHA256SUMS and a signed
manifest. Repository verification uses `npm run supply-chain:verify-license-remediation`.
