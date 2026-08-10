import { describe, expect, it } from "vitest";
import {
  AutonomousManifestSchema,
  AutonomousValidateResponseSchema,
  type AutonomousPipelinePolicy,
} from "@wp-chatgpt-publisher/contracts";
import { TOOL_DEFINITIONS } from "@wp-chatgpt-publisher/tool-schemas";
import { AppError } from "../../apps/mcp-server/src/errors.js";
import { evaluateAutonomousDryRun } from "../../apps/mcp-server/src/autonomous/dry-run.js";
import {
  AUTONOMOUS_EXECUTE_SCOPE,
  validateAutonomousDryRun,
  validateAutonomousRequest,
  type AutonomousValidationInput,
  type AutonomousViolation,
} from "../../apps/mcp-server/src/autonomous/validate.js";

const SERVER_PIPELINE: AutonomousPipelinePolicy = {
  pipelineId: "trt-news",
  minPipelineVersion: "1.2.0",
  limits: {
    maxRequestsPerHour: 20,
    maxRequestsPerDay: 100,
    maxScheduledPerDay: 20,
  },
};

const SITE_PIPELINE: AutonomousPipelinePolicy = {
  pipelineId: "trt-news",
  minPipelineVersion: "1.1.0",
  limits: {
    maxRequestsPerHour: 20,
    maxRequestsPerDay: 100,
    maxScheduledPerDay: 20,
  },
};

function validManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    pipelineId: "trt-news",
    pipelineVersion: "1.2.0",
    requestId: "123e4567-e89b-12d3-a456-426614174000",
    intent: "create_draft",
    content: {
      postType: "post",
      title: "A test draft",
      body: "Body text",
      categories: [],
      tags: [],
    },
    attestations: {
      research: {
        performedAt: "2026-08-10T12:00:00.000Z",
        sourceCount: 3,
        sources: ["https://example.com/source"],
      },
      qa: {
        performedAt: "2026-08-10T12:05:00.000Z",
        passed: true,
        checks: ["grammar"],
      },
    },
    ...overrides,
  };
}

function validDerivedFacts(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contentStatus: "draft",
    version: "v1",
    postType: "post",
    author: null,
    featuredMediaId: null,
    seoSupport: { yoast: true },
    capability: true,
    rateCounts: { hour: 1, day: 5, scheduled: 0 },
    policyFingerprint: "unused-in-input",
    ...overrides,
  };
}

function baseInput(overrides: Partial<AutonomousValidationInput> = {}): AutonomousValidationInput {
  return {
    manifest: validManifest(),
    serverPolicy: { enabled: true, allowedPipelines: [SERVER_PIPELINE] },
    sitePolicy: {
      policy: {
        schemaVersion: 1,
        enabled: true,
        allowedPipelines: [SITE_PIPELINE],
      },
    },
    derivedFacts: validDerivedFacts(),
    scopes: ["site:read", AUTONOMOUS_EXECUTE_SCOPE],
    ...overrides,
  };
}

function codes(result: { ok: boolean; violations: AutonomousViolation[] }): string[] {
  return result.violations.map((violation) => violation.code);
}

function pluginResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    policy: {
      schemaVersion: 1,
      enabled: true,
      allowedPipelines: [SITE_PIPELINE],
    },
    derivedFacts: validDerivedFacts(),
    ...overrides,
  };
}

describe("validateAutonomousDryRun — returns every current blocking violation", () => {
  it("collects independent gate violations together instead of stopping at the first", () => {
    const result = validateAutonomousDryRun(
      baseInput({
        serverPolicy: { enabled: false, allowedPipelines: [SERVER_PIPELINE] },
        sitePolicy: { policy: null },
        scopes: ["site:read"],
        manifest: validManifest({ evil: true }),
      }),
    );
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual([
      "autonomous_disabled", // server kill switch
      "autonomous_disabled", // site policy missing
      "scope_missing",
      "manifest_invalid",
    ]);
  });

  it("reports every manifest issue in one manifest_invalid violation", () => {
    const result = validateAutonomousDryRun(
      baseInput({ manifest: validManifest({ evil: true, pipelineId: "BAD id" }) }),
    );
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(["manifest_invalid"]);
    const detail = result.violations[0]?.detail as { issues: { path: string }[] };
    expect(detail.issues.length).toBeGreaterThanOrEqual(2);
    expect(detail.issues.map((issue) => issue.path)).toContain("pipelineId");
  });

  it("collects scope and rate-cap violations that fail-fast would mask behind the first gate", () => {
    const result = validateAutonomousDryRun(
      baseInput({
        scopes: ["site:read"],
        derivedFacts: validDerivedFacts({ rateCounts: { hour: 20, day: 100, scheduled: 20 } }),
      }),
    );
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(["scope_missing", "rate_cap_exceeded"]);
    // Fail-fast only surfaces the first of the two.
    const fast = validateAutonomousRequest(
      baseInput({
        scopes: ["site:read"],
        derivedFacts: validDerivedFacts({ rateCounts: { hour: 20, day: 100, scheduled: 20 } }),
      }),
    );
    expect(codes(fast)).toEqual(["scope_missing"]);
  });

  it("skips gates whose prerequisite input is unavailable (invalid manifest)", () => {
    const result = validateAutonomousDryRun(
      baseInput({
        manifest: validManifest({ evil: true }),
        derivedFacts: validDerivedFacts({ capability: false }),
      }),
    );
    expect(result.ok).toBe(false);
    // manifest_invalid is reported; allowlist/version/rate gates are skipped
    // (no valid manifest to check), but the independent capability gate still
    // reports.
    expect(codes(result)).toEqual(["manifest_invalid", "capability_missing"]);
  });

  it("skips derived-fact-dependent gates when derived facts are malformed", () => {
    const result = validateAutonomousDryRun(
      baseInput({ derivedFacts: { ...validDerivedFacts(), rateCounts: { hour: "many" } } }),
    );
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(["derived_fact_mismatch"]);
  });
});

describe("validateAutonomousDryRun — never accepts what fail-fast rejects", () => {
  const rejections: [string, Partial<AutonomousValidationInput>][] = [
    [
      "server kill switch off",
      { serverPolicy: { enabled: false, allowedPipelines: [SERVER_PIPELINE] } },
    ],
    ["site policy absent", { sitePolicy: { policy: null } }],
    [
      "site policy disabled",
      {
        sitePolicy: {
          policy: { schemaVersion: 1, enabled: false, allowedPipelines: [SITE_PIPELINE] },
        },
      },
    ],
    ["scope missing", { scopes: ["site:read"] }],
    ["manifest invalid", { manifest: validManifest({ evil: true }) }],
    ["pipeline not allowed", { serverPolicy: { enabled: true, allowedPipelines: [] } }],
    ["version below minimum", { manifest: validManifest({ pipelineVersion: "1.1.9" }) }],
    [
      "derived facts malformed",
      { derivedFacts: { ...validDerivedFacts(), rateCounts: { hour: "many" } } },
    ],
    ["status published", { derivedFacts: validDerivedFacts({ contentStatus: "publish" }) }],
    ["capability missing", { derivedFacts: validDerivedFacts({ capability: false }) }],
    ["fingerprint changed", { expectedPolicyFingerprint: "0".repeat(64) }],
    [
      "rate cap exceeded",
      { derivedFacts: validDerivedFacts({ rateCounts: { hour: 20, day: 5, scheduled: 0 } }) },
    ],
  ];
  it.each(rejections)("rejects %s", (_label, overrides) => {
    const fast = validateAutonomousRequest(baseInput(overrides));
    const dry = validateAutonomousDryRun(baseInput(overrides));
    expect(fast.ok).toBe(false);
    expect(dry.ok).toBe(false);
  });

  it("returns ok with fingerprint and derived facts only when every gate passes", () => {
    const result = validateAutonomousDryRun(baseInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.violations).toEqual([]);
      expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(result.derivedFacts.rateCounts.hour).toBe(1);
    }
  });

  it("matches the fail-fast fingerprint and derived facts when eligible", () => {
    const dry = validateAutonomousDryRun(baseInput());
    const fast = validateAutonomousRequest(baseInput());
    expect(dry).toEqual(fast);
  });
});

describe("validateAutonomousDryRun — cannot mint reusable publication authority", () => {
  it("returns only ok/violations/fingerprint/derivedFacts — no token, no authority", () => {
    const result = validateAutonomousDryRun(baseInput());
    expect(result.ok).toBe(true);
    const keys = Object.keys(result).sort();
    expect(keys).toEqual(["derivedFacts", "fingerprint", "ok", "violations"]);
    expect(JSON.stringify(result)).not.toMatch(/token|confirmation|authority|secret/i);
  });

  it("does not mutate its inputs", () => {
    const input = baseInput();
    const manifestSnapshot = JSON.stringify(input.manifest);
    const policySnapshot = JSON.stringify(input.sitePolicy.policy);
    const factsSnapshot = JSON.stringify(input.derivedFacts);
    validateAutonomousDryRun(input);
    expect(JSON.stringify(input.manifest)).toBe(manifestSnapshot);
    expect(JSON.stringify(input.sitePolicy.policy)).toBe(policySnapshot);
    expect(JSON.stringify(input.derivedFacts)).toBe(factsSnapshot);
  });
});

describe("validateAutonomousDryRun — validate-then-change regression", () => {
  it("a policy change between validate and execute fails policy_fingerprint_mismatch", () => {
    const first = validateAutonomousDryRun(baseInput());
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("baseline must pass");
    // The site policy changes after the dry run (limits change the
    // fingerprint but trip no earlier gate, so the fingerprint gate is what
    // rejects).
    const changed = baseInput({
      sitePolicy: {
        policy: {
          schemaVersion: 1,
          enabled: true,
          allowedPipelines: [
            {
              ...SITE_PIPELINE,
              limits: { maxRequestsPerHour: 5, maxRequestsPerDay: 10, maxScheduledPerDay: 2 },
            },
          ],
        },
      },
    });
    // Execute-style validation with the stale fingerprint must fail closed.
    const execution = validateAutonomousRequest({
      ...changed,
      expectedPolicyFingerprint: first.fingerprint,
    });
    expect(execution.ok).toBe(false);
    expect(codes(execution)).toEqual(["policy_fingerprint_mismatch"]);
  });
});

describe("evaluateAutonomousDryRun — plugin response orchestration", () => {
  it("returns the aggregate engine result for a valid plugin response", () => {
    const result = evaluateAutonomousDryRun({
      manifest: validManifest(),
      serverPolicy: { enabled: true, allowedPipelines: [SERVER_PIPELINE] },
      pluginResponse: pluginResponse(),
      scopes: ["site:read", AUTONOMOUS_EXECUTE_SCOPE],
    });
    expect(result.ok).toBe(true);
  });

  it("fails closed when the plugin response is malformed or has unknown fields", () => {
    for (const bad of [
      { policy: null },
      { policy: null, derivedFacts: validDerivedFacts(), extra: true },
      { policy: null, derivedFacts: { ...validDerivedFacts(), rateCounts: { hour: "many" } } },
    ]) {
      expect(() =>
        evaluateAutonomousDryRun({
          manifest: validManifest(),
          serverPolicy: { enabled: true, allowedPipelines: [SERVER_PIPELINE] },
          pluginResponse: bad,
          scopes: [AUTONOMOUS_EXECUTE_SCOPE],
        }),
      ).toThrow(AppError);
    }
  });

  it("fails closed when the plugin policy fingerprint disagrees with the server recomputation", () => {
    expect(() =>
      evaluateAutonomousDryRun({
        manifest: validManifest(),
        serverPolicy: { enabled: true, allowedPipelines: [SERVER_PIPELINE] },
        pluginResponse: pluginResponse({ policyFingerprint: "0".repeat(64) }),
        scopes: [AUTONOMOUS_EXECUTE_SCOPE],
      }),
    ).toThrow(AppError);
  });

  it("propagates site-policy violations as structured violations, not errors", () => {
    const result = evaluateAutonomousDryRun({
      manifest: validManifest(),
      serverPolicy: { enabled: true, allowedPipelines: [SERVER_PIPELINE] },
      pluginResponse: pluginResponse({ policy: null }),
      scopes: ["site:read", AUTONOMOUS_EXECUTE_SCOPE],
    });
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(["autonomous_disabled"]);
  });
});

describe("AutonomousValidateResponseSchema — strict contract", () => {
  it("accepts the documented shape", () => {
    expect(AutonomousValidateResponseSchema.safeParse(pluginResponse()).success).toBe(true);
  });
  it("accepts a null policy (disabled) with valid derived facts", () => {
    expect(
      AutonomousValidateResponseSchema.safeParse({
        policy: null,
        derivedFacts: validDerivedFacts(),
      }).success,
    ).toBe(true);
  });
  it.each([
    ["unknown top-level field", { ...pluginResponse(), surprise: 1 }],
    ["missing derivedFacts", { policy: null }],
    [
      "unknown derived-facts field",
      { ...pluginResponse(), derivedFacts: { ...validDerivedFacts(), extra: true } },
    ],
  ])("rejects %s", (_label, response) => {
    expect(AutonomousValidateResponseSchema.safeParse(response).success).toBe(false);
  });
});

describe("wordpress_autonomous_validate tool surface", () => {
  const tool = TOOL_DEFINITIONS.find(
    (definition) => definition.name === "wordpress_autonomous_validate",
  );
  it("is registered as a read tool requiring autonomous:execute", () => {
    expect(tool).toBeDefined();
    expect(tool?.risk).toBe("read");
    expect(tool?.requiredScopes).toEqual([AUTONOMOUS_EXECUTE_SCOPE]);
    expect(tool?.outputTemplate).toBeUndefined();
  });
  it("accepts the strict autonomous manifest schema", () => {
    expect(tool?.inputSchema.safeParse(validManifest()).success).toBe(true);
    expect(tool?.inputSchema.safeParse(validManifest({ evil: true })).success).toBe(false);
  });
  it("keeps the strict manifest schema in sync with the contracts package", () => {
    const manifest = AutonomousManifestSchema.safeParse(validManifest());
    expect(manifest.success).toBe(true);
    expect(tool?.inputSchema).toBe(AutonomousManifestSchema);
  });
});
