import { describe, expect, it } from "vitest";
import {
  AutonomousManifestSchema,
  AutonomousPipelinePolicySchema,
  AutonomousPolicySchema,
  BASE_SCOPES,
  SCOPES,
  SCOPE_PROFILES,
  type AutonomousPipelinePolicy,
  type AutonomousPolicy,
} from "@wp-chatgpt-publisher/contracts";
import {
  AUTONOMOUS_EXECUTE_SCOPE,
  canonicalJson,
  isValidPipelineId,
  parseSitePolicy,
  policyFingerprint,
  validateAutonomousRequest,
  versionAtLeast,
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

function sitePolicy(policy: unknown): AutonomousPolicy | null {
  return parseSitePolicy(policy);
}

function validManifest(overrides: Record<string, unknown> = {}): {
  [key: string]: unknown;
  content: Record<string, unknown>;
  attestations: Record<string, unknown>;
} {
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

describe("autonomous scope policy", () => {
  it("adds autonomous:execute to SCOPES but to no profile", () => {
    expect(SCOPES).toContain(AUTONOMOUS_EXECUTE_SCOPE);
    for (const profile of Object.values(SCOPE_PROFILES)) {
      expect(profile).not.toContain(AUTONOMOUS_EXECUTE_SCOPE);
    }
  });
  it("keeps the legacy publisher profile at the original 14 scopes", () => {
    expect(SCOPE_PROFILES.publisher).toEqual([...BASE_SCOPES]);
    expect(SCOPE_PROFILES.publisher).toHaveLength(14);
  });
});

describe("AutonomousManifestSchema strictness", () => {
  it("accepts a valid create_draft manifest", () => {
    expect(AutonomousManifestSchema.safeParse(validManifest()).success).toBe(true);
  });
  it("accepts a valid schedule_draft manifest with a schedule", () => {
    const manifest = validManifest({
      intent: "schedule_draft",
      schedule: { publishAt: "2026-08-20T10:00:00+02:00", siteTimezone: "Europe/Berlin" },
    });
    expect(AutonomousManifestSchema.safeParse(manifest).success).toBe(true);
  });
  it.each([
    ["unknown top-level field", { surprise: 1 }],
    ["unknown content field", { content: { ...validManifest().content, extra: true } }],
    [
      "unknown attestation field",
      { attestations: { ...validManifest().attestations, extra: true } },
    ],
    ["future schemaVersion", { schemaVersion: 2 }],
    ["bad pipeline id", { pipelineId: "UPPER_case!" }],
    ["non-uuid requestId", { requestId: "not-a-uuid" }],
    ["unsupported intent", { intent: "publish_now" }],
    ["empty title", { content: { ...validManifest().content, title: "" } }],
    ["invalid slug", { content: { ...validManifest().content, slug: "Bad Slug!" } }],
  ])("rejects %s", (_label, overrides) => {
    const result = AutonomousManifestSchema.safeParse(validManifest(overrides));
    expect(result.success).toBe(false);
  });
  it("rejects schedule_draft without a schedule (refine)", () => {
    const manifest = validManifest({ intent: "schedule_draft" });
    const result = AutonomousManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "schedule")).toBe(true);
    }
  });
});

describe("AutonomousPolicySchema strictness", () => {
  it("defaults a bare policy to disabled with no pipelines", () => {
    const parsed = AutonomousPolicySchema.safeParse({ schemaVersion: 1 });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.enabled).toBe(false);
      expect(parsed.data.allowedPipelines).toEqual([]);
    }
  });
  it.each([
    ["unknown field", { schemaVersion: 1, enabled: true, extra: true }],
    [
      "unknown pipeline field",
      { schemaVersion: 1, enabled: true, allowedPipelines: [{ ...SERVER_PIPELINE, extra: true }] },
    ],
    ["future schemaVersion", { schemaVersion: 99, enabled: true }],
    [
      "invalid pipeline id",
      {
        schemaVersion: 1,
        enabled: true,
        allowedPipelines: [{ ...SERVER_PIPELINE, pipelineId: "BAD!" }],
      },
    ],
    [
      "invalid limits",
      {
        schemaVersion: 1,
        enabled: true,
        allowedPipelines: [{ ...SERVER_PIPELINE, limits: { maxRequestsPerHour: 0 } }],
      },
    ],
  ])("rejects %s", (_label, policy) => {
    expect(AutonomousPolicySchema.safeParse(policy).success).toBe(false);
  });
  it("parses an allowed pipeline descriptor with defaults materialized", () => {
    const parsed = AutonomousPipelinePolicySchema.safeParse({
      pipelineId: "trt-news",
      minPipelineVersion: "1.0.0",
      limits: {},
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limits.maxRequestsPerHour).toBe(20);
      expect(parsed.data.limits.maxRequestsPerDay).toBe(100);
      expect(parsed.data.limits.maxScheduledPerDay).toBe(20);
    }
  });
});

describe("parseSitePolicy fail-closed", () => {
  it.each([
    ["absent option", null],
    ["empty string", ""],
    ["malformed JSON string", "{not json"],
    ["non-object", "hello"],
    ["object with unknown field", { schemaVersion: 1, enabled: true, unknown: true }],
    ["future schema version", { schemaVersion: 2, enabled: true }],
  ])("returns null (disabled) for %s", (_label, policy) => {
    expect(sitePolicy(policy)).toBeNull();
  });
  it("parses a valid enabled policy", () => {
    const parsed = sitePolicy({
      schemaVersion: 1,
      enabled: true,
      allowedPipelines: [SERVER_PIPELINE],
    });
    expect(parsed?.enabled).toBe(true);
    expect(parsed?.allowedPipelines).toHaveLength(1);
  });
});

describe("policyFingerprint determinism", () => {
  it("is stable across key order and whitespace", () => {
    const a = policyFingerprint({
      schemaVersion: 1,
      enabled: true,
      allowedPipelines: [SERVER_PIPELINE],
    });
    const b = policyFingerprint({
      allowedPipelines: [SERVER_PIPELINE],
      enabled: true,
      schemaVersion: 1,
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it("changes when the policy changes", () => {
    const base = policyFingerprint({
      schemaVersion: 1,
      enabled: true,
      allowedPipelines: [SERVER_PIPELINE],
    });
    const changed = policyFingerprint({
      schemaVersion: 1,
      enabled: true,
      allowedPipelines: [{ ...SERVER_PIPELINE, minPipelineVersion: "2.0.0" }],
    });
    expect(changed).not.toBe(base);
  });
  it("canonicalJson sorts keys recursively", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
});

describe("versionAtLeast", () => {
  it.each([
    ["1.2.0", "1.2.0", true],
    ["1.2.1", "1.2.0", true],
    ["2.0.0", "1.9.9", true],
    ["1.2.0", "1.2.1", false],
    ["1.2", "1.2.0", true],
    ["1.2.0", "1.2", true],
    ["1.2.0-beta", "1.2.0", false],
    ["1.2.0", "1.2.0-beta", true],
    ["1.2.0-rc1", "1.2.0-rc2", false],
    ["0.9.0", "1.0.0", false],
  ])("%s >= %s -> %s", (version, minimum, expected) => {
    expect(versionAtLeast(version, minimum)).toBe(expected);
  });
});

describe("isValidPipelineId", () => {
  it.each([
    ["trt-news", true],
    ["news.auto.v1", true],
    ["trt_news", true],
    ["UPPER", false],
    ["-leading", false],
    ["has space", false],
    ["", false],
  ])("%s -> %s", (value, expected) => {
    expect(isValidPipelineId(value)).toBe(expected);
  });
});

describe("validateAutonomousRequest — happy path", () => {
  it("returns ok with fingerprint and derived facts", () => {
    const result = validateAutonomousRequest(baseInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.violations).toEqual([]);
      expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(result.derivedFacts.rateCounts.hour).toBe(1);
    }
  });
  it("is deterministic: same input twice yields the same result", () => {
    expect(validateAutonomousRequest(baseInput())).toEqual(validateAutonomousRequest(baseInput()));
  });
});

describe("validateAutonomousRequest — gate table (allow/deny)", () => {
  it.each([
    [
      "server kill switch off",
      { serverPolicy: { enabled: false, allowedPipelines: [SERVER_PIPELINE] } },
      ["autonomous_disabled"],
    ],
    ["site policy absent", { sitePolicy: { policy: null } }, ["autonomous_disabled"]],
    [
      "site policy malformed JSON string",
      { sitePolicy: { policy: "{broken" } },
      ["autonomous_disabled"],
    ],
    [
      "site policy disabled",
      {
        sitePolicy: {
          policy: { schemaVersion: 1, enabled: false, allowedPipelines: [SITE_PIPELINE] },
        },
      },
      ["autonomous_disabled"],
    ],
    [
      "site policy unknown field",
      {
        sitePolicy: {
          policy: { schemaVersion: 1, enabled: true, allowedPipelines: [SITE_PIPELINE], nope: 1 },
        },
      },
      ["autonomous_disabled"],
    ],
    ["manifest unknown field", { manifest: validManifest({ evil: true }) }, ["manifest_invalid"]],
    [
      "manifest bad pipeline id",
      { manifest: validManifest({ pipelineId: "BAD id" }) },
      ["manifest_invalid"],
    ],
    [
      "schedule_draft missing schedule",
      { manifest: validManifest({ intent: "schedule_draft" }) },
      ["manifest_invalid"],
    ],
    ["missing autonomous scope", { scopes: ["site:read"] }, ["scope_missing"]],
    [
      "pipeline not on server allowlist",
      { serverPolicy: { enabled: true, allowedPipelines: [] } },
      ["pipeline_not_allowed"],
    ],
    [
      "pipeline not in site policy",
      { sitePolicy: { policy: { schemaVersion: 1, enabled: true, allowedPipelines: [] } } },
      ["pipeline_not_allowed"],
    ],
    [
      "pipeline on neither layer",
      {
        serverPolicy: { enabled: true, allowedPipelines: [] },
        sitePolicy: { policy: { schemaVersion: 1, enabled: true, allowedPipelines: [] } },
      },
      ["pipeline_not_allowed"],
    ],
    [
      "version below server minimum",
      { manifest: validManifest({ pipelineVersion: "1.1.9" }) },
      ["pipeline_version_mismatch"],
    ],
    [
      "version below site minimum",
      {
        manifest: validManifest({ pipelineVersion: "1.0.5" }),
        sitePolicy: {
          policy: {
            schemaVersion: 1,
            enabled: true,
            allowedPipelines: [{ ...SITE_PIPELINE, minPipelineVersion: "1.0.6" }],
          },
        },
      },
      ["pipeline_version_mismatch"],
    ],
    [
      "derived facts malformed",
      { derivedFacts: { ...validDerivedFacts(), rateCounts: { hour: "many" } } },
      ["derived_fact_mismatch"],
    ],
    [
      "derived status published contradicts draft creation",
      { derivedFacts: validDerivedFacts({ contentStatus: "publish" }) },
      ["derived_fact_mismatch"],
    ],
    [
      "author claim contradicts derived facts",
      {
        manifest: validManifest({ content: { ...validManifest().content, author: 7 } }),
        derivedFacts: validDerivedFacts({ author: 9 }),
      },
      ["derived_fact_mismatch"],
    ],
    [
      "featuredMediaId claim contradicts derived facts",
      {
        manifest: validManifest({ content: { ...validManifest().content, featuredMediaId: 3 } }),
        derivedFacts: validDerivedFacts({ featuredMediaId: 5 }),
      },
      ["derived_fact_mismatch"],
    ],
    [
      "postType claim contradicts derived facts",
      {
        manifest: validManifest({ content: { ...validManifest().content, postType: "page" } }),
        derivedFacts: validDerivedFacts({ postType: "post" }),
      },
      ["derived_fact_mismatch"],
    ],
    [
      "capability missing",
      { derivedFacts: validDerivedFacts({ capability: false }) },
      ["capability_missing"],
    ],
    [
      "policy fingerprint changed",
      { expectedPolicyFingerprint: "0".repeat(64) },
      ["policy_fingerprint_mismatch"],
    ],
    [
      "hour rate cap",
      { derivedFacts: validDerivedFacts({ rateCounts: { hour: 20, day: 5, scheduled: 0 } }) },
      ["rate_cap_exceeded"],
    ],
    [
      "day rate cap",
      { derivedFacts: validDerivedFacts({ rateCounts: { hour: 1, day: 100, scheduled: 0 } }) },
      ["rate_cap_exceeded"],
    ],
    [
      "scheduled rate cap",
      { derivedFacts: validDerivedFacts({ rateCounts: { hour: 1, day: 5, scheduled: 20 } }) },
      ["rate_cap_exceeded"],
    ],
  ])("%s -> %j", (_label, overrides, expected) => {
    const result = validateAutonomousRequest(baseInput(overrides));
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(expected);
  });

  it("accepts when the pipeline is allowed and versions meet both minima", () => {
    const result = validateAutonomousRequest(baseInput());
    expect(result.ok).toBe(true);
  });

  it("skips the scope gate when scopes are omitted (MCP boundary enforces it)", () => {
    const result = validateAutonomousRequest(baseInput({ scopes: undefined }));
    expect(result.ok).toBe(true);
  });

  it("accepts at-cap-but-not-over counts", () => {
    const result = validateAutonomousRequest(
      baseInput({
        derivedFacts: validDerivedFacts({ rateCounts: { hour: 19, day: 99, scheduled: 19 } }),
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("does not evaluate later gates after an earlier gate fails (no mixed result)", () => {
    // Server disabled AND manifest invalid: only autonomous_disabled surfaces.
    const result = validateAutonomousRequest(
      baseInput({
        serverPolicy: { enabled: false, allowedPipelines: [SERVER_PIPELINE] },
        manifest: validManifest({ evil: true }),
      }),
    );
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(["autonomous_disabled"]);
  });

  it("matches expected fingerprint when policy is unchanged", () => {
    const first = validateAutonomousRequest(baseInput());
    if (!first.ok) throw new Error("baseline must pass");
    const second = validateAutonomousRequest(
      baseInput({ expectedPolicyFingerprint: first.fingerprint }),
    );
    expect(second.ok).toBe(true);
  });
});

describe("validateAutonomousRequest — no side effects", () => {
  it("does not mutate its inputs", () => {
    const input = baseInput();
    const manifestSnapshot = JSON.stringify(input.manifest);
    const policySnapshot = JSON.stringify(input.sitePolicy.policy);
    const factsSnapshot = JSON.stringify(input.derivedFacts);
    validateAutonomousRequest(input);
    expect(JSON.stringify(input.manifest)).toBe(manifestSnapshot);
    expect(JSON.stringify(input.sitePolicy.policy)).toBe(policySnapshot);
    expect(JSON.stringify(input.derivedFacts)).toBe(factsSnapshot);
  });
});
