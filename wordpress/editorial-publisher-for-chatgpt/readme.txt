=== Editorial Publisher for ChatGPT ===
Contributors: asimons81
Tags: chatgpt, editorial, publishing, mcp, rest-api
Requires at least: 6.9
Tested up to: 7.0
Requires PHP: 8.1
Stable tag: 1.0.2
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Securely manage WordPress editorial workflows from ChatGPT. No OpenAI API key required and no separate pay-per-token OpenAI API bill from this plugin.

== Description ==

Editorial Publisher for ChatGPT connects a self-hosted WordPress site to its open-source MCP service. Users approve granular permissions on their own WordPress site and can search content, create and update drafts, manage media and metadata, preview work, and explicitly confirm scheduling or publishing.

The plugin does not call an LLM or the OpenAI API, does not ask for a primary WordPress password, and does not provide arbitrary administration, code execution, database, or filesystem tools.

== External services ==

The plugin contacts only the MCP connection service selected by the site owner and image URLs explicitly supplied for a media request. The connection service provides OAuth, ChatGPT's MCP transport, encrypted connection storage, and forwarding of the user's requested editorial operations. No request is sent merely by activating the plugin. The service is open source and self-hostable; deployment, privacy, and terms materials are available at https://github.com/asimons81/wp-chatgpt-publisher.

== Installation ==

1. Upload the plugin ZIP from Plugins > Add New > Upload Plugin.
2. Activate Editorial Publisher for ChatGPT.
3. Confirm HTTPS and pretty permalinks under Editorial Publisher > Diagnostics.
4. Deploy or choose a trusted open-source Editorial Publisher for ChatGPT MCP service.
5. Add the service as a developer-mode app in ChatGPT and approve the requested connection on this WordPress site.

== Frequently Asked Questions ==

= Does this require an OpenAI API key? =

No. The project does not call the OpenAI API. ChatGPT plan limits still apply.

= Does ChatGPT receive my WordPress password? =

No. Authentication happens on your WordPress site. The plugin issues an individually revocable, scoped credential.

= Can it publish automatically? =

No. Publishing and scheduling are disabled in the recommended Editorial profile and require an explicit, short-lived confirmation even when Publisher permission is approved.

== Privacy ==

The plugin stores connection metadata, keyed credential hashes, approved scopes, and a minimal audit trail. It does not store ChatGPT prompts, conversations, article bodies in the audit log, uploaded binaries in the audit log, authorization headers, or primary passwords.

== Changelog ==

= 1.0.2 =
* Keep OAuth grants, authorization codes, signed connection requests, and other query-string credentials out of structured service logs.
* Make WordPress and source release archives byte-for-byte reproducible across checkout times and host operating systems.
* Document external-service behavior for WordPress.org directory review.

= 1.0.1 =
* Add opt-in low-cardinality HTTP metrics and complete structured tool-operation logging.

= 1.0.0 =
* Initial open-source release.
