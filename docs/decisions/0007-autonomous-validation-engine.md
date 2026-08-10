# ADR 0007: Central autonomous validation engine (AUTO-05)

Status: accepted — 2026-08-10.

## Context

ADR 0006 specified the autonomous editorial policy surface, manifest
contract, error codes, and fail-closed list, but left the implementation
shape of the shared validation path open. AUTO-05 implements the single
deterministic validator that both dry-run (`wordpress_autonomous_validate`,
AUTO-10) and execution (`wordpress_autonomous_execute`, AUTO-06/07) consume,
so that the two paths can never drift apart on policy.

This record documents the concrete implementation decisions, the exact gate
order, and the fail-closed mapping used by the engine in
`apps/mcp-server/src/autonomous/validate.ts`.

## Decision

One pure module (`apps/mcp-server/src/autonomous/validate.ts`) is the only
place autonomous policy gates are evaluated. It has no I/O, no clocks, no
randomness, no writes: it is a function of its inputs and returns a
structured result (`AutonomousValidationResult`) that is either
`{ ok: true, fingerprint, derivedFacts }` or
`{ ok: false, violations: AutonomousViolation[] }`.

### Gate order (fail-closed list, ADR 0006 §9)

Evaluation stops at the first failing gate — there is no "maybe accepted"
state and later gates are not evaluated after an earlier rejection:

1. **Server kill switch** — `serverPolicy.enabled === false` →
   `autonomous_disabled` (ADR §9.1). Checked first on every call.
2. **Site policy presence/shape** — missing, malformed JSON, non-object, or
   unknown fields → treated as disabled → `autonomous_disabled` (ADR §9.7).
   `parseSitePolicy` returns `null` and the engine rejects; it never
   defaults open.
3. **Site policy kill switch** — `enabled === false` →
   `autonomous_disabled` (ADR §3, §9.7).
4. **Scope gate** — `scopes` (when provided) must include
   `autonomous:execute` → `scope_missing` (ADR §9.2). The MCP boundary
   enforces scopes first; the validator repeats the check so dry-run and
   execution surface the same structured result. When `scopes` is omitted
   the gate is skipped — the MCP `#execute` path always passes scopes.
5. **Manifest shape** — strict `AutonomousManifestSchema` parse with
   unknown-field rejection and the `schedule_draft` refine → `manifest_invalid`
   with every Zod issue enumerated in `detail.issues` (ADR §9.3, §9.6).
6. **Pipeline allowlist** — the `pipelineId` must appear in BOTH the server
   allowlist and the site policy `allowedPipelines`; the violation reports
   which layer(s) rejected (ADR §9.4). Pipeline id alone is never identity.
7. **Pipeline version** — `pipelineVersion` must satisfy
   `minPipelineVersion` at both layers via `versionAtLeast` →
   `pipeline_version_mismatch` (ADR §9.5). Version comparison is numeric
   dot-segment; a numeric segment outranks a non-numeric one at the same
   position (release > pre-release, so `1.2.0-beta` never satisfies a
   `1.2.0` minimum — the fail-closed direction) and two non-numeric
   segments compare lexically.
8. **Derived facts shape** — server-derived facts must parse against
   `AutonomousDerivedFactsSchema`; malformed facts → `derived_fact_mismatch`
   (the engine refuses to proceed on unknown server state; the closest
   existing code is used rather than inventing a new error surface).
9. **Status contradiction** — derived `contentStatus === "publish"`
   contradicts both V1 intents (they create new content) →
   `derived_fact_mismatch` (ADR §9.10).
10. **Author/media/postType claims** — every manifest claim that has a
    non-null derived fact must match it exactly → `derived_fact_mismatch`
    (ADR §9.10). A client may not assert an author/media the site does not
    confirm.
11. **Capability gate** — `derivedFacts.capability === false` →
    `capability_missing` (ADR §4; the plugin re-checks live capabilities
    independently).
12. **Policy fingerprint** — when `expectedPolicyFingerprint` is supplied
    (execution path), it must equal the current fingerprint →
    `policy_fingerprint_mismatch` (ADR §9.8). Dry-run omits it.
13. **Rate caps** — `rateCounts.hour/day/scheduled` vs the server pipeline
    descriptor's `limits`; at-cap counts are allowed, over-cap rejects →
    `rate_cap_exceeded` (ADR §9.11). Limits come from the server allowlist
    descriptor, which is the enforcement layer with persisted counters.

### Fingerprint definition

`policyFingerprint(policy)` = SHA-256 of the canonical JSON serialization
of the **parsed site policy** (defaults materialized by Zod, keys sorted
recursively, no whitespace). The fingerprint therefore changes when the
operator edits the site policy and is stable across key order/whitespace.
It does not include server config: server config cannot change without a
process restart, so it cannot drift between a validate and an execute.

### Fail-closed mapping notes

- A malformed site policy maps to `autonomous_disabled`, not to a config
  error: the plugin reads the option at call time and the engine treats
  "unreadable policy" exactly like "disabled policy".
- Malformed derived facts map to `derived_fact_mismatch` with `detail.issues`
  listing the parse problems. This is a fail-closed refusal; it cannot be
  confused with a client fixable manifest error.
- `edit_conflict` (ADR §9.9) is deliberately NOT in this engine's gate
  list: the V1 manifest creates new content and carries no
  `expectedVersion`/content id. Existing-content revalidation belongs to
  AUTO-06/07 execution, which compares against their own content claims
  using the same version helper semantics.
- `security_rejection` for unavailable audit/reservation preconditions
  (ADR §9.12) and the `409` idempotency semantics (ADR §9.13) are
  execution-context responsibilities (AUTO-06/07/09), not pure-policy
  gates, and stay out of this module.

### Contracts changes (packages/contracts/src/index.ts)

- `SCOPES` gains `autonomous:execute`; `BASE_SCOPES` is the original 14 and
  `SCOPE_PROFILES.publisher` is defined from `BASE_SCOPES`, so no profile
  grants the new scope implicitly (ADR §1).
- `AutonomousManifestSchema`, `AutonomousPolicySchema`,
  `AutonomousPipelinePolicySchema`, `AutonomousLimitsSchema`,
  `AutonomousDerivedFactsSchema` added, all `.strict()`; unknown fields
  rejected; `schemaVersion: z.literal(1)` pinned so a future contract bump
  fails closed.
- `ToolErrorSchema.code` and server `ErrorCode` gain the seven ADR §7
  codes: `autonomous_disabled`, `pipeline_not_allowed`,
  `pipeline_version_mismatch`, `manifest_invalid`, `derived_fact_mismatch`,
  `policy_fingerprint_mismatch`, `rate_cap_exceeded`.

### Server config (apps/mcp-server/src/config.ts)

- `AUTONOMOUS_ENABLED` (`"true"|"false"`, default `"false"`),
  `AUTONOMOUS_ALLOWED_PIPELINES` (JSON array of pipeline descriptors,
  default empty = none allowed), `AUTONOMOUS_RATE_WINDOW_HOURS` (1–24,
  default 24).
- `AUTONOMOUS_ALLOWED_PIPELINES` is parsed eagerly at boot with the strict
  descriptor schema; malformed JSON, non-array, or unknown fields prevent
  the service from starting (ADR §3 fail-closed-at-boot). It never
  silently widens or disables the allowlist.
- New config is additive and disabled by default: an existing deployment
  behaves exactly as before.

## Consequences

- Dry-run and execution share one gate implementation, so a policy change
  cannot pass one path and be rejected by the other.
- The engine is trivially unit-testable (no mocks needed) and table-driven
  tests enumerate every allow/deny rule and malformed boundary
  (`tests/unit/autonomous-validate.test.ts`).
- AUTO-06/07 add the tools that call this engine and then perform their
  consequential-route duties (reservation, audit, idempotency); AUTO-10
  exposes the same engine as a side-effect-free dry-run.
- The WordPress plugin surface (site option schema mirror, REST routes,
  `capability_for_scope` arm, audit fields, migration) is not implemented
  here; it is tracked by a follow-up card (AUTO-11) and verified in the
  PHP/CI matrix where PHP tooling exists.
