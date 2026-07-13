# Contributing

Thank you for improving Editorial Publisher for ChatGPT.

## Setup

Use Node.js 24 LTS, npm 11+, PHP 8.1+, and Docker. Copy `.env.example` to `.env`, use development-only random keys, run `npm install`, then `docker compose up --build`.

## Standards

- TypeScript is strict, formatted with Prettier, linted with ESLint, and tested with Vitest.
- PHP follows WordPress, WordPress-Extra, and WordPress-Docs coding standards and is analyzed with PHPStan.
- Validate early and escape late. REST routes require explicit permission callbacks.
- Never weaken scope, capability, nonce, PKCE, confirmation, SSRF, MIME, or redaction controls to make a demo pass.
- Do not commit credentials, `.env` files, databases, private content, screenshots with personal data, or generated artifacts.
- Keep tool names, descriptions, schemas, annotations, and security schemes static and reviewed.

## Required checks

Run formatting, lint, type checking, unit/integration/E2E/security tests, PHP checks, the production build, WordPress ZIP packaging, and `npm run release:check`. Add tests for every behavior change. Protocol work must include an actual MCP client path; WordPress work must include capability and permission cases.

## Pull requests

Keep changes focused, explain user impact and security impact, link an issue when available, update docs and changelog, and include exact verification evidence. Reviewers may require a threat-model update for authentication, authorization, media, storage, or network changes.

By contributing, you agree that your contribution is licensed under GPL-2.0-or-later and follows the [Code of Conduct](CODE_OF_CONDUCT.md).
