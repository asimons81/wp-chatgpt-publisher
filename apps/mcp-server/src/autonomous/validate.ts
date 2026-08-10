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
 * violations; fail-fast evaluation stops at the first failing gate,
 * mirroring the fail-closed list in ADR 0006 §9):
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
 * Two drivers share the same gate list:
 *   - `validateAutonomousRequest` fails fast (first violation wins), the
 *     execution semantics: there is no "maybe accepted" state.
 *   - `validateAutonomousDryRun` (AUTO-10) evaluates every gate whose
 *     prerequisites are available and collects ALL violations, so a caller
 *     sees every current blocking condition in one result. Gates that need
 *     a value the request failed to provide (a valid manifest, a parsed
 *     site policy, server-derived facts) are skipped — their prerequisite
 *     failure is already reported as a violation, and a skipped gate can
 *     never turn a rejected request into an accepted one: dry-run returns
 *     ok only when zero violations were found.
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

/** Every violation code the engine can produce (fail-closed set). */
export const AUTONOMOUS_VIOLATION_CODES: ReadonlySet<string> = new Set<AutonomousViolationCode>([
  "autonomous_disabled",
  "pipeline_not_allowed",
  "pipeline_version_mismatch",
  "manifest_invalid",
  "derived_fact_mismatch",
  "capability_missing",
  "policy_fingerprint_mismatch",
  "rate_cap_exceeded",
  "scope_missing",
]);

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
 * Shared evaluation state. Parsed values are cached here by the gates that
 * produce them; gates that need a value the request failed to provide are
 * skipped (their prerequisite violation is already in the result).
 */
interface GateContext {
  sitePolicy: AutonomousPolicy | null;
  manifest: AutonomousManifest | null;
  derivedFacts: AutonomousDerivedFacts | null;
  serverDescriptor: AutonomousPipelinePolicy | null;
  siteDescriptor: AutonomousPipelinePolicy | null;
  fingerprint: string;
}

type Gate = (input: AutonomousValidationInput, context: GateContext) => AutonomousViolation | null;

function createContext(): GateContext {
  return {
    sitePolicy: null,
    manifest: null,
    derivedFacts: null,
    serverDescriptor: null,
    siteDescriptor: null,
    fingerprint: "",
  };
}

// --- Gates (order matters: this list IS the fail-closed order) -------------

const gateServerKillSwitch: Gate = (input) => {
  if (!input.serverPolicy.enabled) {
    return {
      code: "autonomous_disabled",
      message: "Autonomous publishing is disabled on the server.",
      detail: { layer: "server" },
    };
  }
  return null;
};

const gateSitePolicy: Gate = (input, context) => {
  const sitePolicy = parseSitePolicy(input.sitePolicy.policy);
  context.sitePolicy = sitePolicy;
  if (!sitePolicy) {
    return {
      code: "autonomous_disabled",
      message: "Autonomous publishing is disabled: site policy is missing or malformed.",
      detail: { layer: "site", reason: "missing_or_malformed" },
    };
  }
  if (!sitePolicy.enabled) {
    return {
      code: "autonomous_disabled",
      message: "Autonomous publishing is disabled by the site policy.",
      detail: { layer: "site", reason: "disabled" },
    };
  }
  return null;
};

const gateScope: Gate = (input) => {
  if (input.scopes && !input.scopes.includes(AUTONOMOUS_EXECUTE_SCOPE)) {
    return {
      code: "scope_missing",
      message: "The connection is not approved for autonomous execution.",
      detail: { missingScope: AUTONOMOUS_EXECUTE_SCOPE },
    };
  }
  return null;
};

const gateManifest: Gate = (input, context) => {
  const manifest = AutonomousManifestSchema.safeParse(input.manifest);
  if (!manifest.success) {
    return {
      code: "manifest_invalid",
      message: "The autonomous manifest is invalid.",
      detail: {
        issues: manifest.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }
  context.manifest = manifest.data;
  return null;
};

const gatePipelineAllowlist: Gate = (input, context) => {
  if (!context.manifest || !context.sitePolicy) return null;
  const serverDescriptor = input.serverPolicy.allowedPipelines.find(
    (descriptor) => descriptor.pipelineId === context.manifest!.pipelineId,
  );
  const siteDescriptor = context.sitePolicy.allowedPipelines.find(
    (descriptor) => descriptor.pipelineId === context.manifest!.pipelineId,
  );
  context.serverDescriptor = serverDescriptor ?? null;
  context.siteDescriptor = siteDescriptor ?? null;
  if (!serverDescriptor || !siteDescriptor) {
    const missingLayers: string[] = [];
    if (!serverDescriptor) missingLayers.push("server");
    if (!siteDescriptor) missingLayers.push("site");
    return {
      code: "pipeline_not_allowed",
      message: `The pipeline is not allowed at the ${missingLayers.join(" and ")} layer.`,
      detail: { pipelineId: context.manifest.pipelineId, layers: missingLayers },
    };
  }
  return null;
};

const gatePipelineVersion: Gate = (_input, context) => {
  if (!context.manifest || !context.serverDescriptor || !context.siteDescriptor) return null;
  const versionOk =
    versionAtLeast(context.manifest.pipelineVersion, context.serverDescriptor.minPipelineVersion) &&
    versionAtLeast(context.manifest.pipelineVersion, context.siteDescriptor.minPipelineVersion);
  if (!versionOk) {
    return {
      code: "pipeline_version_mismatch",
      message: "The pipeline version is below the configured minimum.",
      detail: {
        pipelineId: context.manifest.pipelineId,
        version: context.manifest.pipelineVersion,
        serverMinimum: context.serverDescriptor.minPipelineVersion,
        siteMinimum: context.siteDescriptor.minPipelineVersion,
      },
    };
  }
  return null;
};

const gateDerivedFacts: Gate = (input, context) => {
  const derived = AutonomousDerivedFactsSchema.safeParse(input.derivedFacts);
  if (!derived.success) {
    return {
      code: "derived_fact_mismatch",
      message: "Server-derived facts are malformed; refusing to proceed.",
      detail: {
        issues: derived.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }
  context.derivedFacts = derived.data;
  return null;
};

const gateStatusContradiction: Gate = (_input, context) => {
  if (!context.manifest || !context.derivedFacts) return null;
  if (context.derivedFacts.contentStatus === "publish") {
    return {
      code: "derived_fact_mismatch",
      message:
        "Cannot create or schedule a draft: the derived content status is already published.",
      detail: {
        intent: context.manifest.intent,
        contentStatus: context.derivedFacts.contentStatus,
      },
    };
  }
  return null;
};

const gateClaimsMatch: Gate = (_input, context) => {
  if (!context.manifest || !context.derivedFacts) return null;
  const authorMismatch =
    context.manifest.content.author !== undefined &&
    context.derivedFacts.author !== null &&
    context.manifest.content.author !== context.derivedFacts.author;
  const mediaMismatch =
    context.manifest.content.featuredMediaId !== undefined &&
    context.derivedFacts.featuredMediaId !== null &&
    context.manifest.content.featuredMediaId !== context.derivedFacts.featuredMediaId;
  const postTypeMismatch = context.manifest.content.postType !== context.derivedFacts.postType;
  if (authorMismatch || mediaMismatch || postTypeMismatch) {
    const conflicts: string[] = [];
    if (authorMismatch) conflicts.push("author");
    if (mediaMismatch) conflicts.push("featuredMediaId");
    if (postTypeMismatch) conflicts.push("postType");
    return {
      code: "derived_fact_mismatch",
      message: `Server facts contradict manifest claims: ${conflicts.join(", ")}.`,
      detail: {
        conflicts,
        claimedAuthor: context.manifest.content.author,
        derivedAuthor: context.derivedFacts.author,
        claimedMediaId: context.manifest.content.featuredMediaId,
        derivedMediaId: context.derivedFacts.featuredMediaId,
        claimedPostType: context.manifest.content.postType,
        derivedPostType: context.derivedFacts.postType,
      },
    };
  }
  return null;
};

const gateCapability: Gate = (_input, context) => {
  if (!context.derivedFacts) return null;
  if (!context.derivedFacts.capability) {
    return {
      code: "capability_missing",
      message: "The WordPress user lacks the capability for autonomous publishing.",
      detail: { capability: "publish_posts" },
    };
  }
  return null;
};

const gatePolicyFingerprint: Gate = (input, context) => {
  if (!context.sitePolicy) return null;
  context.fingerprint = policyFingerprint(context.sitePolicy);
  if (
    input.expectedPolicyFingerprint !== undefined &&
    input.expectedPolicyFingerprint !== context.fingerprint
  ) {
    return {
      code: "policy_fingerprint_mismatch",
      message: "The site policy changed since validation; validate again before executing.",
      detail: {
        expected: input.expectedPolicyFingerprint,
        current: context.fingerprint,
      },
    };
  }
  return null;
};

const gateRateCaps: Gate = (_input, context) => {
  if (!context.manifest || !context.serverDescriptor || !context.derivedFacts) return null;
  const limits = context.serverDescriptor.limits;
  const rateExceeded: string[] = [];
  if (context.derivedFacts.rateCounts.hour >= limits.maxRequestsPerHour) rateExceeded.push("hour");
  if (context.derivedFacts.rateCounts.day >= limits.maxRequestsPerDay) rateExceeded.push("day");
  if (context.derivedFacts.rateCounts.scheduled >= limits.maxScheduledPerDay)
    rateExceeded.push("scheduled");
  if (rateExceeded.length > 0) {
    return {
      code: "rate_cap_exceeded",
      message: `Rate cap exceeded: ${rateExceeded.join(", ")}.`,
      detail: {
        exceeded: rateExceeded,
        counts: context.derivedFacts.rateCounts,
        limits,
      },
    };
  }
  return null;
};

const GATES: readonly Gate[] = [
  gateServerKillSwitch,
  gateSitePolicy,
  gateScope,
  gateManifest,
  gatePipelineAllowlist,
  gatePipelineVersion,
  gateDerivedFacts,
  gateStatusContradiction,
  gateClaimsMatch,
  gateCapability,
  gatePolicyFingerprint,
  gateRateCaps,
];

/**
 * The central gate for execution. Returns the first blocking violation for
 * the input (later gates are not evaluated after an earlier rejection —
 * exactly the fail-closed list, no "maybe accepted" state exists).
 */
export function validateAutonomousRequest(
  input: AutonomousValidationInput,
): AutonomousValidationResult {
  const context = createContext();
  for (const gate of GATES) {
    const violation = gate(input, context);
    if (violation) return { ok: false, violations: [violation] };
  }
  return {
    ok: true,
    violations: [],
    fingerprint: context.fingerprint,
    derivedFacts: context.derivedFacts!,
  };
}

/**
 * Side-effect-free dry-run (AUTO-10). Evaluates every gate whose
 * prerequisites are available and returns ALL current blocking violations in
 * gate order. Gates whose prerequisite input is unavailable (invalid
 * manifest, missing/malformed site policy, malformed derived facts) are
 * skipped — the prerequisite failure itself is already a reported violation,
 * and skipping can never accept a request the fail-fast path rejects:
 * ok is returned only when zero violations were found.
 */
export function validateAutonomousDryRun(
  input: AutonomousValidationInput,
): AutonomousValidationResult {
  const context = createContext();
  const violations: AutonomousViolation[] = [];
  for (const gate of GATES) {
    const violation = gate(input, context);
    if (violation) violations.push(violation);
  }
  if (violations.length > 0) return { ok: false, violations };
  return {
    ok: true,
    violations: [],
    fingerprint: context.fingerprint,
    derivedFacts: context.derivedFacts!,
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
