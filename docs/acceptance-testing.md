# ChatGPT and full-stack acceptance

## Status

The complete product story passes against disposable WordPress, PostgreSQL, and the real Streamable HTTP MCP transport. Embedded UI surfaces pass desktop and 390px mobile browser QA. The public Vercel/Neon runtime passes protocol and persistence checks. The maintainer's ChatGPT Plus web account completes the production developer-mode OAuth, read, draft, and publish-review flows; the mobile-client pass remains account-gated.

## Automated/live evidence

| Case                         | Result | Evidence                                                                                                                                                                                             |
| ---------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth and WordPress approval | Pass   | `tests/e2e/editorial-flow-live.test.ts` establishes editorial and publisher connections with S256 PKCE and site-side consent.                                                                        |
| Discover tools/resources     | Pass   | The official MCP client sees the static tool inventory, annotations, OAuth schemes, and Apps SDK resources.                                                                                          |
| Search and retrieve          | Pass   | Compact search and selected Markdown retrieval run against seeded WordPress.                                                                                                                         |
| Draft and revision           | Pass   | Create, update, conflict/version, preview, and revision evidence are asserted.                                                                                                                       |
| Media and metadata           | Pass   | A public HTTPS image is validated/sideloaded; featured image, category, tag, and native SEO are verified.                                                                                            |
| Publish denial               | Pass   | Editorial scope receives `scope_missing`.                                                                                                                                                            |
| Publish confirmation         | Pass   | Publisher confirmation succeeds once; replay receives `confirmation_expired`.                                                                                                                        |
| Scheduling                   | Pass   | A future post is stored with the site timezone and asserted as `future`.                                                                                                                             |
| Revocation                   | Pass   | WordPress-side revoke makes the next MCP call fail with `connection_expired`.                                                                                                                        |
| UI interactions              | Pass   | Confirmation cancel/execute, result transition, error alert, external links, empty states, and disclosure controls were exercised in the in-app browser.                                             |
| Mobile layout                | Pass   | All site/search/media/taxonomy/SEO/review/write/error fixtures and WordPress admin pages have no document overflow at 390px; actions meet the mobile target size.                                    |
| Public production runtime    | Pass   | The stable HTTPS alias returns healthy/readiness/version responses, both OAuth metadata documents, the Apps SDK asset, a persisted DCR/authorization flow, and the required MCP 401 OAuth challenge. |

Screenshots:

- [ChatGPT connected-site card, desktop](assets/acceptance/chatgpt-site-card-desktop.png)
- [ChatGPT publish review, mobile](assets/acceptance/chatgpt-review-mobile.png)
- [WordPress overview, desktop](assets/acceptance/wordpress-admin-desktop.png)
- [WordPress overview, mobile](assets/acceptance/wordpress-admin-mobile.png)

## Production and developer-mode gate

Vercel build `dpl_EmEngVt8DuaN5KGM3YS6riQjVSjS` is READY with a production-only Neon `free_v3` database. `/healthz` and `/readyz` return 200, OAuth dynamic registration and flow persistence succeed, the UI asset is cacheable with security headers, and unauthenticated `/mcp` returns the RFC 9728 challenge. ChatGPT developer-mode desktop acceptance against a disposable HTTPS WordPress site passes, including OAuth, read-only discovery, a safe draft, and a publish review that does not execute. See [the dated acceptance record](acceptance-chatgpt-2026-07-13.md). The remaining manual gate is the ChatGPT mobile-client pass.

Do not store tokens, real personal data, or primary WordPress credentials in screenshots or logs.
