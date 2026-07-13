# Threat model

## Assets and actors

Assets: WordPress content and revisions, publish authority, scoped connection credentials, OAuth tokens/codes, media, SEO metadata, audit integrity, service keys, and user privacy. Actors include legitimate editors/publishers, compromised ChatGPT sessions, malicious sites or media hosts, unauthenticated internet clients, compromised WordPress accounts, and dependency attackers.

## Entry points

OAuth discovery/registration/authorization/token routes; site URL and plugin discovery; MCP `/mcp`; WordPress approval/admin actions; plugin REST routes; remote media URLs; PostgreSQL; logs; CI and release artifacts.

## Threats and mitigations

| Threat                          | Mitigation                                                                                                                                              | Residual risk                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| OAuth interception/replay       | S256 PKCE, exact redirect allowlist, resource/audience binding, state, short code TTL, atomic single use, refresh rotation                              | Compromised client/browser can act within current grant                      |
| Scope/capability bypass         | Independent MCP and REST checks; live WordPress capability checks; separate consequential tools                                                         | A compromised authorized publisher retains their native power until revoked  |
| Horizontal connection access    | Connection ID comes only from signed access token; DB lookups bind client, token, and connection                                                        | Signing-key compromise affects all service connections                       |
| Credential theft                | One-time encrypted grant handoff, WordPress keyed hash, service AES-GCM, redaction, no query logging, rotation/revocation                               | Browser history contains a short-lived one-time grant, not the credential    |
| SSRF / DNS rebinding            | HTTPS, port allowlist, private/reserved rejection, fresh DNS resolution, pinned lookup, no redirects, timeout/byte caps; WordPress `wp_safe_remote_get` | DNS infrastructure compromise outside process trust                          |
| Unsafe uploads/polyglots        | Byte cap, verified MIME with `finfo`, image allowlist, WordPress attachment pipeline, sanitized filename                                                | Image decoder vulnerabilities require upstream security updates              |
| CSRF/XSS                        | WordPress nonces + capabilities, exact OAuth redirects, CSP, escaped admin output, kses/sanitization                                                    | Vulnerabilities in WordPress/core dependencies                               |
| Prompt injection/tool poisoning | Static reviewed tools; site content remains data; no dynamic scopes/tools/descriptions; no autonomous publishing                                        | Model may summarize malicious text poorly, but cannot expand permissions     |
| Confirmation bypass             | Fresh single-use hash, action/content/version/payload/connection binding, short TTL, idempotency                                                        | A user can intentionally confirm a harmful but accurately displayed action   |
| SQL injection                   | WordPress APIs and prepared queries; parameterized PostgreSQL                                                                                           | Review remains required for dynamic table identifiers fixed by plugin prefix |
| Secret leakage                  | Pino redaction, query stripping, safe errors, no stack traces, CI secret scanning                                                                       | Operator misconfiguration outside project logging                            |
| Audit tampering                 | HMAC hash chain and minimal immutable fields                                                                                                            | A WordPress DB administrator can delete/rewrite both records and site salts  |
| Supply chain                    | Lockfiles, Dependabot, dependency review, CodeQL, production audit, SBOM, minimal runtime set                                                           | Registry or maintainer compromise before detection                           |

## Privacy and retention

The service persists connection metadata, encrypted credentials, grants, codes, refresh-token hashes, confirmation hashes, and idempotent responses. It does not persist article bodies, prompts, conversations, or files. WordPress stores normal content plus connection/audit metadata. Expired grants and idempotency records are cleaned; operators should set explicit DB backup and log retention. Telemetry is disabled by default.

## Security review triggers

Re-review this model when adding a new scope/tool, redirect/identity provider, media source, persistence field, rich UI origin, hosting mode, third-party SEO write adapter, multisite behavior, or background job.
