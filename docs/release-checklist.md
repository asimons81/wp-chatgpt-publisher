# Release checklist

This checklist is evidence-based. Automated/local verification is distinct from account-gated public acceptance.

## Product

- [ ] OAuth connection completes inside the maintainer's ChatGPT account against the production endpoint.
- [x] Real OAuth + WordPress approval completes through the deployed code path in the live local stack without exposing a primary password to the service.
- [x] Read, draft, media, taxonomy, SEO, preview, revision, schedule, publish, and revoke flows pass.
- [x] Publish and schedule require a fresh, action-bound, single-use confirmation.

## Security

- [x] OAuth scope, connection scope, and current WordPress capability checks are independently enforced.
- [x] SSRF, upload, replay, idempotency, horizontal access, output escaping, and CSRF controls pass automated checks or live negative cases.
- [x] Production refuses missing PostgreSQL, encryption/signing keys, or non-HTTPS public configuration.
- [x] Logs, fixtures, screenshots, and packaged artifacts contain no credentials or article bodies.
- [x] Production dependency audit reports no known vulnerabilities.

## Quality

- [x] Formatting, lint, types, unit, integration, E2E, security, PHP, and production build checks pass.
- [x] The release ZIP installs and activates in a fresh WordPress Playground instance.
- [x] The Docker image starts and health/readiness endpoints pass with PostgreSQL.
- [x] Actual MCP client discovery, annotations, UI resources, OAuth challenge, and tool execution pass.
- [x] Schema upgrade, deactivation, default uninstall, and opt-in cleanup pass on disposable WordPress.
- [x] WordPress admin and ChatGPT cards pass desktop/mobile overflow, interaction, and visual checks.

## Release

- [x] Version is 1.0.0 in product metadata and the changelog is current.
- [x] ZIP, checksums, SBOM, source archive, and release notes have been regenerated after the final gate run.
- [x] ChatGPT listing copy, reviewer workflow, privacy/terms templates, screenshots, and demo script are prepared.
- [x] A durable production PostgreSQL database is connected and `/readyz` passes on public HTTPS.
- [ ] Manual ChatGPT developer-mode desktop/mobile acceptance is recorded.
- [ ] Repository push, tag, GitHub Release, registries, WordPress.org, and OpenAI submission are explicitly authorized and evidenced.
