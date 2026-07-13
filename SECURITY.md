# Security policy

## Supported versions

Security updates are provided for the latest stable 1.x release. Pre-release and development branches receive fixes when practical but are not supported production releases.

## Report a vulnerability

Do not open a public issue. Use GitHub's private vulnerability-reporting feature for this repository. If it is unavailable, contact the repository owner through the private contact listed on the GitHub profile and request a secure reporting channel. Do not include live credentials, primary passwords, article content, or personal data in the first message.

We aim to acknowledge reports within 3 business days, provide an initial assessment within 7 business days, and coordinate a fix and disclosure timeline based on severity. These are targets, not contractual guarantees.

## In scope

OAuth and connection flows, scope/capability bypass, horizontal connection access, token leakage or replay, SSRF, unsafe media handling, stored/reflected XSS, CSRF, SQL injection, confirmation bypass, audit tampering, secret exposure, and dependency compromise.

## Design principles

- Every MCP tool and WordPress route enforces authorization independently.
- Effective access is the intersection of connection scope, current WordPress capability, plugin safety policy, and tool requirements.
- Consequential actions use fresh, action-bound, version-bound, single-use confirmations.
- Credentials are encrypted or irreversibly hashed, redacted from logs, short-lived where possible, rotatable, and revocable.
- WordPress content is untrusted data and never controls tool metadata or authorization.
- No v1 tool exposes arbitrary code, SQL, filesystem, plugin, theme, settings, or user administration.

See [docs/threat-model.md](docs/threat-model.md) for trust boundaries, mitigations, and residual risks.
