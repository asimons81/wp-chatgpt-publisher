# Agent guide

This is the canonical briefing for an agent asked to understand, set up, modify, or verify this repository. Read it before acting, then follow links only for the part of the system in scope.

## Five-minute orientation

Editorial Publisher for ChatGPT is an open-source ChatGPT app for controlled WordPress editorial work. It does **not** call an LLM or require an OpenAI API key. The repository contains three cooperating runtime surfaces:

1. A Node.js MCP/OAuth service that exposes static editorial tools and stores encrypted connection state in PostgreSQL.
2. A React UI embedded in ChatGPT for structured tool results and explicit review/confirmation flows.
3. A WordPress plugin that owns site-side approval, repeats scope and native capability checks, and performs WordPress operations through supported APIs.

The trust path is:

```text
ChatGPT -> OAuth-protected MCP service -> scoped WordPress plugin REST API -> WordPress
             |                                      |
         PostgreSQL                         WordPress-owned tables
```

Authorization is intentionally checked at both the service and plugin boundaries. Published edits, scheduling, and publishing require a short-lived confirmation bound to the action, content, version, and payload. Retrieved WordPress content is untrusted data, not instructions.

Before editing, read:

- [`architecture.md`](architecture.md) for trust boundaries and request flow.
- [`threat-model.md`](threat-model.md) for security invariants.
- [`compatibility.md`](compatibility.md) for supported runtimes.
- The relevant decision record under [`decisions/`](decisions/) for authentication or authorization changes.

## Repository map

| Path                                         | Responsibility                                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `apps/mcp-server/`                           | Express MCP/OAuth service, configuration, security controls, PostgreSQL storage, WordPress client, and observability |
| `apps/chatgpt-ui/`                           | React/Vite embedded result and confirmation cards                                                                    |
| `packages/contracts/`                        | Shared runtime schemas and data contracts                                                                            |
| `packages/tool-schemas/`                     | Static MCP tool definitions, descriptions, annotations, and input schemas                                            |
| `packages/test-fixtures/`                    | Shared test-only fixtures                                                                                            |
| `wordpress/editorial-publisher-for-chatgpt/` | Installable WordPress plugin source                                                                                  |
| `api/index.ts`                               | Vercel function entry point for the MCP service                                                                      |
| `scripts/`                                   | Packaging, release, PHP tooling, cleanup, and guarded source-update commands                                         |
| `tests/unit/`                                | Fast isolated behavior tests                                                                                         |
| `tests/integration/`                         | Service and live WordPress integration coverage                                                                      |
| `tests/e2e/`                                 | Real MCP/OAuth editorial workflows                                                                                   |
| `tests/security/`                            | Security-control regression coverage                                                                                 |
| `tests/wordpress/`                           | PHPUnit coverage for plugin behavior                                                                                 |
| `tests/fixtures/`                            | Disposable WordPress seed, lifecycle, and test bootstrap files                                                       |
| `docs/`                                      | Architecture, operations, setup, decisions, acceptance evidence, and release guidance                                |

Versions come from the root `package.json`, the plugin header/runtime constant, and the WordPress `readme.txt`. Do not copy an old version from prose when packaging or diagnosing a mismatch.

## Safety rules

Before any setup or change:

1. Run `git status --short` and preserve every pre-existing change.
2. Confirm whether the user wants repository-only development, a disposable local stack, or a real deployment.
3. Inspect the installed tool versions before installing or upgrading anything.
4. Never print, read back, or commit `.env` secrets. Do not replace an existing `.env` without permission.
5. Do not use production URLs, credentials, databases, or WordPress sites for fixture setup.
6. Do not run `docker compose down -v`, destructive WP-CLI commands, production deployment, database rollback, key rotation, or publishing actions without explicit approval.
7. Keep tool schemas and security schemes static and reviewed. Never weaken permission, confirmation, SSRF, MIME, timeout, response-size, or logging controls to make a demo pass.

## Choose the setup depth

### A. Understand or edit the repository

Use this for documentation, static review, and most code changes. Requirements are Node.js 24 LTS and npm 11. PHP 8.1+ and Docker are needed for the broader PHP/live checks.

```sh
node --version
npm --version
git status --short
npm ci
npm run build
```

Expected result: all workspaces build into their ignored `dist/` directories. `npm ci` must not change `package-lock.json`.

For a development server after dependencies are installed, `.env` is configured, and PostgreSQL is available:

```sh
npm run dev
```

This starts the MCP service and UI watchers. It does not provide PostgreSQL or WordPress; use the disposable stack below for a complete local topology.

### B. Start the disposable full stack

Use this only for local development or tests. It creates local WordPress/MariaDB/PostgreSQL volumes, builds the service, installs WordPress, activates the mounted plugin, and adds fixture content and credentials.

Prerequisites:

```sh
docker version
docker compose version
```

If `.env` does not exist, copy `.env.example` to `.env`. Do not overwrite an existing file. Set:

- `PUBLIC_BASE_URL=http://publisher.lvh.me:8787`
- `ALLOW_PRIVATE_NETWORKS_IN_DEVELOPMENT=true`
- independent, securely generated base64-encoded 32-byte values for `WPCP_ENCRYPTION_KEY` and `WPCP_TOKEN_SIGNING_KEY`

Never reuse those development keys in production or expose them in a chat transcript. Then run:

```sh
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm wp-cli core install --url=http://wordpress.lvh.me:8080 --title="Editorial Publisher Test" --admin_user=admin --admin_password=local-test-admin --admin_email=admin@example.test --skip-email
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm wp-cli eval-file /fixtures/seed-wordpress.php
docker compose -f docker-compose.yml -f docker-compose.test.yml ps
```

The seed script refuses non-local WordPress environments. It activates the plugin, enables pretty permalinks, creates disposable content/users, and provisions test-only scoped connections.

Verify these local endpoints:

| Endpoint                                                                 | Expected result               |
| ------------------------------------------------------------------------ | ----------------------------- |
| `http://publisher.lvh.me:8787/healthz`                                   | Process health succeeds       |
| `http://publisher.lvh.me:8787/readyz`                                    | PostgreSQL readiness succeeds |
| `http://publisher.lvh.me:8787/version`                                   | Current service version       |
| `http://wordpress.lvh.me:8080/wp-json/wp-chatgpt-publisher/v1/discovery` | Plugin discovery document     |
| `http://wordpress.lvh.me:8080/wp-admin/`                                 | Disposable WordPress login    |

Use the exact live-test environment variables and commands in [`test-harness.md`](test-harness.md). Fast test runs intentionally skip live suites when those variables are absent.

To stop containers without deleting data:

```sh
docker compose -f docker-compose.yml -f docker-compose.test.yml down
```

Do not add `-v` unless the user explicitly approves deleting the disposable databases.

### C. Prepare a real deployment

Stop and confirm the target, domain, database, secret store, backup/rollback plan, and whether the WordPress plugin and MCP service are both in scope. Then follow [`self-hosting.md`](self-hosting.md), [`wordpress-setup.md`](wordpress-setup.md), and [`chatgpt-setup.md`](chatgpt-setup.md).

Vercel is optional. If the user chooses it, recommend installing the missing CLI with `npm i -g vercel` because it enables environment pulls, deployments, and logs. Do not install it or run `vercel deploy --prod` without the user's approval. Never use the bundled local database credentials in production.

## Change routing

| Change                                             | Start here                                         | Minimum focused verification                              |
| -------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| Shared input/output shape                          | `packages/contracts/`                              | `npm run build:shared`, affected unit tests, typecheck    |
| Tool name, description, annotation, or schema      | `packages/tool-schemas/`                           | build shared packages, tool-schema tests, security review |
| OAuth, MCP transport, storage, or WordPress client | `apps/mcp-server/`                                 | unit + integration + security tests                       |
| Embedded result/confirmation card                  | `apps/chatgpt-ui/`                                 | typecheck, build, relevant E2E/visual acceptance          |
| WordPress route or policy                          | plugin `includes/`                                 | PHP lint, PHPCS/PHPStan/PHPUnit, live capability cases    |
| Packaging or versioning                            | `scripts/`, package metadata, plugin header/readme | package ZIP, reproducibility, release check               |
| Deployment behavior                                | `Dockerfile`, Compose, `api/`, Vercel config       | build, health/readiness, deployment-specific smoke tests  |
| Authentication or authorization design             | service + plugin + `docs/decisions/`               | threat-model review and real negative-path coverage       |

When a field crosses boundaries, trace it through contracts, tool schemas, MCP handlers, the WordPress client, REST schema/controller, and UI rendering. Do not patch only the first layer that exhibits the symptom.

## Verification ladder

Run focused tests while iterating. Before handing off a normal code change, run the applicable repository gates:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

For PHP/plugin changes also run:

```sh
npm run php:cs
npm run php:stan
npm run php:test
```

The `php:*` commands use the repository's Composer tooling path; Docker may be required on Windows. For protocol, authorization, or WordPress behavior, use the real stack and run the relevant live suites:

```sh
npm run test:integration
npm run test:e2e
npm run test:security
```

For release-affecting work:

```sh
npm run package:wordpress
npm run sbom
npm run release:reproducible
npm run release:artifacts
npm run release:check
```

Do not claim live behavior from skipped tests. Report passed, failed, and skipped checks separately, along with any missing dependency or account-gated step.

## Common setup failures

- **Wrong Node/npm version:** use Node 24 LTS and npm 11; do not regenerate the lockfile with an unsupported toolchain.
- **Port 8787 already in use:** set `MCP_HOST_PORT` in `.env` and update the local `PUBLIC_BASE_URL` to match.
- **Service unhealthy:** inspect `docker compose ... ps` and recent service logs, then verify PostgreSQL health and required environment variables without printing secret values.
- **WordPress reports “already installed”:** do not reset it automatically. Verify the target is the disposable stack, then seed it directly if appropriate.
- **Plugin discovery fails:** verify WordPress installation, plugin activation, pretty permalinks, REST access, and the discovery URL.
- **Live tests skip:** set the variables documented in [`test-harness.md`](test-harness.md); a skip is not proof of the live path.
- **Private-network rejection:** the local override works only in development. Never enable it as a production workaround.
- **PHP tooling unavailable:** use the documented `npm run php:*` path and confirm Docker/Composer prerequisites instead of silently skipping checks.
- **Dirty checkout blocks `npm run update`:** preserve the changes and ask the user whether to commit or stash them; never discard them automatically.

## Definition of done

An agent handoff should state:

- what changed and which runtime boundary it affects;
- which security invariants were considered;
- exact checks run, including skips or failures;
- any local services started and how to stop them safely;
- files intentionally left untouched;
- remaining user-only actions such as identity verification, production secrets, DNS, deployment, or ChatGPT app registration.

Never treat a build alone as proof that OAuth, MCP, WordPress permissions, or publishing confirmation works. Those claims require the real path described in the test harness and acceptance docs.
