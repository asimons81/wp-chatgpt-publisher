# Release plan

1. Freeze tool contracts, threat model, compatibility targets, naming, and license.
2. Complete service/plugin/UI implementation and lock dependencies.
3. Pass formatting, lint, types, unit, WordPress integration, actual MCP integration, E2E, security, response-budget, accessibility, and performance checks.
4. Build the service/UI and installable plugin ZIP. Install ZIP in a fresh WordPress 6.9+/PHP matrix and test upgrade/rollback.
5. Deploy a disposable HTTPS release candidate and complete ChatGPT developer-mode web acceptance; current OpenAI guidance says MCP apps are not available on mobile.
6. Generate ZIP, source archive, SHA-256 checksums, CycloneDX SBOM, release notes, reviewer assets, and submission package.
7. Confirm repository/package/container/WordPress/OpenAI ownership and credentials before any public publication.
8. Set 1.0.0 versions, create authorized signed/annotated tag, GitHub Release, attach artifacts, verify downloads/installation, then perform separately authorized registry/submission actions.

Rollback: retain prior container/image and WordPress ZIP, make DB migrations forward-compatible, snapshot PostgreSQL/WordPress before rollout, and revoke affected connections if credentials or schema integrity are in doubt.
