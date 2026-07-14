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

### Why authentication has two layers

There are two credentials because the service and the WordPress site are separate trust boundaries:

1. **ChatGPT -> MCP service:** OAuth proves which ChatGPT client, user, connection, resource, and scopes may call the service. PKCE means the client creates a one-time secret (`code_verifier`) and sends only its hash (`code_challenge`) before login; a stolen authorization code is therefore useless without the original verifier.
2. **MCP service -> WordPress plugin:** the WordPress user logs in on their own site and approves a separate, scoped integration credential. The MCP service never receives the user's WordPress password. WordPress can revoke this credential and re-check the user's current native capabilities independently of the ChatGPT access token.

In practice, locate an authentication failure by where the browser or request stops: before WordPress approval, inspect MCP OAuth discovery, client, redirect, resource, state, and PKCE handling; on the WordPress approval screen, inspect login, nonce, scope, and capability checks; after approval, inspect the one-time grant and callback; if connection succeeds but a tool is denied, inspect the intersection of OAuth scope, connection scope, current WordPress capability, plugin policy, and tool requirements. Do not remove either layer to simplify debugging.

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

## First commands

Start every session by checking the worktree. On a fresh clone, or whenever dependencies may be stale, establish a reproducible baseline before starting a watcher or test:

```sh
git status --short
node --version
npm --version
npm ci
npm run build
```

Use Node.js 24 LTS and npm 11. Preserve anything reported by `git status`; `npm ci` must not change `package-lock.json`. If dependencies are already installed and the task is a read-only inspection or documentation-only change, record that fact and proceed without reinstalling them.

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

### What `npm run dev` starts

Use a dedicated terminal because this command stays running until interrupted:

```sh
npm run dev
```

It first builds the shared contracts and tool schemas, then runs two labeled processes in the same terminal:

| Process  | Command                           | Default address         | Purpose                                                     |
| -------- | --------------------------------- | ----------------------- | ----------------------------------------------------------- |
| `server` | `tsx watch src/index.ts`          | `http://127.0.0.1:8787` | Restarts the MCP/OAuth service after server source changes  |
| `ui`     | `vite --host 0.0.0.0 --port 5173` | `http://127.0.0.1:5173` | Serves and rebuilds the embedded React UI during UI changes |

Preconditions:

- `npm ci` has completed.
- A PostgreSQL database is already reachable from the host at `DATABASE_URL`; the development default is `postgresql://wpcp:wpcp@127.0.0.1:5432/wpcp`.
- Any non-default settings needed by the server are exported into the terminal environment. The local Node watcher does **not** load the repository `.env` file; Compose does.
- WordPress is reachable only when exercising discovery, approval, or editorial tools. It is not needed merely to compile or open the UI fixture view.

The command does not start PostgreSQL or WordPress. The Compose PostgreSQL service is internal to the Compose network and is not exposed to a host-run watcher. Use setup B for the repository-provided complete topology, or use an already authorized host-reachable development PostgreSQL instance. Do not run the Compose `mcp-server` and the host watcher on the same port.

After the `server` process reports it is ready, verify process and database health from another terminal:

```sh
node scripts/wait-for-http.mjs http://127.0.0.1:8787/healthz 60000
node scripts/wait-for-http.mjs http://127.0.0.1:8787/readyz 60000
```

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

### HTTP readiness helper

`scripts/wait-for-http.mjs` can wait for any unauthenticated HTTP endpoint, not only the Docker workflow:

```sh
node scripts/wait-for-http.mjs <url> [timeout-ms]
```

The timeout defaults to 60 seconds. The helper polls once per second, treats any successful HTTP status as ready, prints the URL when ready, and exits nonzero with the last connection or HTTP error on timeout. Use `/healthz` to prove the process is accepting requests and `/readyz` to prove its PostgreSQL dependency is ready. It does not start or repair the service.

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

## Error-recovery flow

Preserve the first failing command and error message, then follow the matching branch. Fix one prerequisite at a time and rerun the same command before moving down the tree.

### 1. Install or build fails

1. Run `node --version` and `npm --version`. Use Node 24 LTS and npm 11; do not regenerate the lockfile with an unsupported toolchain.
2. Run `git status --short`. Preserve existing changes and confirm `package-lock.json` was not altered.
3. Run `npm ci` again only after correcting the runtime or registry/network issue, then run `npm run build`.
4. If one workspace fails, use the repository map and the first error—not later cascading errors—to identify the owning boundary.

### 2. `npm run dev` exits or one labeled process fails

1. If a module or shared-package build is missing, complete the first-command baseline above.
2. If the `server` process reports a PostgreSQL connection or migration error, confirm that `DATABASE_URL` is present in the terminal environment when needed and that its host and port are reachable. Do not print the credential or silently point it at a real database. If no approved host PostgreSQL exists, stop the watcher and use setup B.
3. If port 8787 or 5173 is occupied, identify whether a prior watcher or Compose service owns it and stop that known local process safely. For Compose-only port 8787 conflicts, set `MCP_HOST_PORT` in `.env` and update local `PUBLIC_BASE_URL`; that variable does not change the host watcher port.
4. If `ui` is running but `server` failed, the fixture UI can still render, but OAuth, MCP, and WordPress behavior is not available. Do not report the app as ready.
5. When both labels stay running, check `/healthz`, then `/readyz`. A healthy-but-not-ready service means the process is up but PostgreSQL is not usable.

### 3. Disposable stack is not ready

1. Run `docker compose -f docker-compose.yml -f docker-compose.test.yml ps`.
2. Inspect recent logs only for the unhealthy service. Verify PostgreSQL/MariaDB health and required environment-variable **presence** without printing secret values.
3. Wait on WordPress and then service readiness with `scripts/wait-for-http.mjs`; container startup is asynchronous.
4. If WordPress reports "already installed," do not reset it automatically. Confirm the target is disposable, then seed it directly if appropriate.
5. If plugin discovery fails, verify WordPress installation, plugin activation, pretty permalinks, REST access, and the exact discovery URL in that order.

### 4. OAuth or authorization fails

1. **No WordPress approval page:** verify MCP health/readiness, both OAuth metadata documents, the exact client redirect URI, resource/audience, state, and S256 PKCE inputs.
2. **Failure on the WordPress approval page:** verify the site login, nonce, requested scopes, approving user's native capabilities, and plugin REST availability.
3. **Failure returning from WordPress:** inspect the short-lived one-time grant and exact callback/redirect without logging the code, grant, or credential.
4. **Connection succeeds but a tool returns 401/403:** distinguish an expired/revoked ChatGPT token from a revoked WordPress credential, then check OAuth scope, connection scope, current WordPress capability, plugin policy, and tool requirement. A valid outer token does not override a failed inner check.
5. **A consequential action requests confirmation again:** generate a new review/confirmation. Confirmations are short-lived, single-use, and bound to the exact action, content, version, payload, and connection; never reuse or relax them.

### 5. Tests or tooling do not exercise the expected path

- **Live tests skip:** set only the variables documented in [`test-harness.md`](test-harness.md); a skip is not proof of the live path.
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
