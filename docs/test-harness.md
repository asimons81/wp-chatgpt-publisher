# Real-stack test harness

The live suites are skipped during fast unit runs unless their environment variables are present. CI makes them mandatory on both the minimum WordPress image and `wordpress:latest`.

Start, install, and seed the disposable stack:

```sh
cp .env.example .env
# Set independent 32-byte keys, PUBLIC_BASE_URL=http://publisher.lvh.me:8787,
# and ALLOW_PRIVATE_NETWORKS_IN_DEVELOPMENT=true in this local-only file.
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm wp-cli core install --url=http://wordpress.lvh.me:8080 --title="Editorial Publisher Test" --admin_user=admin --admin_password=local-test-admin --admin_email=admin@example.test --skip-email
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm wp-cli eval-file /fixtures/seed-wordpress.php
```

Set these process variables before the live tests:

```sh
WPCP_TEST_WP_URL=http://wordpress.lvh.me:8080
WPCP_TEST_WP_USER=admin
WPCP_TEST_WP_PASSWORD=local-test-admin
WPCP_TEST_EDITORIAL_TOKEN=wpcp-editorial-test-token-000000000000000000000000
WPCP_TEST_PUBLISHER_TOKEN=wpcp-publisher-test-token-000000000000000000000000
WPCP_TEST_MCP_BASE_URL=http://publisher.lvh.me:8787
```

Then run `npm run test:integration`, `npm run test:e2e`, and `npm run test:security`. The E2E suite establishes OAuth connections itself; it does not depend on a pre-seeded MCP access token. Seeded WordPress bearer tokens are used only by the direct REST integration suite. The standalone MCP-token test remains optional for operators who want to inject a token, while the OAuth suites always exercise the official `StreamableHTTPClientTransport`.

Lifecycle verification runs after E2E in CI and proves upgrade preservation, deactivation cleanup, default uninstall preservation, and explicit opt-in data removal. No mock result is accepted as release evidence for transport, authentication, WordPress routes, or the editorial story.
