# ADR 0008: Side-effect-free dry-run validation surface (AUTO-10)

Status: accepted — 2026-08-10.

## Context

ADR 0006 specified two autonomous MCP tools — `wordpress_autonomous_validate`
and `wordpress_autonomous_execute` — and ADR 0007 implemented the shared
deterministic engine (`apps/mcp-server/src/autonomous/validate.ts`) with a
fail-fast gate pipeline. AUTO-10 implements the validation-only surface:
a first-class, side-effect-free way to ask "is this autonomous request
currently eligible, and if not, what exactly blocks it?" before anything
consequential is attempted.

The risk this card mitigates is _false confidence from stale validation_:
a dry-run that reports "ok" must never be usable as a reusable publication
ticket, and execution must always revalidate from scratch.

## Decision

### 1. Aggregate dry-run mode in the shared engine

`validateAutonomousDryRun(input)` shares the exact gate list with
`validateAutonomousRequest` (the two drivers iterate the same `GATES`
array, so they cannot drift). Differences:

- Fail-fast (`validateAutonomousRequest`) returns the FIRST violation —
  execution semantics, no "maybe accepted" state.
- Dry-run (`validateAutonomousDryRun`) evaluates every gate whose
  prerequisites are available and returns ALL violations in gate order.
  Gates whose prerequisite input is unavailable (invalid manifest,
  missing/malformed site policy, malformed derived facts) are skipped —
  the prerequisite failure itself is already reported as a violation, and
  a skipped gate can never turn a rejected request into an accepted one:
  ok is returned only when zero violations were found.

Consequences of sharing the gate list: a policy change cannot pass one path
and be rejected by the other (the ADR 0007 guarantee), while a caller can
see every blocking condition in one result instead of fixing violations one
at a time.

### 2. Tool surface

`wordpress_autonomous_validate` (packages/tool-schemas):

- risk `read` (readOnlyHint; never consequential, never destructive);
- requires `autonomous:execute` (enforced by the MCP boundary via
  `assertScopes` before the handler runs);
- input is the strict `AutonomousManifestSchema` (same contract as
  execution, so a manifest that validates is exactly a manifest execution
  would accept);
- no output template, no file params.

Handler flow (`McpService.#autonomousValidate`):

1. Call the plugin dry-run route `POST /v1/autonomous/validate`
   (read-only status/version/capability checks, ADR 0006 §2).
2. Parse the response against the strict `AutonomousValidateResponseSchema`
   contract in packages/contracts; a malformed/unknown-field response is
   an `upstream_error` (fail closed, never default-open).
3. Cross-check the plugin-computed policy fingerprint against the server's
   recomputation when the plugin supplies one; disagreement is an
   `upstream_error` because the two layers disagree on the effective
   policy.
4. Run `validateAutonomousDryRun` with server policy from config
   (`AUTONOMOUS_ENABLED`, `AUTONOMOUS_ALLOWED_PIPELINES`), site policy and
   derived facts from the plugin response, and the connection scopes from
   the ToolContext.
5. Return the structured engine result: `{ ok: true, fingerprint,
derivedFacts }` or `{ ok: false, violations: [...] }` with every
   blocking violation in gate order.

### 3. No authority minting; execution always revalidates

- The validate path performs no confirmation, no idempotency claim, no
  audit write, and no connection touch: it is read-only end to end.
- The result contains no token, ticket, or capability — only the current
  fingerprint and server-derived facts, which are exactly the inputs
  execution re-checks from scratch.
- Execution (AUTO-06/07) never consumes a validate result as authority:
  it re-runs the full gate pipeline at execution time with fresh derived
  facts and the client-supplied `expectedPolicyFingerprint`; a policy
  change between validate and execute fails `policy_fingerprint_mismatch`
  (validated by the validate-then-change regression tests).

### 4. Plugin error-code fidelity

The plugin rejects autonomous requests with structured WP_Error bodies
(`wpcp_<code>` + `data.code`). The WordPress client previously mapped
errors by HTTP status only (403 → capability_missing, 409 → edit_conflict),
which would mislabel autonomous rejections. `autonomousCodeFromBody()`
now prefers the ADR violation code carried in the response body, falling
back to status-based mapping for every other tool path (unchanged
behavior).

## Consequences

- Dry-run and execution share one gate list; the aggregate mode adds no
  acceptance path the fail-fast mode would reject.
- `AutonomousValidateResponseSchema` is the server↔plugin wire contract
  for the validate route; the plugin must return the raw site policy
  (or null) plus derived facts matching `AutonomousDerivedFactsSchema`.
- The plugin's own validate route may reject site-layer violations before
  the server engine runs; the client preserves those codes so the MCP
  error is accurate.
- Tests: `tests/unit/autonomous-dry-run.test.ts` covers aggregation,
  skip semantics, never-accepts-what-fail-fast-rejects equivalence,
  no-mutation purity, the no-token authority invariant, the
  validate-then-change regression, strict response-schema rejection, and
  the tool surface metadata.
