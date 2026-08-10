# ADR 0008: Server-side autonomous audit log and provenance (AUTO-09)

Status: accepted — 2026-08-10.

## Context

ADR 0006 §6 specifies the audit surface for the autonomous pipeline:
reuse the tamper-evident `WPCP_Audit` chain, add allowlisted non-free-text
fields (`pipeline_id`, `pipeline_version`, `request_hash`,
`policy_fingerprint`, `outcome`), never record manifest bodies, attestation
free text, tokens, or headers, and keep failed validate/execute attempts
durable. ADR 0007 explicitly excluded audit writing from the pure
validation engine and assigned the audit-precondition failure path
(`security_rejection`, ADR 0006 §9.12) to the execution context.

The plugin-side `WPCP_Audit` field extension is tracked by AUTO-11. This
record covers the **server-side** audit module: the safe structured record
the MCP service persists for every autonomous attempt — including blocks
that never reach WordPress (server kill switch, scope gate, manifest
parse, rate caps), which the plugin chain cannot see.

## Decision

A pure module (`apps/mcp-server/src/autonomous/audit.ts`) builds a strict,
allowlisted `AutonomousAuditRecord`; the Postgres repository persists and
queries it. The record is the single provenance artifact for autonomous
attempts and answers "why published or blocked" from structured fields
only.

### Record contract

```ts
{
  schemaVersion: 1,            // literal pin; future bumps fail closed
  id: uuid,                    // record id
  requestId: uuid,             // manifest requestId (idempotency key)
  connectionId: uuid,          // FK to connections; identity, not credential
  clientId: string,            // MCP actor client id
  pipelineId: string,          // allowlisted pipeline pattern
  pipelineVersion: string,
  intent: "create_draft" | "schedule_draft",
  outcome: "validated" | "rejected" | "succeeded" | "failed",
  violations: [{ code, layer? }],  // allowlisted codes + server|site layer
  policyFingerprint: hex64,    // site policy fingerprint at validation time
  requestHash: hex64,          // immutable binding (below)
  createdAt: ISO datetime,
}
```

`.strict()` everywhere: unknown fields are rejected, so a future caller
cannot accidentally persist a manifest body or a token.

### request_hash (immutable binding)

`requestHash = SHA-256(canonicalJson({ manifest, connection: { connectionId,
clientId }, policyFingerprint }))`, using the same canonical JSON
serialization as the validator (recursively sorted keys, no whitespace).
The manifest enters the audit path **only** through this hash — never as a
stored body. Any change to manifest, connection identity, or policy
fingerprint changes the hash; identical inputs reproduce it
deterministically. This binds each record to the exact validated content
and lets an operator verify provenance without exposing content.

### Redaction rules (enforced by construction + tests)

- The builder accepts only typed allowlisted inputs; the manifest is used
  solely for hash derivation.
- Violations are normalized to `{ code, layer? }`; messages and detail
  free text are dropped. `layer` is copied only when it is exactly
  `"server"` or `"site"`.
- Never persisted: manifest body/title/excerpt/slug, attestation sources,
  checks, models, tokens, authorization headers, credentials.
- The unit suite includes redaction tests that plant secret markers in the
  manifest and assert they never appear in the serialized record.

### Persistence and queries

- New table `autonomous_audit` (migration in `PostgresRepository.migrate`):
  `schema_version`, `id`, `request_id`, `connection_id` (FK →
  connections), `client_id`, `pipeline_id`, `pipeline_version`, `intent`,
  `outcome`, `violations` (jsonb), `policy_fingerprint`, `request_hash`,
  `created_at`; indexes on (connection_id, created_at DESC), pipeline_id,
  request_id.
- `recordAutonomousAudit(record)` parses the record strictly and inserts
  it; any failure throws, which the execution context must map to
  `security_rejection` (ADR 0006 §9.12) — a consequential operation never
  proceeds when audit preconditions cannot be established.
- `listAutonomousAudits({ connectionId?, pipelineId?, outcome?, limit? })`
  returns newest-first records for provenance queries.

### Fail-closed notes

- `schemaVersion` is a literal `1` in the record schema and stored in the
  table; a future contract bump cannot be silently read as current.
- The connection FK means audit records only exist for real connections —
  the first scratch run confirmed the DB rejects orphan records.
- The module is pure: no I/O, no clocks except an injectable timestamp,
  no randomness except an injectable id.

## Consequences

- AUTO-06/07/08 call `buildAutonomousAuditRecord` + `recordAutonomousAudit`
  at every validate/execute boundary; dry-run (AUTO-10) records
  `validated`/`rejected`, execution records `succeeded`/`failed`/`rejected`.
- The plugin chain (AUTO-11) mirrors the same allowlisted fields in
  `WPCP_Audit`; the two records are correlated by `requestId` and
  `requestHash` (same canonical definition, mirrored in PHP).
- Verification: `tests/unit/autonomous-audit.test.ts` (22 cases — required
  fields, strictness, redaction, hash determinism/sensitivity, provenance
  semantics) plus a real Postgres round-trip scratch check
  (`scripts/scratch/auto09-audit-roundtrip.mts`, disposable local DB).
