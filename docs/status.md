# Project status

## Current milestone

Milestone 11 - v1.0.1 released; account-gated developer identity and directory submission remain.

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
- Node fast suite: 32 pass and 11 live-test skips across 9 passing files; unit: 16 pass; security: 16 pass.
- Fast-suite coverage: 70.34% statements, 59.48% branches, 79.31% functions, and 73.33% lines.
- Live WordPress integration: 9 enabled cases pass; the separate pre-seeded MCP-token case is optional because OAuth transport is covered end to end.
- Full live editorial E2E: 1 complete flow passes, including OAuth, media, taxonomy, SEO, revisions, denial, confirmation, publish, schedule, replay rejection, and revocation.
- Lifecycle: schema upgrade preserves data; deactivation preserves tables and removes cron; default uninstall preserves data; opt-in uninstall removes plugin tables.
- Production dependency audit: zero known vulnerabilities.
- Official WordPress Plugin Check: no errors.
- Public production verification: health, readiness, version, OAuth metadata, dynamic client registration, authorization persistence, Apps SDK asset delivery, and the MCP OAuth challenge pass over HTTPS.
- GitHub Actions at tagged commit `478c3ec`: CI `29228961676`, security `29228961675`, minimum/latest WordPress integration `29228961694`, and release artifact workflow `29229332426` pass.
- ChatGPT Plus web developer mode: production OAuth, connected-site/content reads, safe draft creation, and the non-executing publish review pass against a disposable HTTPS WordPress site.

## Deployment state

- Vercel production build/deploy `dpl_DLdGJQe1UsZRpt7dMXELpAeM9e1F` is READY at the stable alias and reports version `1.0.1`.
- Neon resource `editorial-publisher-production` is Available on the explicit `free_v3` billing plan and provides encrypted production-only PostgreSQL variables.
- `/healthz`, `/readyz`, `/version`, both OAuth metadata documents, the Apps SDK UI asset, and the MCP 401 challenge return the expected public responses.
- Encryption/signing keys, exact ChatGPT origin, telemetry-off, and the public base URL are configured in Vercel without committing their values.
- Public source repository and verified `v1.0.1` release assets are available at `github.com/asimons81/wp-chatgpt-publisher/releases/tag/v1.0.1`; downloaded assets match `SHA256SUMS`, and the public plugin ZIP installs in fresh WordPress Playground.

## Known issues and limitations

- The prior ChatGPT desktop acceptance covers OAuth, read, draft, and publish review. The remaining update/media/metadata/preview/schedule/publish/revoke prompts cannot be rerun manually until OpenAI developer identity verification allows the development app to be recreated; all pass in the real-MCP E2E suite.
- Current OpenAI guidance says MCP apps are web-only. Responsive app cards still pass separate 390 px browser QA.
- Documented v1 exclusions remain: Multisite, headless/WordPress.com-hosted variants, AIOSEO writes, permanent deletion, site administration, autonomous publishing, and built-in LLM/API calls.

## Security findings

- No unresolved critical or high vulnerability is known. The production dependency audit reports zero findings, CodeQL and secret scanning pass, official WordPress Plugin Check reports no errors, and the consequential-action/replay/revocation negative cases pass.
- The new metrics endpoint is disabled by default and uses bounded method/status-class labels; structured tool logs hash connection identifiers and exclude content and credentials.

## External blockers

1. The owner must complete OpenAI's developer identity verification at `platform.openai.com/plugins` after choosing **Create plugin → With MCP**. Then reconnect the production app and rerun the remaining manual desktop update/media/metadata/preview/schedule/publish/revoke prompts. Mobile is not a blocker: current OpenAI guidance says MCP apps are web-only.
2. WordPress.org and OpenAI app submissions require the owner's final public privacy, terms, company/developer, support, reviewer-account, and portal confirmations, followed by the explicit Submit action.

No code, packaging, database, deployment, or mobile-client blocker remains. OpenAI listing or WordPress.org acceptance must not be claimed until the identity/legal/account-gated steps above are evidenced.

## Next concrete actions

1. Owner completes the OpenAI developer identity prompt.
2. Maintainer follows `docs/app-submission.md` to run the remaining desktop prompts and records the sanitized result.
3. Owner supplies final public URLs/contact/reviewer details and explicitly submits to OpenAI and WordPress.org.
