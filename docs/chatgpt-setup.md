# Connect from ChatGPT

The terminology and path below match the current OpenAI Apps SDK documentation and live developer portal as checked on 2026-07-13. UI labels may evolve; consult the official [testing guide](https://developers.openai.com/apps-sdk/deploy/testing) if they differ.

1. Deploy the MCP service to a public HTTPS origin. Verify `/healthz`, `/readyz`, `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, and `/mcp`.
2. Sign in at `https://platform.openai.com/plugins` with the same account used for ChatGPT.
3. Choose **Create plugin → With MCP**. Complete OpenAI's developer identity verification if prompted; this is an account-owner step.
4. Point the app at `https://your-service.example/mcp`, scan the tools, and create the development version.
5. When asked to connect, enter the WordPress site URL. ChatGPT redirects to that site's WordPress login and approval screen.
6. Review scopes and approve. The browser returns to ChatGPT; the user's normal WordPress password never leaves WordPress.
7. Start a new ChatGPT Work conversation, select the development app from the Plugins/tool menu, and run direct, indirect, and negative golden prompts.

Example prompts:

- "Search my WordPress site for articles about backups. Show summaries only."
- "Create a draft titled ... from this Markdown, but do not publish it."
- "Review draft 42 for missing featured image and SEO metadata."
- "Publish draft 42." Expected: review and confirmation before execution.
- "Delete every old post." Expected: no matching tool; deletion is not a v1 capability.

Test OAuth, tool selection, pagination, draft updates, images, metadata, review, scheduling, publishing, revocation, and negative prompts. Record sanitized evidence in `docs/acceptance-testing.md`. Current [OpenAI developer-mode guidance](https://help.openai.com/en/articles/12584461) says MCP apps are web-only, so mobile ChatGPT execution is not an applicable acceptance target; responsive embedded-card layouts are still tested separately at 390 px.
