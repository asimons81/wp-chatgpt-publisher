# Official-document research notes

Checked 2026-07-12.

## OpenAI Apps SDK and MCP

- Apps require an MCP server; UI is optional and should use the open MCP Apps bridge, with ChatGPT-only `window.openai` capabilities feature-detected: https://developers.openai.com/apps-sdk/quickstart and https://developers.openai.com/apps-sdk/build/mcp-server
- Authenticated customer data and writes require OAuth 2.1 conforming to MCP authorization: protected-resource metadata, authorization-server discovery, resource propagation/audience checks, S256 PKCE, and per-tool security schemes: https://developers.openai.com/apps-sdk/build/auth
- Tool annotations are required and must accurately describe read/write/destructive impact. Model-visible and UI metadata must never contain secrets: https://developers.openai.com/apps-sdk/build/mcp-server
- UI resources require `text/html;profile=mcp-app`, exact CSP origins, and a unique app domain for submission: https://developers.openai.com/apps-sdk/build/chatgpt-ui
- Developer-mode and MCP Inspector testing plus desktop/mobile golden prompts are expected: https://developers.openai.com/apps-sdk/deploy/testing
- Submission currently requests app/logo/description/company/privacy URLs, MCP and tool information, test prompts/responses, localization, confirmations, and optional UI screenshots: https://developers.openai.com/apps-sdk/deploy/submission

Decision: use official `@modelcontextprotocol/sdk` and `@modelcontextprotocol/ext-apps`, remote HTTPS MCP, optional React cards, OAuth code + PKCE, DCR, static per-tool metadata, and no OpenAI API client.

## WordPress

- The Abilities API is available from WordPress 6.9 and provides namespaced abilities, JSON schemas, permission callbacks, annotations, and optional REST exposure: https://developer.wordpress.org/apis/abilities-api/ and https://developer.wordpress.org/reference/functions/wp_register_ability/
- Application Passwords are individually manageable and revocable but are not necessary for the default approval flow: https://developer.wordpress.org/rest-api/reference/application-passwords/
- Custom REST routes require explicit `permission_callback`, schemas, request APIs, and native capability checks: https://developer.wordpress.org/rest-api/extending-the-rest-api/adding-custom-endpoints/
- Plugin Directory submissions must be GPL-compatible and follow naming/trademark, service, security, and human-readable-code requirements: https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/

Decision: WordPress 6.9+, PHP 8.1+, conventional REST controllers as the compatibility contract, optional non-REST Abilities discovery, native revisions/media/taxonomy APIs, and a single GPL-2.0-or-later repository license.
