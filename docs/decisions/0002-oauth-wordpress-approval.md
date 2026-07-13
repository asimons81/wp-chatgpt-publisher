# ADR 0002: OAuth 2.1 plus WordPress-side approval grant

Status: accepted — 2026-07-12.

Use OAuth authorization code + S256 PKCE between ChatGPT and the MCP service. The service redirects site authorization to WordPress, where the user logs in normally and approves scopes. WordPress issues a short-lived encrypted one-time grant and revocable integration credential. The service receives no primary password. DCR is supported for ChatGPT client registration. Tokens bind issuer, audience/resource, client, connection, subject, scope, expiry, and ID.
