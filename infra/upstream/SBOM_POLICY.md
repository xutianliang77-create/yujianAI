# SBOM 与供应链策略

Package SBOM is generated and structurally verified by `npm run supply-chain:verify`; container
SBOM/signature must be supplied by the registry pipeline and verified with
`npm run supply-chain:verify-signature`. Digests, signing identity, scan timestamp and exceptions
are stored with the release evidence, never in runtime configuration. Clean upstream and Yujian
adapter images must have separate provenance and patch reports.
