import { AutonomousValidateResponseSchema, type Scope } from "@wp-chatgpt-publisher/contracts";
import { AppError } from "../errors.js";
import {
  parseSitePolicy,
  policyFingerprint,
  validateAutonomousDryRun,
  type AutonomousServerPolicyInput,
  type AutonomousValidationResult,
} from "./validate.js";

/**
 * Server-side dry-run orchestration (AUTO-10 / ADR 0008).
 *
 * Turns the plugin's POST /v1/autonomous/validate response into the engine's
 * aggregate validation result. This module is pure: it performs no I/O, no
 * repository writes, and mints no authority — it parses the plugin response
 * strictly, cross-checks the policy fingerprint, and delegates every policy
 * decision to the shared engine (`validateAutonomousDryRun`), which reports
 * every current blocking violation in gate order.
 *
 * Fail-closed behavior:
 *  - a response that does not match `AutonomousValidateResponseSchema`
 *    (missing/unknown fields, malformed derived facts) is an upstream_error;
 *  - a policy fingerprint supplied by the plugin that disagrees with the
 *    server's recomputation is an upstream_error — the two layers must agree
 *    on the effective policy, and the server never trusts a plugin-computed
 *    digest it cannot reproduce;
 *  - a missing/malformed policy maps to autonomous_disabled via the engine,
 *    never to a default-open state.
 */
export function evaluateAutonomousDryRun(input: {
  /** The client manifest (claim). Validated strictly; claims never authorize. */
  manifest: unknown;
  /** Server operational config (ADR 0006 §3). */
  serverPolicy: AutonomousServerPolicyInput;
  /** Raw plugin validate-route response body. */
  pluginResponse: unknown;
  /** Scopes granted to the MCP actor/connection (ToolContext). */
  scopes?: readonly Scope[];
}): AutonomousValidationResult {
  const parsed = AutonomousValidateResponseSchema.safeParse(input.pluginResponse);
  if (!parsed.success) {
    throw new AppError(
      "upstream_error",
      "WordPress returned an invalid autonomous validation response.",
      502,
      "Update the WordPress plugin and try again.",
    );
  }

  // The server is the single authority on the policy: recompute the
  // fingerprint from the raw policy and fail closed when the plugin's
  // digest disagrees (a compromised or diverged plugin must never define
  // the effective policy).
  const sitePolicy = parseSitePolicy(parsed.data.policy);
  if (parsed.data.policyFingerprint !== undefined && sitePolicy) {
    const serverFingerprint = policyFingerprint(sitePolicy);
    if (serverFingerprint !== parsed.data.policyFingerprint) {
      throw new AppError(
        "upstream_error",
        "WordPress policy fingerprint disagrees with the server validator.",
        502,
        "Reconcile the site policy between the server and the plugin, then retry.",
      );
    }
  }

  return validateAutonomousDryRun({
    manifest: input.manifest,
    serverPolicy: input.serverPolicy,
    sitePolicy: { policy: parsed.data.policy },
    derivedFacts: parsed.data.derivedFacts,
    ...(input.scopes ? { scopes: input.scopes } : {}),
  });
}
