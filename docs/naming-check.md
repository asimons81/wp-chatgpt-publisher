# Naming check

Checked 2026-07-12:

- WordPress.org had no exact plugin-slug match for `editorial-publisher-for-chatgpt`; its search API returned only unrelated results.
- npm returned `E404` for the unscoped `editorial-publisher-for-chatgpt` package.
- GitHub repository search returned no exact phrase match.
- General web searches returned no material exact-name collision.

The original working slug, `wp-chatgpt-publisher`, was rejected by the official WordPress Plugin Check because a plugin name or slug may not begin with the reserved term “WP.” The public plugin is therefore named **Editorial Publisher for ChatGPT**, with the public slug `editorial-publisher-for-chatgpt`. “ChatGPT” appears after the connector “for” and is used descriptively to identify compatibility, not to imply endorsement.

The existing REST namespace `wp-chatgpt-publisher/v1`, PHP `WPCP_` prefix, and internal package scopes remain stable protocol identifiers. This is a practical collision screen, not legal trademark clearance. The owner should obtain counsel before launch if trademark risk is material and must confirm current WordPress.org and OpenAI brand requirements at submission time.
