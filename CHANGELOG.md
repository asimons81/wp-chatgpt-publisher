# Changelog

All notable changes follow Keep a Changelog and Semantic Versioning.

## [1.0.2] - 2026-07-13

### Fixed

- Returned a safe 400 validation response for malformed JSON instead of misclassifying it as a retryable upstream failure.
- Prevented OAuth grants, authorization codes, signed connection requests, and other query-string credentials from appearing in structured request or redirect-response logs.
- Made WordPress and source ZIPs byte-for-byte reproducible across host operating systems by archiving committed Git blobs and normalizing entry order, timestamps, path separators, file modes, and compression behavior.
- Derived archive names and release validation from the root package version instead of duplicating version literals across packaging scripts and workflows.

### Documentation

- Added explicit WordPress.org external-service disclosure and a current directory-guideline submission audit.

## [1.0.1] - 2026-07-13

### Added

- Added an opt-in Prometheus-compatible `/metrics` endpoint with bounded method and status-class labels.

### Fixed

- Completed structured tool-operation logs with hashed connection identifiers, tool names, durations, outcomes, WordPress response categories, and retry counts.
- Centralized the service version used by MCP, health, version, logging, and Apps SDK resource URLs.

## [1.0.0] - 2026-07-12

### Added

- Open-source OAuth 2.1 remote MCP service with scoped, encrypted WordPress connections.
- Static Apps SDK tools/resources and responsive connected-site, search, review, metadata, media, confirmation, error, and result cards.
- Installable WordPress plugin with approval, revocation, admin onboarding, connections, permissions, audit, diagnostics, and REST/Abilities compatibility.
- Draft, revision, media, taxonomy, SEO, preview, schedule, and publish workflows with idempotency, optimistic concurrency, and single-use confirmations.
- Docker, Docker Compose, standard Node, and Vercel Node Function deployment paths.
- Unit, integration, E2E, security, lifecycle, packaging, SBOM, release, and CI workflows.
- WordPress 6.9/minimum and latest live CI matrix, PHP 8.1-8.4 checks, fresh ZIP/Plugin Check evidence, and desktop/mobile screenshots.

### Security

- Added resource/audience-bound OAuth, S256 PKCE, rotating refresh tokens, scope intersection, capability rechecks, SSRF/DNS protections, strict media validation, CSRF nonces, audit hashing, and fail-closed production configuration.

### Lifecycle

- Added idempotent in-place schema upgrades that preserve existing data.
- Deactivation removes scheduled cleanup but preserves data; uninstall preserves by default and supports explicit full removal.

[1.0.2]: https://github.com/asimons81/wp-chatgpt-publisher/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/asimons81/wp-chatgpt-publisher/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/asimons81/wp-chatgpt-publisher/releases/tag/v1.0.0
