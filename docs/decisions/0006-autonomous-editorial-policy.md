# ADR 0006: Autonomous editorial pipeline policy, identity binding, and manifest contract

Status: accepted — 2026-08-10.

## Context

AUTO-02 proved the existing human-confirmed consequential-action path
(`wordpress_request_confirmation` + `#verifyConfirmation`/`#consumeConfirmation`,
action/content/version/payload-bound single-use token) must remain
byte-for-byte semantically intact. AUTO-03 modeled the autonomous publishing
threat surface and fixed the trust path:

> Authenticated MCP actor/connection + dedicated autonomous scope +
> server/site policy + configured allowed pipeline + manifest attestations +
> server-derived current WordPress facts. **PipelineId alone is not identity.**

This record specifies the additive, disabled-by-default policy/config surface,
the manifest schema, identity binding, rate-limit/audit/atomicity semantics,
errors, and the four-layer test plan. It is a design contract only; runtime
behavior is implemented in later cards.

## Decision

Add a **dedicated autonomous scope**, two **narrow autonomous MCP tools**,
matching **plugin REST routes**, a **strict versioned manifest**, a
**two-layer policy** (server operational config + plugin site policy), and
**server-derived execution-time facts** that are never supplied by the client.
All autonomous behavior is **disabled by default** at both layers. The
existing confirmation path, scopes, tool definitions, and REST schemas are
**not modified**; every change below is additive and fail-closed.

## 1. Dedicated autonomous scope

Append exactly one scope to `SCOPES` in `packages/contracts/src/index.ts` and
to `WPCP_Scopes::ALL` in the plugin:

```ts
"autonomous:execute",
```

- The scope is **not** added to any `SCOPE_PROFILES` value and not to
  `WPCP_Scopes::READ_ONLY|EDITORIAL|PUBLISHER`. Existing profiles therefore
  grant it to nobody; a site operator must explicitly approve it at
  connection time.
- `WPCP_Scopes::capability_for_scope` gains a single arm:
  `'autonomous:execute' => 'publish_posts'` (baseline; the plugin still
  checks current native capabilities at execution).
- A stolen general publisher token is insufficient: it lacks
  `autonomous:execute`, so all autonomous tools fail `scope_missing`.
- `sanitize()` and `has()` semantics are unchanged; the new scope simply
  joins the allowlist.

## 2. MCP tools and plugin routes

Two new static tools in `packages/tool-schemas/src/index.ts`, registered in
`apps/mcp-server/src/mcp/server.ts`, mapped in
`apps/mcp-server/src/wordpress/client.ts`, and mirrored as strict plugin
routes in `class-wpcp-rest-schema.php` / `class-wpcp-rest-controller.php`:

| MCP tool                        | risk            | required scopes      | plugin route                   |
| ------------------------------- | --------------- | -------------------- | ------------------------------ |
| `wordpress_autonomous_validate` | `read`          | `autonomous:execute` | `POST /v1/autonomous/validate` |
| `wordpress_autonomous_execute`  | `consequential` | `autonomous:execute` | `POST /v1/autonomous/execute`  |

Semantics (narrow by design, per AUTO-03 confused-deputy finding):

- **validate** runs the full server-side validation pipeline and a WordPress
  dry-run (read-only status/version/capability checks) and returns derived
  facts. It **grants nothing** and persists no side effects.
- **execute** performs fresh validation under the consequential route,
  establishes audit/idempotency preconditions, atomically reserves, then
  creates a draft or schedules it for the future. V1 **never** publishes
  directly to a live state and exposes **no autonomous edit tool**:
  `intent` is limited to `create_draft` and `schedule_draft`.
- Both tools require `autonomous:execute`; neither may be reached through
  any existing publisher tool, and the existing publish/schedule tools do
  not accept autonomous manifests.

## 3. Disabled-by-default two-layer policy

### Server operational config (`apps/mcp-server/src/config.ts`, Zod env)

Additive env vars, all fail-closed when absent:

```ts
AUTONOMOUS_ENABLED: z.enum(["true", "false"]).default("false"),
AUTONOMOUS_ALLOWED_PIPELINES: z.string().default(""), // JSON array; empty = none allowed
AUTONOMOUS_RATE_WINDOW_HOURS: z.coerce.number().int().min(1).max(24).default(24),
```

- `AUTONOMOUS_ENABLED=false` (the default) → every autonomous call returns
  `autonomous_disabled` before any other check. This is the kill switch.
- `AUTONOMOUS_ALLOWED_PIPELINES` is a strict JSON array of allowed pipeline
  descriptors (same shape as `AutonomousPolicySchema.allowedPipelines`
  below). Malformed JSON or unknown fields → config fails closed at boot.

### Plugin site policy (WordPress option)

A single site option `wpcp_autonomous_policy` holds a strict JSON policy
written by a capability-gated admin screen (`manage_options`). Missing,
malformed, or unknown-field policies are treated as **disabled**:

```php
// Stored JSON, validated with the same strict schema as the server.
wpcp_autonomous_policy = {
  "schemaVersion": 1,
  "enabled": false,
  "allowedPipelines": []
}
```

- The site policy is read **at execution time** on every validate/execute
  (AUTO-03 stale-policy control); `enabled=false` is checked first on every
  call (kill switch).
- The **policy fingerprint** is `SHA-256` of the canonical JSON of the
  effective policy as read during validation, and is included in the audit
  record. If the fingerprint differs between validate and execute, execute
  fails `policy_fingerprint_mismatch` and requires a fresh validate.
- Both layers must permit the pipeline: server allowlist **and** site policy
  `enabled=true` **and** `allowedPipelines` containing the pipeline id.

## 4. Manifest schema and attestation boundary

The manifest is the client's claim. It is validated strictly (unknown fields
rejected, fail closed), but **its claims never authorize anything**. Add to
`packages/contracts/src/index.ts`:

```ts
export const AutonomousManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    pipelineId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-z0-9][a-z0-9._-]*$/),
    pipelineVersion: z.string().min(1).max(64),
    requestId: z.string().uuid(),
    intent: z.enum(["create_draft", "schedule_draft"]),
    content: z
      .object({
        postType: z
          .string()
          .regex(/^[a-z0-9_-]+$/)
          .default("post"),
        title: z.string().min(1).max(500),
        body: z.string().max(1_000_000),
        bodyFormat: ContentFormatSchema.default("markdown"),
        excerpt: z.string().max(10_000).optional(),
        slug: z
          .string()
          .max(200)
          .regex(/^[a-z0-9-]*$/)
          .optional(),
        author: z.number().int().positive().optional(),
        categories: z.array(z.number().int().positive()).max(100).default([]),
        tags: z.array(z.number().int().positive()).max(100).default([]),
        featuredMediaId: z.number().int().positive().optional(),
        seo: SeoMetadataSchema.optional(),
      })
      .strict(),
    schedule: z
      .object({
        publishAt: z.string().datetime({ offset: true }),
        siteTimezone: z.string().min(1).max(100),
      })
      .strict()
      .optional(),
    attestations: z
      .object({
        research: z
          .object({
            performedAt: z.string().datetime(),
            sourceCount: z.number().int().min(0).max(1000),
            sources: z.array(z.string().url()).max(100).default([]),
            model: z.string().max(200).optional(),
          })
          .strict(),
        qa: z
          .object({
            performedAt: z.string().datetime(),
            passed: z.boolean(),
            checks: z.array(z.string().max(100)).max(50).default([]),
            model: z.string().max(200).optional(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.intent === "schedule_draft" && !value.schedule) {
      ctx.addIssue({
        code: "custom",
        path: ["schedule"],
        message: "schedule_draft requires a schedule",
      });
    }
  });
```

**Attestations** (`research`, `qa`) are recorded in the audit trail and shown
to operators, but are **never** inputs to authorization. Server-verifiable
facts are independently derived:

```ts
export const AutonomousDerivedFactsSchema = z
  .object({
    contentStatus: ContentStatusSchema,
    version: z.string().min(1).max(200),
    postType: z.string(),
    author: z.number().int().positive().nullable(),
    featuredMediaId: z.number().int().positive().nullable(),
    seoSupport: z.record(z.string(), z.boolean()),
    capability: z.boolean(),
    rateCounts: z
      .object({
        hour: z.number().int().nonnegative(),
        day: z.number().int().nonnegative(),
        scheduled: z.number().int().nonnegative(),
      })
      .strict(),
    policyFingerprint: z.string(),
  })
  .strict();
```

Execution compares derived facts against manifest claims and fails closed on
any mismatch (stale version → `edit_conflict`; author/media/status mismatch →
`derived_fact_mismatch`; missing capability → `capability_missing`).

## 5. Identity binding

Per AUTO-03: **PipelineId alone is not identity.** Authorization is the
intersection of:

1. the authenticated MCP actor and connection (`ToolContext.subject`,
   `clientId`, `connectionId`, `audience`, request id from the signed token);
2. the stored connection's granted scopes, which must include
   `autonomous:execute`;
3. the plugin connection scope + current native capability checks
   (`WPCP_Auth`, `WPCP_Scopes::user_can_scopes`);
4. the server allowlist **and** site policy, which must name the
   `pipelineId` for **this connection**;
5. the manifest's `requestId` (used only for idempotency, never as identity).

The manifest `pipelineId`/`pipelineVersion` select a configured pipeline; a
client may not self-authorize by inventing an id. Policy descriptors bind to
`pipelineId` and a `minPipelineVersion`; versions below the minimum fail
`pipeline_version_mismatch`.

## 6. Rate limits, audit, and atomicity

### Rate limits (per pipeline, per connection)

`allowedPipelines[].limits` with strict caps; enforced server-side from
persisted counters and cross-checked plugin-side from the audit chain:

```ts
limits: z
  .object({
    maxRequestsPerHour: z.number().int().min(1).max(1000).default(20),
    maxRequestsPerDay: z.number().int().min(1).max(10000).default(100),
    maxScheduledPerDay: z.number().int().min(1).max(1000).default(20),
  })
  .strict(),
```

Exceeding any cap → `rate_cap_exceeded` (non-retryable). Counters count
**accepted** executions, and the `scheduled` counter tracks future-scheduled
posts to bound the agent loop (AUTO-03 loop control).

### Audit

Reuse the existing `WPCP_Audit` tamper-evident chain. New allowlisted audit
fields, all non-free-text: `pipeline_id`, `pipeline_version`, `request_hash`
(immutable `SHA-256` of canonical manifest + connection + policy
fingerprint), `policy_fingerprint`, `outcome` (`validated` | `rejected` |
`succeeded` | `failed`). Never record manifest bodies, attestation free text,
tokens, or headers. Failed validate/execute attempts are durable audit
records (AUTO-03 DB-failure control).

### Atomicity

Reuse the existing two-tier idempotency, extended to autonomous calls:

1. MCP server PostgreSQL claim/finish/release keyed by `requestId`
   (existing repository pattern).
2. Plugin `INSERT IGNORE` reservation keyed connection + `requestId`, with a
   `request_hash` conflict check and cached-response replay.
3. Reservation is established **before** any mutation; if reservation or
   audit preconditions cannot be established, the consequential operation
   **does not proceed**.
4. Concurrent attempts with the same `requestId` → `409` in-progress
   semantics; the deterministic outcome is persisted for recovery.

## 7. Errors

Add to `ToolErrorSchema.code` enum:

```ts
"autonomous_disabled",      // kill switch off at server or site policy
"pipeline_not_allowed",     // pipelineId not in server allowlist or site policy
"pipeline_version_mismatch",// below minPipelineVersion
"manifest_invalid",         // strict schema/refine failure or unknown field
"derived_fact_mismatch",    // server facts contradict manifest claims
"policy_fingerprint_mismatch", // policy changed between validate and execute
"rate_cap_exceeded",        // rolling hour/day or scheduled cap
```

All are fail-closed, safe `AppError` objects with `requestId`, `retryable:
false` (except transient upstream failures which remain `retryable: true`).

## 8. Backward compatibility

- Additive scope: existing connections and profiles are unaffected; nothing
  grants `autonomous:execute` implicitly.
- Additive tools/routes/schemas: existing tool definitions, REST routes, and
  `packages/contracts` schemas are untouched; existing
  `editorial-flow-live.test.ts` regression gates remain the same.
- Additive config: new env vars default to disabled; new plugin option is
  absent-or-disabled by default; a fresh install behaves exactly as before.
- The human confirmation path and schemas are **not relaxed or reused**;
  autonomous calls can never satisfy the manual confirmation contract, and
  manual calls can never carry autonomous manifests.
- Plugin activation/migration: `wpcp_autonomous_policy` defaults to disabled;
  existing audit tables gain nullable columns or a side table with a
  backward-compatible migration.

## 9. Explicit fail-closed cases

1. `AUTONOMOUS_ENABLED=false` or absent → `autonomous_disabled`, checked
   first on every validate/execute.
2. Connection lacks `autonomous:execute` → `scope_missing`.
3. Manifest fails strict schema / unknown field / future attestation
   timestamp → `manifest_invalid`.
4. `pipelineId` not allowed for this connection at server **or** site layer →
   `pipeline_not_allowed`.
5. `pipelineVersion` below configured minimum → `pipeline_version_mismatch`.
6. `intent` outside `["create_draft","schedule_draft"]` or missing
   `schedule` when required → `manifest_invalid` / `security_rejection`.
7. Site policy missing/malformed/unknown fields → treated as disabled →
   `autonomous_disabled`.
8. Policy fingerprint changes between validate and execute →
   `policy_fingerprint_mismatch`.
9. Stale `expectedVersion`/status at execution → `edit_conflict`.
10. Server-derived facts contradict manifest (author, media, status) →
    `derived_fact_mismatch`.
11. Rolling hour/day or scheduled cap exceeded → `rate_cap_exceeded`.
12. Audit or reservation preconditions unavailable → operation does not
    proceed → `security_rejection`.
13. Same `requestId` already in progress/complete → existing `409`
    idempotency semantics.

## 10. V1 exclusions (unchanged from AUTO-03)

- No direct publish-to-live; drafts and future schedules only.
- No autonomous edit tool for published content; no autonomous deletion,
  site administration, or permanent-destructive actions.
- No dynamic scopes, tools, or descriptions derived from manifest content.
- Manifest research/QA attestations are records, not authorization inputs.

## 11. Four-layer test plan

| Layer                  | Suite                                                      | Coverage                                                                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Contracts/policy    | `tests/unit` (Vitest)                                      | `AutonomousManifestSchema` strictness, unknown-field rejection, refine behavior, `AutonomousPolicySchema` defaults, fingerprint determinism, rate-window math, scope allowlist                                       |
| 2. Service integration | `tests/integration` (Vitest)                               | Config parsing fail-closed (`AUTONOMOUS_ENABLED`, malformed allowlist), tool registration + scope enforcement, `requestId` claim/finish, error mapping, server-side rate counters                                    |
| 3. WordPress plugin    | `tests/wordpress` (PHPUnit) + `php:cs`/`php:stan`          | REST schema strictness, `capability_for_scope`, site policy read fail-closed, kill-switch first check, atomic reservation, audit fields, migration                                                                   |
| 4. E2E + security      | `tests/e2e`, `tests/security` (Vitest, live fixture stack) | Validate→execute happy path over real MCP/OAuth, replay rejection, double-execute race, stale policy fingerprint, rate caps, published-state rejection, plus existing `editorial-flow-live.test.ts` regression gates |

Every layer's negative cases enumerate the fail-closed list in §9. Live
suites use the disposable Compose fixture stack only; nothing in this
contract touches production.

## Review notes

Design review was performed against AUTO-02 (existing confirmation
invariants preserved verbatim) and AUTO-03 (all threat controls mapped to
concrete schema/policy/error elements above). Remaining review surface for
the implementation card: exact DB schema for rate counters, migration
details, and admin UI policy editor.
