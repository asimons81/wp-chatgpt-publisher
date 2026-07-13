# Project status

## Current milestone

Milestone 11 - v1.0 release publication and account-gated directory acceptance.

## Completed work

- Production monorepo, shared contracts, Docker/Compose topology, and Node 24 build.
- WordPress 6.9+ plugin with approval, scoped credentials, REST/Abilities compatibility, admin UI, audit, diagnostics, lifecycle upgrades, and opt-in uninstall cleanup.
- OAuth 2.1 MCP service with PKCE, dynamic client registration, audience/resource binding, rotating refresh tokens, encrypted credentials, static tools, confirmations, and Apps SDK resources.
- Responsive ChatGPT cards and WordPress admin surfaces with desktop/mobile browser QA.
- Fresh ZIP installation, official Plugin Check, Docker image/readiness, real OAuth/MCP/WordPress integration, complete editorial E2E, and lifecycle verification.
- Vercel Node function and a no-cost Neon PostgreSQL resource deployed at `editorial-publisher-for-chatgpt.vercel.app`.

## Latest verified test evidence

- TypeScript build/typecheck, ESLint, Prettier, PHP syntax, PHPCS, and PHPStan level 7: pass.
- PHPUnit: 3 tests / 6 assertions pass.
- Node fast suite: 29 pass and 11 live-test skips across 7 passing files; unit: 13 pass; security: 16 pass.
- Fast-suite coverage: 65.83% statements, 57.69% branches, 76% functions, and 68.14% lines.
- Live WordPress integration: 9 enabled cases pass; the separate pre-seeded MCP-token case is optional because OAuth transport is covered end to end.
- Full live editorial E2E: 1 complete flow passes, including OAuth, media, taxonomy, SEO, revisions, denial, confirmation, publish, schedule, replay rejection, and revocation.
- Lifecycle: schema upgrade preserves data; deactivation preserves tables and removes cron; default uninstall preserves data; opt-in uninstall removes plugin tables.
- Production dependency audit: zero known vulnerabilities.
- Official WordPress Plugin Check: no errors.
- Public production verification: health, readiness, version, OAuth metadata, dynamic client registration, authorization persistence, Apps SDK asset delivery, and the MCP OAuth challenge pass over HTTPS.

## Deployment state

- Vercel production build/deploy `dpl_EmEngVt8DuaN5KGM3YS6riQjVSjS` is READY at the stable alias.
- Neon resource `editorial-publisher-production` is Available on the explicit `free_v3` billing plan and provides encrypted production-only PostgreSQL variables.
- `/healthz`, `/readyz`, `/version`, both OAuth metadata documents, the Apps SDK UI asset, and the MCP 401 challenge return the expected public responses.
- Encryption/signing keys, exact ChatGPT origin, telemetry-off, and the public base URL are configured in Vercel without committing their values.

## External actions still required

1. The owner must complete ChatGPT developer-mode desktop/mobile acceptance against a compatible public WordPress test site.
2. WordPress.org and OpenAI app submissions still require the owner's final public privacy, terms, support, reviewer-account, and portal confirmations.

No code, packaging, database, or deployment blocker remains. OpenAI listing or WordPress.org acceptance must not be claimed until the account-gated steps above are evidenced.
