# ChatGPT and full-stack acceptance

## Status

The complete product story passes against disposable WordPress, PostgreSQL, and the real Streamable HTTP MCP transport. Embedded UI surfaces pass desktop and 390px mobile browser QA. Manual connection from the maintainer's ChatGPT account remains account-gated and the Vercel runtime remains database-gated.

## Automated/live evidence

| Case                         | Result | Evidence                                                                                                                                                          |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth and WordPress approval | Pass   | `tests/e2e/editorial-flow-live.test.ts` establishes editorial and publisher connections with S256 PKCE and site-side consent.                                     |
| Discover tools/resources     | Pass   | The official MCP client sees the static tool inventory, annotations, OAuth schemes, and Apps SDK resources.                                                       |
| Search and retrieve          | Pass   | Compact search and selected Markdown retrieval run against seeded WordPress.                                                                                      |
| Draft and revision           | Pass   | Create, update, conflict/version, preview, and revision evidence are asserted.                                                                                    |
| Media and metadata           | Pass   | A public HTTPS image is validated/sideloaded; featured image, category, tag, and native SEO are verified.                                                         |
| Publish denial               | Pass   | Editorial scope receives `scope_missing`.                                                                                                                         |
| Publish confirmation         | Pass   | Publisher confirmation succeeds once; replay receives `confirmation_expired`.                                                                                     |
| Scheduling                   | Pass   | A future post is stored with the site timezone and asserted as `future`.                                                                                          |
| Revocation                   | Pass   | WordPress-side revoke makes the next MCP call fail with `connection_expired`.                                                                                     |
| UI interactions              | Pass   | Confirmation cancel/execute, result transition, error alert, external links, empty states, and disclosure controls were exercised in the in-app browser.          |
| Mobile layout                | Pass   | All site/search/media/taxonomy/SEO/review/write/error fixtures and WordPress admin pages have no document overflow at 390px; actions meet the mobile target size. |

Screenshots:

- [ChatGPT connected-site card, desktop](assets/acceptance/chatgpt-site-card-desktop.png)
- [ChatGPT publish review, mobile](assets/acceptance/chatgpt-review-mobile.png)
- [WordPress overview, desktop](assets/acceptance/wordpress-admin-desktop.png)
- [WordPress overview, mobile](assets/acceptance/wordpress-admin-mobile.png)

## Production/developer-mode gate

Vercel remote build and alias creation pass. The production function currently returns a generic HTTP 500 because `DATABASE_URL` is intentionally required and absent; Vercel logs show only that safe configuration error. After the owner connects managed PostgreSQL and redeploys, verify `/healthz`, `/readyz`, both OAuth metadata endpoints, `/ui/assets/app.js`, and `/mcp`, then connect `https://editorial-publisher-for-chatgpt.vercel.app/mcp` in ChatGPT developer mode and repeat the golden prompts on desktop and mobile.

Do not store tokens, real personal data, or primary WordPress credentials in screenshots or logs.
