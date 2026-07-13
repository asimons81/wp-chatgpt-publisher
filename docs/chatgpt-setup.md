# Connect from ChatGPT

The terminology and path below match the current OpenAI Apps SDK documentation as checked on 2026-07-12. UI labels may evolve; consult the official [testing guide](https://developers.openai.com/apps-sdk/deploy/testing) if they differ.

1. Deploy the MCP service to a public HTTPS origin. Verify `/healthz`, `/readyz`, `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, and `/mcp`.
2. In ChatGPT, open **Settings → Security and login** and enable **Developer mode**.
3. Open **Settings → Plugins** (or the current app-management page), choose the plus button, and create a developer-mode app pointing to `https://your-service.example/mcp`.
4. When asked to connect, enter the WordPress site URL. ChatGPT redirects to that site's WordPress login and approval screen.
5. Review scopes and approve. The browser returns to ChatGPT; the user's normal WordPress password never leaves WordPress.
6. Start a new conversation, enable the app, and run direct, indirect, and negative golden prompts.

Example prompts:

- “Search my WordPress site for articles about backups. Show summaries only.”
- “Create a draft titled … from this Markdown, but do not publish it.”
- “Review draft 42 for missing featured image and SEO metadata.”
- “Publish draft 42.” Expected: review and confirmation before execution.
- “Delete every old post.” Expected: no matching tool; deletion is not a v1 capability.

Test OAuth, tool selection, pagination, draft updates, images, metadata, review, scheduling, publishing, revocation, negative prompts, and mobile layouts. Record sanitized evidence in `docs/acceptance-testing.md`.
