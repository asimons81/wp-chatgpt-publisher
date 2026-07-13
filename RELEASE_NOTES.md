# Editorial Publisher for ChatGPT 1.0.2

Editorial Publisher for ChatGPT connects a self-hosted WordPress site to ChatGPT through an open-source OAuth 2.1 MCP service. It supports compact content discovery, selected retrieval, draft creation and revision, media, taxonomy, normalized SEO metadata, preview, scheduling, and publishing without an OpenAI API key or built-in LLM call.

Consequential actions are deliberately gated: editorial connections cannot publish, and publisher actions require a fresh single-use confirmation bound to the connection, content version, and intended action. WordPress independently rechecks the connection scope and the approving user's current native capability.

The release includes:

- `editorial-publisher-for-chatgpt-1.0.2.zip` for WordPress upload
- source archive and SHA-256 checksums
- CycloneDX production SBOM
- Docker/Compose, standard Node 24, and Vercel Function deployment templates
- architecture, threat model, privacy/terms templates, self-hosting, reviewer workflow, and submission materials
- automated unit, PHP, integration, E2E, security, lifecycle, compatibility, and packaging gates

This patch keeps OAuth grants, authorization codes, signed connection requests, and other query-string credentials out of structured request and redirect-response logs, and returns a safe 400 validation response for malformed JSON. It also makes both release ZIPs byte-for-byte reproducible across checkout times, working-tree line-ending changes, operating systems, and compression-library differences; removes duplicated version literals from the packaging pipeline; adds an automated archive-reproducibility gate; and expands the WordPress.org external-service disclosure. Product permissions are unchanged from 1.0.1.

Known v1 exclusions include Multisite, WordPress.com hosted plans, headless sites, disabled REST API environments, AIOSEO writes, permanent deletion, broad site administration, code/filesystem/database execution, autonomous generation/publishing, and built-in OpenAI API calls.

## Published verification

- Production: `https://editorial-publisher-for-chatgpt.vercel.app` reports version 1.0.2 and passes health, readiness, OAuth discovery, UI, MCP challenge, malformed-JSON, and credential-redaction probes.
- WordPress ZIP SHA-256: `118776e380285c146f10e599bc84f336e9c80e49398ba41c7fe11f3fdd83650a`
- Source ZIP SHA-256: `714e3cbf79b99afdc7644f336f075a71a81e53debc0f3b247521bf6983701caa`
- Container: `ghcr.io/asimons81/wp-chatgpt-publisher@sha256:e8043aceeab927237df9a96d1d22ac1e803498c9f12ce968d2ac147d5705c9a9`; anonymous pull, non-root runtime smoke, and GitHub Actions provenance verification pass for AMD64 and ARM64.

The production MCP endpoint is deployed with durable PostgreSQL and passes public readiness, OAuth, persistence, UI-asset, and authentication-challenge checks. ChatGPT desktop developer-mode OAuth, read, draft, and non-executing publish-review acceptance passes. Current OpenAI guidance says MCP apps are web-only, so mobile-client acceptance is not applicable. Recreating the developer app for the expanded desktop matrix and completing the WordPress.org/OpenAI submissions require the owner's OpenAI developer identity verification plus final privacy, terms, support, reviewer-account, and portal confirmations.
