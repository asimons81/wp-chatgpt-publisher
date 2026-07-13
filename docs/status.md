# Project status

## Current milestone

Milestone 6 - release candidate verification and account-gated handoff.

## Completed work

- Production monorepo, shared contracts, Docker/Compose topology, and Node 24 build.
- WordPress 6.9+ plugin with approval, scoped credentials, REST/Abilities compatibility, admin UI, audit, diagnostics, lifecycle upgrades, and opt-in uninstall cleanup.
- OAuth 2.1 MCP service with PKCE, dynamic client registration, audience/resource binding, rotating refresh tokens, encrypted credentials, static tools, confirmations, and Apps SDK resources.
- Responsive ChatGPT cards and WordPress admin surfaces with desktop/mobile browser QA.
- Fresh ZIP installation, official Plugin Check, Docker image/readiness, real OAuth/MCP/WordPress integration, complete editorial E2E, and lifecycle verification.
- Vercel Node function configuration and a successful production build at `editorial-publisher-for-chatgpt.vercel.app`.

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

## Deployment state

- Vercel project and production alias exist; the source-matched production build/deploy ID `dpl_6Rbbrk5dcobXM7dA2Bdatb4ebvLq` is READY.
- Runtime requests intentionally fail closed because no durable production `DATABASE_URL` is connected.
- Encryption/signing keys, exact ChatGPT origin, telemetry-off, and the public base URL are configured in Vercel without committing their values.

## External actions still required

1. The owner must accept the selected PostgreSQL provider's marketplace/legal terms (or supply an existing managed PostgreSQL URL), connect it as `DATABASE_URL`, and redeploy.
2. After readiness is green, the owner must complete ChatGPT developer-mode desktop/mobile acceptance in their account.
3. GitHub repository creation/push, public release publication, WordPress.org submission, and OpenAI app submission require owner identity, legal confirmations, and final approval.

No code or local test blocker remains. Public release status must not be claimed until the three account-gated steps above are evidenced.
