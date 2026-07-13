# Compatibility

## Supported v1 targets

- WordPress 6.9+ single-site with the REST API and pretty permalinks
- PHP 8.1-8.4 with Sodium
- Node.js 24 LTS and npm 11
- PostgreSQL 15-17 for the MCP service
- MariaDB 10.11-11.8 or compatible MySQL for WordPress
- Current evergreen desktop browsers and current ChatGPT web/mobile clients
- Root or subdirectory WordPress behind correctly configured HTTPS proxies/CDNs

## Verified release matrix

- Docker WordPress 6.9.4 / PHP 8.3 / MariaDB 11.8: full OAuth, MCP, WordPress integration, E2E, and lifecycle pass.
- `wordpress:latest`: included as the second full live CI matrix target.
- PHP 8.1, 8.2, 8.3, and 8.4: syntax, PHPCS, PHPStan, and PHPUnit CI matrix.
- Node 24.13 / npm 11, PostgreSQL 17: build, unit, security, live integration, and E2E pass.
- WordPress Playground 6.9.4 / PHP 8.3 / SQLite: fresh release ZIP install, activation, discovery, schema, and authorization smoke pass.
- 1280x720 and 390x844: WordPress admin and ChatGPT card visual/overflow/interaction pass.

Unsupported in v1: Multisite, WordPress.com hosted plans, headless deployments, disabled REST API, production HTTP, unusual custom authentication layers, and mandatory private-network WordPress origins.
