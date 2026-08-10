# Threat model

## Assets and actors

Assets: WordPress content and revisions, publish authority, scoped connection credentials, OAuth tokens/codes, media, SEO metadata, audit integrity, service keys, and user privacy. Actors include legitimate editors/publishers, compromised ChatGPT sessions, malicious sites or media hosts, unauthenticated internet clients, compromised WordPress accounts, and dependency attackers.

## Entry points

OAuth discovery/registration/authorization/token routes; site URL and plugin discovery; MCP `/mcp`; WordPress approval/admin actions; plugin REST routes; remote media URLs; PostgreSQL; logs; CI and release artifacts.

## Threats and mitigations

| Threat                          | Mitigation                                                                                                                                                                      | Residual risk                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| OAuth interception/replay       | S256 PKCE, exact redirect allowlist, resource/audience binding, state, short code TTL, atomic single use, refresh rotation                                                      | Compromised client/browser can act within current grant                                   |
| Scope/capability bypass         | Independent MCP and REST checks; live WordPress capability checks; separate consequential tools                                                                                 | A compromised authorized publisher retains their native power until revoked               |
| Horizontal connection access    | Connection ID comes only from signed access token; DB lookups bind client, token, and connection                                                                                | Signing-key compromise affects all service connections                                    |
| Credential theft                | One-time encrypted grant handoff, WordPress keyed hash, service AES-GCM, redaction, no query logging, rotation/revocation                                                       | Browser history contains a short-lived one-time grant, not the credential                 |
| SSRF / DNS rebinding            | HTTPS, port allowlist, private/reserved rejection, fresh DNS resolution, pinned lookup, no redirects, timeout/byte caps; WordPress `wp_safe_remote_get`                         | DNS infrastructure compromise outside process trust                                       |
| Unsafe uploads/polyglots        | Byte cap, verified MIME with `finfo`, image allowlist, WordPress attachment pipeline, sanitized filename                                                                        | Image decoder vulnerabilities require upstream security updates                           |
| CSRF/XSS                        | WordPress nonces + capabilities, exact OAuth redirects, CSP, escaped admin output, kses/sanitization                                                                            | Vulnerabilities in WordPress/core dependencies                                            |
| Prompt injection/tool poisoning | Static reviewed tools; site content remains data; no dynamic scopes/tools/descriptions; autonomous publishing confined to a dedicated disabled-by-default scope and policy path | Model may summarize malicious text poorly, but cannot expand permissions                  |
| Confirmation bypass             | Fresh single-use hash, action/content/version/payload/connection binding, short TTL, idempotency                                                                                | A user can intentionally confirm a harmful but accurately displayed action                |
| Autonomous pipeline spoofing    | Dedicated `autonomous:execute` scope, server allowlist AND site policy naming the pipeline for this connection, manifest version minimums, execution-time validation            | Operator must trust orchestration identity; revoke connection/scope or disable policy     |
| Stolen general publisher token  | `autonomous:execute` is never granted by default profiles; autonomous tools fail `scope_missing` without it                                                                     | A compromised token that already has `autonomous:execute` retains its power until revoked |
| Manifest lies                   | Attestations (research/QA) are audit records only; draft/type/author/image/SEO/version/capability/rate facts are independently derived at execution and compared (fail closed)  | Authenticated allowed pipeline can submit false attestations                              |
| Replay/retry                    | Dual idempotency (server claim + WordPress reservation) plus immutable request hash; cached deterministic outcome                                                               | DB administrator can inspect or rewrite audit/reservation rows                            |
| Concurrent/TOCTOU races         | WordPress atomic reservation, execution-time status/version recheck under the consequential route; dry-run validates but grants nothing                                         | Residual window between final check and WordPress status transition                       |
| Stale policy                    | Site policy read at execution time; policy fingerprint bound to validate→execute; mismatch fails closed                                                                         | Operator misconfiguration leaves policy stale but fingerprint current                     |
| Agent loop                      | Rolling hour/day and scheduled-count caps per pipeline; strict intent allowlist (draft/future only)                                                                             | High but compliant volume still consumes quota up to caps                                 |
| Published-content abuse         | V1 rejects all non-draft/future states; no autonomous edit tool; no deletion or site administration                                                                             | Future intent expansion requires re-review                                                |
| Confused deputy                 | Narrow validate/execute tools only, each requiring the dedicated scope at both boundaries                                                                                       | A compromised orchestrator with the scope can create drafts on the site                   |
| Audit leakage                   | Allowlisted metadata/hash references only; no tokens, bodies, headers, or manifest free text in logs or audit                                                                   | Operator misconfiguration outside project logging                                         |
| Malformed config/manifest       | Strict schemas at every boundary; unknown fields rejected; malformed policy treated as disabled                                                                                 | None beyond correct schema maintenance                                                    |
| DB/audit failure                | Consequential operation does not proceed if reservation or audit preconditions cannot be established                                                                            | Availability impact under database failure                                                |
| Partial side effects            | Idempotency reserved before mutation; deterministic outcome persisted; post-state recovery semantics documented                                                                 | Crash after WordPress mutation but before outcome persist                                 |
| SQL injection                   | WordPress APIs and prepared queries; parameterized PostgreSQL                                                                                                                   | Review remains required for dynamic table identifiers fixed by plugin prefix              |
| Secret leakage                  | Pino redaction, query stripping, safe errors, no stack traces, CI secret scanning                                                                                               | Operator misconfiguration outside project logging                                         |
| Audit tampering                 | HMAC hash chain and minimal immutable fields                                                                                                                                    | A WordPress DB administrator can delete/rewrite both records and site salts               |
| Supply chain                    | Lockfiles, Dependabot, dependency review, CodeQL, production audit, SBOM, minimal runtime set                                                                                   | Registry or maintainer compromise before detection                                        |

## Autonomous pipeline trust path

Autonomous publishing is a separate, additive path: authenticated MCP
actor/connection → dedicated `autonomous:execute` scope → server allowlist AND
site policy → configured allowed pipeline → strict manifest (attestations
only) → server-derived current WordPress facts. PipelineId is not identity;
authorization binds to the existing connection and the dedicated scope
explicitly approved by the WordPress user/site operator, and every execution
re-validates under the consequential route. The full policy, manifest
schema, identity binding, rate/audit/atomicity semantics, errors, and
fail-closed cases are specified in [ADR 0006](decisions/0006-autonomous-editorial-policy.md).

## Privacy and retention

The service persists connection metadata, encrypted credentials, grants, codes, refresh-token hashes, confirmation hashes, and idempotent responses. It does not persist article bodies, prompts, conversations, or files. WordPress stores normal content plus connection/audit metadata. Expired grants and idempotency records are cleaned; operators should set explicit DB backup and log retention. Telemetry is disabled by default.

## Security review triggers

Re-review this model when adding a new scope/tool, redirect/identity provider, media source, persistence field, rich UI origin, hosting mode, third-party SEO write adapter, multisite behavior, background job, **autonomous intent or pipeline policy change, manifest schema change, or rate-cap change**.
