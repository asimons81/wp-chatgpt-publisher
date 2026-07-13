# WordPress setup

## Requirements

WordPress 6.9+, PHP 8.1+, single-site, HTTPS in production, standard REST API, and pretty permalinks. Subdirectory installations and correctly configured reverse proxies/CDNs are supported.

## Installation

Build or download the release ZIP, upload it through **Plugins → Add New → Upload Plugin**, and activate it. Open **Editorial Publisher → Diagnostics** and resolve failed checks. The default approval flow does not require an Application Password.

## Connection users and permissions

Approve as the WordPress user whose authority should bound ChatGPT. The connection never elevates that user. An Editor is appropriate for Editorial scope; publishing requires the native `publish_posts` capability plus Publisher scopes. Avoid using an Administrator when a narrower role suffices.

Manage active credentials under **Editorial Publisher → Connections**. Changing scopes revokes the current connection; reconnect from ChatGPT to approve a replacement. Revocation immediately invalidates the WordPress credential.

## HTTPS and proxies

Terminate TLS at a trusted proxy and configure WordPress so `is_ssl()` and generated URLs reflect HTTPS. Forward only trusted proxy headers. Do not disable SSRF checks or use a production private-network override.

## Troubleshooting

- Plugin not discovered: verify activation, `https://site/wp-json/wp-chatgpt-publisher/v1/discovery`, REST access, and TLS.
- Permission denied: compare connection scopes with the approving user's current role/capabilities.
- Edit conflict: fetch the latest content/version, merge, and retry with a new idempotency key.
- Upload rejected: check WordPress maximum upload size, actual image MIME, URL HTTPS, and redirect behavior.
- SEO warning: inspect the detected adapter and [SEO support](seo-adapters.md).
- Security-plugin interference: allow only this plugin's namespace after review; do not disable the security plugin globally.

Uninstall preserves plugin data by default to avoid accidental audit/connection loss. Define `WPCP_REMOVE_DATA_ON_UNINSTALL` as `true` before uninstalling only when deliberate full removal is required.
