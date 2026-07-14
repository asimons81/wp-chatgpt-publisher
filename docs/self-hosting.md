# Self-hosting

## Required configuration

Production requires `PUBLIC_BASE_URL`, a durable PostgreSQL `DATABASE_URL`, and independent base64-encoded 32-byte `WPCP_ENCRYPTION_KEY` and `WPCP_TOKEN_SIGNING_KEY` values. It refuses missing database/keys or a non-HTTPS public URL. Configure exact `ALLOWED_ORIGINS`, trusted proxy hops, request timeouts, response caps, and `CONNECTOR_UPLOAD_DIRS` (the comma-separated mounted directories from which connector-authorized files may be read; default `/mnt/data`). The private-network development override is ignored in production.

## Deployment

### Docker

Pull the public AMD64/ARM64 release image:

```sh
docker pull ghcr.io/asimons81/wp-chatgpt-publisher:1.0.2
```

For a deployment locked to the verified release, use `ghcr.io/asimons81/wp-chatgpt-publisher@sha256:e8043aceeab927237df9a96d1d22ac1e803498c9f12ce968d2ac147d5705c9a9`. Verify its GitHub Actions provenance with:

```sh
gh attestation verify oci://ghcr.io/asimons81/wp-chatgpt-publisher:1.0.2 \
  --repo asimons81/wp-chatgpt-publisher \
  --bundle-from-oci \
  --signer-workflow asimons81/wp-chatgpt-publisher/.github/workflows/container.yml
```

Alternatively, build from source with `docker build -t editorial-publisher-for-chatgpt:1.0.2 .`. Run either image as the included non-root `app` user with PostgreSQL and secrets supplied from a protected store. Expose only the application port behind TLS. Verify both `/healthz` and `/readyz`.

### Docker Compose

Copy `.env.example`, fill independent keys, and run `docker compose up -d --build`. The bundled WordPress/MariaDB/PostgreSQL topology is for local development; replace all credentials, origin policy, and backup settings before internet exposure.

### Standard Node host

Run `npm ci`, `npm run build`, then `node apps/mcp-server/dist/index.js` under a non-root process supervisor. Migrations are idempotent at startup. Route HTTPS to the configured port and preserve SIGTERM drain behavior.

### Vercel Functions

The repository contains `api/index.ts` and `vercel.json` for the Node 24 runtime and includes the built Apps SDK UI in the function bundle.

1. Run `vercel link`.
2. Connect managed PostgreSQL or add an existing pooled `DATABASE_URL`. Marketplace products may require the account owner to accept provider terms.
3. Add the two independent secret keys as sensitive production variables.
4. Set `PUBLIC_BASE_URL` to the stable HTTPS alias and `ALLOWED_ORIGINS=https://chatgpt.com`.
5. Run `vercel deploy --prod`.
6. Verify `/healthz`, `/readyz`, `/version`, both OAuth metadata endpoints, `/ui/assets/app.js`, and an unauthenticated `/mcp` OAuth challenge.

The public deployment at `editorial-publisher-for-chatgpt.vercel.app` uses durable PostgreSQL and passes health, readiness, OAuth, MCP challenge, and UI-asset probes. Vercel is optional and no application feature depends on a proprietary relay.

## Observability

Structured logs include request IDs and tool-operation records with hashed connection identifiers, tool names, durations, outcomes, WordPress response categories, and retry counts. Content bodies and credential-shaped fields are excluded or redacted. Set `METRICS_ENABLED=true` to expose Prometheus-compatible HTTP counters and duration totals at `/metrics`; labels are limited to HTTP method and status class. Metrics and optional telemetry are disabled by default.

## Backups, rotation, and deletion

Back up PostgreSQL encrypted at rest and test restores. Losing the encryption key makes stored WordPress credentials unrecoverable. Rotate it through a reviewed decrypt/re-encrypt maintenance release or revoke and reconnect every site. A signing-key rotation invalidates access tokens; revoke refresh tokens or support a reviewed dual-key window. WordPress-side revocation remains independently authoritative.

## Scaling

Instances are stateless outside PostgreSQL. Use a pooled database URL, centralized redacted logs, and readiness-based traffic management. The in-process rate limiter is appropriate for v1 and low volume; use a shared store before high-volume multi-instance deployment.

## Upgrade and rollback

For source checkouts, run `npm run update -- --check` first. Then run `npm run update` to review and confirm the exact fast-forward; non-interactive automation must opt in with `npm run update -- --yes`. The command refuses local changes, detached HEADs, local-only commits, and diverged history, then installs locked dependencies and rebuilds. It deliberately does not restart or deploy the service.

Snapshot PostgreSQL and WordPress before changing the running deployment. Deploy the newly built service, wait for readiness, run smoke tests, then drain the old version. Service migrations must remain forward-compatible for one release. WordPress performs idempotent schema upgrades on load, preserves tables on deactivation/default uninstall, and removes them only when `WPCP_REMOVE_DATA_ON_UNINSTALL` is explicitly `true`. Keep the prior image, source commit, and plugin ZIP until the post-upgrade acceptance pass is complete. If validation fails, redeploy the prior image or source commit; do not roll back the database without a reviewed migration plan.
