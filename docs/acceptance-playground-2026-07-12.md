# Fresh-install and browser acceptance - 2026-07-12

## Fresh ZIP / WordPress Playground

Environment: WordPress 6.9.4, PHP 8.3, SQLite-backed WordPress Playground, release ZIP installed into a clean disposable site.

Verified:

- The packaged plugin installed with the correct root directory and activated without a PHP fatal.
- The plugin created all four owned tables and recorded schema version 1.0.0.
- Discovery returned plugin 1.0.0, WordPress 6.9.4, and Abilities API availability.
- An unauthenticated site read returned HTTP 401.
- The connection exchange endpoint exposed its strict POST schema.
- Official Plugin Check 2.0.0 completed with no errors.

## Browser acceptance

Environment: Docker WordPress 6.9.4/PHP 8.3 with disposable seeded data, local MCP/PostgreSQL, Codex in-app browser at 1280x720 and 390x844.

Verified:

- WordPress overview, connections, permissions, audit, and diagnostics render with semantic headings and controls.
- Connection cards reflow to one column; the audit table scrolls inside its container without document overflow.
- ChatGPT connected-site, content, media, taxonomy, SEO, review, write, error, and empty surfaces render in dark mode and at 390px.
- A dark-theme inherited-color defect was found visually, fixed, and reverified.
- Confirmation cancel and execute paths work; the fresh browser console contains no application error.

Artifacts:

- [Desktop WordPress admin capture](assets/acceptance/wordpress-admin-desktop.png)
- [Mobile WordPress admin capture](assets/acceptance/wordpress-admin-mobile.png)
- [Desktop ChatGPT card](assets/acceptance/chatgpt-site-card-desktop.png)
- [Mobile ChatGPT review](assets/acceptance/chatgpt-review-mobile.png)

This evidence validates packaging and local product behavior. It does not replace the account-gated production ChatGPT developer-mode check.
