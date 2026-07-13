# Editorial Publisher for ChatGPT 1.0.0

Editorial Publisher for ChatGPT connects a self-hosted WordPress site to ChatGPT through an open-source OAuth 2.1 MCP service. It supports compact content discovery, selected retrieval, draft creation and revision, media, taxonomy, normalized SEO metadata, preview, scheduling, and publishing without an OpenAI API key or built-in LLM call.

Consequential actions are deliberately gated: editorial connections cannot publish, and publisher actions require a fresh single-use confirmation bound to the connection, content version, and intended action. WordPress independently rechecks the connection scope and the approving user's current native capability.

The release includes:

- `editorial-publisher-for-chatgpt-1.0.0.zip` for WordPress upload
- source archive and SHA-256 checksums
- CycloneDX production SBOM
- Docker/Compose, standard Node 24, and Vercel Function deployment templates
- architecture, threat model, privacy/terms templates, self-hosting, reviewer workflow, and submission materials
- automated unit, PHP, integration, E2E, security, lifecycle, compatibility, and packaging gates

Known v1 exclusions include Multisite, WordPress.com hosted plans, headless sites, disabled REST API environments, AIOSEO writes, permanent deletion, broad site administration, code/filesystem/database execution, autonomous generation/publishing, and built-in OpenAI API calls.

Before a public release, the owner must connect durable PostgreSQL to the production endpoint, complete ChatGPT developer-mode acceptance, review privacy/terms/support URLs, and authorize the GitHub/WordPress/OpenAI publication actions.
