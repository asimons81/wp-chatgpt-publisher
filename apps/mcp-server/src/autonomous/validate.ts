import { createHash } from "node:crypto";
import {
  AUTONOMOUS_PIPELINE_ID_PATTERN,
  AutonomousDerivedFactsSchema,
  AutonomousManifestSchema,
  AutonomousPolicySchema,
  type AutonomousDerivedFacts,
  type AutonomousManifest,
  type AutonomousPipelinePolicy,
  type AutonomousPolicy,
  type Scope,
} from "@wp-chatgpt-publisher/contracts";

/**
 * Central deterministic autonomous validation engine (AUTO-05 / ADR 0006).
 *
 * This module is the single gate pipeline shared by dry-run validation and
 * execution. It is a pure function of its inputs:
 *   - no I/O, no clocks, no randomness, no side effects of any kind;
 *   - the same inputs always produce the same structured result;
 *   - malformed or unknown state fails closed (rejected, never accepted).
 *
 * Policy gates evaluated, in order (every gate returns structured
 * violations; evaluation stops at the first failing gate, mirroring the
 * fail-closed list in ADR 0006 §9):
 *
 *   1. server kill switch   (AUTONOMOUS_ENABLED=false  -> autonomous_disabled)
 *   2. site policy kill     (policy disabled/missing   -> autonomous_disabled)
 *   3. site policy shape    (malformed/unknown fields  -> autonomous_disabled)
 *   4. scope gate           (no autonomous:execute     -> scope_missing)
 *   5. manifest shape       (strict schema + refine    -> manifest_invalid)
 *   6. pipeline allowlist   (server or site            -> pipeline_not_allowed)
 *   7. pipeline version     (below minPipelineVersion  -> pipeline_version_mismatch)
 *   8. derived-fact checks  (status/author/media       -> derived_fact_mismatch)
 *   9. capability gate      (missing publish_posts     -> capability_missing)
 *  10. policy fingerprint   (changed between calls     -> policy_fingerprint_mismatch)
 *  11. rate caps            (hour/day/scheduled        -> rate_cap_exceeded)
 *
 * Validation is intentionally conservative: a malformed site policy is
 * treated as disabled (not ignored, not defaulted open), a malformed
 * manifest is rejected with its exact structural problems, and derived
 * facts that contradict the manifest are violations. Nothing in this module
 * mints authority — callers must still enforce idempotency, audit, and the
 * consequential-route checks (AUTO-06/07/09/10).
 */

export type AutonomousViolationCode =
  | "autonomous_disabled"
  | "pipeline_not_allowed"
  | "pipeline_version_mismatch"
  | "manifest_invalid"
  | "derived_fact_mismatch"
  | "capability_missing"
  | "policy_fingerprint_mismatch"
  | "rate_cap_exceeded"
  | "scope_missing";

export interface AutonomousViolation {
  code: AutonomousViolationCode;
  message: string;
  /** Optional structured detail, e.g. which layer rejected the pipeline. */
  detail?: unknown;
}

export interface AutonomousServerPolicyInput {
  enabled: boolean;
  allowedPipelines: readonly AutonomousPipelinePolicy[];
}

export interface AutonomousSitePolicyInput {
  /** Raw policy as read from WordPress, or null when the option is absent. */
  policy: unknown;
}

export interface AutonomousValidationInput {
  /** The client manifest (claim). Validated strictly; claims never authorize. */
  manifest: unknown;
  /** Server operational config (ADR 0006 §3). */
  serverPolicy: AutonomousServerPolicyInput;
  /** Plugin site policy read at call time (ADR 0006 §3). */
  sitePolicy: AutonomousSitePolicyInput;
  /** Server-derived current WordPress facts (never client-supplied). */
  derivedFacts: unknown;
  /**
   * Policy fingerprint captured during a prior validate call. Required for
   * execution; when provided and it differs from the current fingerprint,
   * the request fails policy_fingerprint_mismatch.
   */
  expectedPolicyFingerprint?: string;
  /**
   * Scopes granted to the MCP actor/connection (ToolContext + stored
   * connection). Must include autonomous:execute. When omitted, the scope
   * gate is skipped (the MCP boundary enforces it) — dry-run callers pass
   * scopes so the gate is reported in the same structured result.
   */
  scopes?: readonly Scope[];
}

export type AutonomousValidationResult =
  | { ok: true; violations: []; fingerprint: string; derivedFacts: AutonomousDerivedFacts }
  | { ok: false; violations: AutonomousViolation[] };

export const AUTONOMOUS_EXECUTE_SCOPE = "autonomous:execute" as const;

/**
 * Deterministic SHA-256 fingerprint of the effective site policy. The input
 * must already be schema-parsed so defaults are materialized; the digest is
 * computed over the canonical JSON serialization (sorted keys) so it is
 * stable across key orderings and whitespace.
 */
export function policyFingerprint(policy: AutonomousPolicy): string {
  return createHash("sha256").update(canonicalJson(policy)).digest("hex");
}

/** Stable JSON serialization: recursively sorted object keys, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Parse and validate the plugin site policy, fail closed.
 * Returns null when the option is absent; throws nothing. A malformed policy
 * maps to a disabled policy (autonomous_disabled), per ADR 0006 §9.7.
 */
export function parseSitePolicy(raw: unknown): AutonomousPolicy | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const parsed = AutonomousPolicySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * The central gate. Returns every structured violation for the input (the
 * first failing gate is authoritative and later gates are not evaluated,
 * exactly as execution would behave — no "maybe accepted" state exists).
 */
export function validateAutonomousRequest(
  input: AutonomousValidationInput,
): AutonomousValidationResult {
  // 1. Server kill switch — checked before anything else.
  if (!input.serverPolicy.enabled) {
    return {
      ok: false,
      violations: [
        {
          code: "autonomous_disabled",
          message: "Autonomous publishing is disabled on the server.",
          detail: { layer: "server" },
        },
      ],
    };
  }

  // 2+3. Site policy — missing, malformed, or unknown fields all fail closed.
  const sitePolicy = parseSitePolicy(input.sitePolicy.policy);
  if (!sitePolicy) {
    return {
      ok: false,
      violations: [
        {
          code: "autonomous_disabled",
          message: "Autonomous publishing is disabled: site policy is missing or malformed.",
          detail: { layer: "site", reason: "missing_or_malformed" },
        },
      ],
    };
  }
  if (!sitePolicy.enabled) {
    return {
      ok: false,
      violations: [
        {
          code: "autonomous_disabled",
          message: "Autonomous publishing is disabled by the site policy.",
          detail: { layer: "site", reason: "disabled" },
        },
      ],
    };
  }

  // 4. Scope gate — pipeline id is not identity; the authenticated actor and
  // connection must hold autonomous:execute (ADR 0006 §9.2). The MCP
  // boundary enforces this first; the validator repeats it so dry-run
  // reports the same structured result.
  if (input.scopes && !input.scopes.includes(AUTONOMOUS_EXECUTE_SCOPE)) {
    return {
      ok: false,
      violations: [
        {
          code: "scope_missing",
          message: "The connection is not approved for autonomous execution.",
          detail: { missingScope: AUTONOMOUS_EXECUTE_SCOPE },
        },
      ],
    };
  }

  // 5. Manifest — strict shape, unknown fields rejected, refine enforced.
  const manifest = AutonomousManifestSchema.safeParse(input.manifest);
  if (!manifest.success) {
    return {
      ok: false,
      violations: [
        {
          code: "manifest_invalid",
          message: "The autonomous manifest is invalid.",
          detail: {
            issues: manifest.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
      ],
    };
  }
  const manifestData: AutonomousManifest = manifest.data;

  // 6. Pipeline allowlist — both layers must permit the pipeline.
  const serverDescriptor = input.serverPolicy.allowedPipelines.find(
    (descriptor) => descriptor.pipelineId === manifestData.pipelineId,
  );
  const siteDescriptor = sitePolicy.allowedPipelines.find(
    (descriptor) => descriptor.pipelineId === manifestData.pipelineId,
  );
  if (!serverDescriptor || !siteDescriptor) {
    const missingLayers: string[] = [];
    if (!serverDescriptor) missingLayers.push("server");
    if (!siteDescriptor) missingLayers.push("site");
    return {
      ok: false,
      violations: [
        {
          code: "pipeline_not_allowed",
          message: `The pipeline is not allowed at the ${missingLayers.join(" and ")} layer.`,
          detail: { pipelineId: manifestData.pipelineId, layers: missingLayers },
        },
      ],
    };
  }

  // 7. Pipeline version — must satisfy the configured minimum at both layers.
  const versionOk =
    versionAtLeast(manifestData.pipelineVersion, serverDescriptor.minPipelineVersion) &&
    versionAtLeast(manifestData.pipelineVersion, siteDescriptor.minPipelineVersion);
  if (!versionOk) {
    return {
      ok: false,
      violations: [
        {
          code: "pipeline_version_mismatch",
          message: "The pipeline version is below the configured minimum.",
          detail: {
            pipelineId: manifestData.pipelineId,
            version: manifestData.pipelineVersion,
            serverMinimum: serverDescriptor.minPipelineVersion,
            siteMinimum: siteDescriptor.minPipelineVersion,
          },
        },
      ],
    };
  }

  // 8. Derived facts — server-derived current WordPress state. Malformed
  // facts fail closed (security_rejection is not a valid autonomous code, so
  // this surfaces as manifest_invalid-style rejection via capability/derived
  // checks below; parse failure itself is a hard violation).
  const derived = AutonomousDerivedFactsSchema.safeParse(input.derivedFacts);
  if (!derived.success) {
    return {
      ok: false,
      violations: [
        {
          code: "derived_fact_mismatch",
          message: "Server-derived facts are malformed; refusing to proceed.",
          detail: {
            issues: derived.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
      ],
    };
  }
  const derivedFacts = derived.data;

  // Manifest intent vs derived status. Both intents create NEW content, so a
  // derived status of publish contradicts the manifest claim that the target
  // does not yet exist as a live post (ADR 0006 §9.10).
  if (derivedFacts.contentStatus === "publish") {
    return {
      ok: false,
      violations: [
        {
          code: "derived_fact_mismatch",
          message:
            "Cannot create or schedule a draft: the derived content status is already published.",
          detail: { intent: manifestData.intent, contentStatus: derivedFacts.contentStatus },
        },
      ],
    };
  }

  // Author/media claims must match server facts exactly.
  const authorMismatch =
    manifestData.content.author !== undefined &&
    derivedFacts.author !== null &&
    manifestData.content.author !== derivedFacts.author;
  const mediaMismatch =
    manifestData.content.featuredMediaId !== undefined &&
    derivedFacts.featuredMediaId !== null &&
    manifestData.content.featuredMediaId !== derivedFacts.featuredMediaId;
  const postTypeMismatch = manifestData.content.postType !== derivedFacts.postType;
  if (authorMismatch || mediaMismatch || postTypeMismatch) {
    const conflicts: string[] = [];
    if (authorMismatch) conflicts.push("author");
    if (mediaMismatch) conflicts.push("featuredMediaId");
    if (postTypeMismatch) conflicts.push("postType");
    return {
      ok: false,
      violations: [
        {
          code: "derived_fact_mismatch",
          message: `Server facts contradict manifest claims: ${conflicts.join(", ")}.`,
          detail: {
            conflicts,
            claimedAuthor: manifestData.content.author,
            derivedAuthor: derivedFacts.author,
            claimedMediaId: manifestData.content.featuredMediaId,
            derivedMediaId: derivedFacts.featuredMediaId,
            claimedPostType: manifestData.content.postType,
            derivedPostType: derivedFacts.postType,
          },
        },
      ],
    };
  }

  // 9. Capability — the connection's WordPress user must currently hold the
  // native capability (plugin re-checks live capabilities independently).
  if (!derivedFacts.capability) {
    return {
      ok: false,
      violations: [
        {
          code: "capability_missing",
          message: "The WordPress user lacks the capability for autonomous publishing.",
          detail: { capability: "publish_posts" },
        },
      ],
    };
  }

  // 10. Policy fingerprint — execution must match the validated policy.
  const fingerprint = policyFingerprint(sitePolicy);
  if (
    input.expectedPolicyFingerprint !== undefined &&
    input.expectedPolicyFingerprint !== fingerprint
  ) {
    return {
      ok: false,
      violations: [
        {
          code: "policy_fingerprint_mismatch",
          message: "The site policy changed since validation; validate again before executing.",
          detail: {
            expected: input.expectedPolicyFingerprint,
            current: fingerprint,
          },
        },
      ],
    };
  }

  // 11. Rate caps — per-pipeline limits enforced from persisted counters.
  const limits = serverDescriptor.limits;
  const rateExceeded: string[] = [];
  if (derivedFacts.rateCounts.hour >= limits.maxRequestsPerHour) rateExceeded.push("hour");
  if (derivedFacts.rateCounts.day >= limits.maxRequestsPerDay) rateExceeded.push("day");
  if (derivedFacts.rateCounts.scheduled >= limits.maxScheduledPerDay)
    rateExceeded.push("scheduled");
  if (rateExceeded.length > 0) {
    return {
      ok: false,
      violations: [
        {
          code: "rate_cap_exceeded",
          message: `Rate cap exceeded: ${rateExceeded.join(", ")}.`,
          detail: {
            exceeded: rateExceeded,
            counts: derivedFacts.rateCounts,
            limits,
          },
        },
      ],
    };
  }

  return {
    ok: true,
    violations: [],
    fingerprint,
    derivedFacts,
  };
}

/**
 * Compare two dot-separated versions. Returns true when `version` is greater
 * than or equal to `minimum`.
 *
 * Segments are compared numerically when both are integers. A numeric
 * segment outranks a non-numeric one at the same position (release > pre-
 * release, matching semver precedence: 1.2.0 > 1.2.0-beta), so a pre-release
 * tag never satisfies a release minimum — the fail-closed direction. When
 * both segments are non-numeric they compare lexically ("rc2" > "rc1").
 */
export function versionAtLeast(version: string, minimum: string): boolean {
  const v = version.split(".");
  const m = minimum.split(".");
  const length = Math.max(v.length, m.length);
  for (let index = 0; index < length; index += 1) {
    const vPart = v[index] ?? "0";
    const mPart = m[index] ?? "0";
    const vNum = Number(vPart);
    const mNum = Number(mPart);
    const vIsNumeric = Number.isInteger(vNum) && /^\d+$/.test(vPart);
    const mIsNumeric = Number.isInteger(mNum) && /^\d+$/.test(mPart);
    if (vIsNumeric && mIsNumeric) {
      if (vNum !== mNum) return vNum > mNum;
    } else if (vIsNumeric !== mIsNumeric) {
      // Numeric outranks non-numeric at the same position.
      return vIsNumeric;
    } else {
      const comparison = vPart.localeCompare(mPart);
      if (comparison !== 0) return comparison > 0;
    }
  }
  return true;
}

/** True when the pipeline id matches the strict allowlist pattern. */
export function isValidPipelineId(value: string): boolean {
  return AUTONOMOUS_PIPELINE_ID_PATTERN.test(value);
}
