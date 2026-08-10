import { describe, expect, it } from "vitest";
import type { AutonomousManifest } from "@wp-chatgpt-publisher/contracts";
import {
  AutonomousAuditRecordSchema,
  autonomousRequestHash,
  blockReasons,
  buildAutonomousAuditRecord,
  isBlocked,
  type AutonomousAuditRecord,
} from "../../apps/mcp-server/src/autonomous/audit.js";
import {
  canonicalJson,
  type AutonomousViolation,
} from "../../apps/mcp-server/src/autonomous/validate.js";

const CONNECTION = { connectionId: "123e4567-e89b-12d3-a456-426614174000", clientId: "client-a" };
const FINGERPRINT = "a".repeat(64);
const CREATED_AT = "2026-08-10T12:00:00.000Z";

const SECRET_MARKERS = [
  "sk-live-abc123def456",
  "wpp_ak_9876543210",
  "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.secret",
  "x-wpcp-request-id: 11111111-2222-3333-4444-555555555555",
];

function manifest(overrides: Record<string, unknown> = {}): AutonomousManifest {
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
  } as AutonomousManifest;
}

function violation(
  code: AutonomousViolation["code"],
  message: string,
  detail?: Record<string, unknown>,
): AutonomousViolation {
  return { code, message, ...(detail ? { detail } : {}) };
}

function build(
  overrides: Partial<Parameters<typeof buildAutonomousAuditRecord>[0]> = {},
): AutonomousAuditRecord {
  return buildAutonomousAuditRecord({
    manifest: manifest(),
    connection: CONNECTION,
    policyFingerprint: FINGERPRINT,
    outcome: "succeeded",
    createdAt: CREATED_AT,
    ...overrides,
  });
}

describe("autonomous audit record builder", () => {
  it("captures every required field with stable allowlisted values", () => {
    const record = build();
    expect(record.schemaVersion).toBe(1);
    expect(record.requestId).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(record.connectionId).toBe(CONNECTION.connectionId);
    expect(record.clientId).toBe(CONNECTION.clientId);
    expect(record.pipelineId).toBe("trt-news");
    expect(record.pipelineVersion).toBe("1.2.0");
    expect(record.intent).toBe("create_draft");
    expect(record.outcome).toBe("succeeded");
    expect(record.policyFingerprint).toBe(FINGERPRINT);
    expect(record.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.createdAt).toBe(CREATED_AT);
    expect(record.violations).toEqual([]);
  });

  it("rejects unknown record fields (strict allowlist)", () => {
    const record = build() as unknown as Record<string, unknown>;
    record.manifestBody = "leak";
    record.attestations = { research: { sources: ["https://example.com"] } };
    record.token = "secret";
    expect(() => AutonomousAuditRecordSchema.parse(record)).toThrow();
  });

  it("rejects an invalid outcome enum", () => {
    expect(() => build({ outcome: "published" as never })).toThrow();
    expect(() => build({ outcome: "blocked" as never })).toThrow();
  });

  it("accepts every documented outcome", () => {
    for (const outcome of ["validated", "rejected", "succeeded", "failed"] as const) {
      expect(build({ outcome }).outcome).toBe(outcome);
    }
  });

  it("rejects an unknown violation code", () => {
    const record = build() as unknown as { violations: unknown[] };
    record.violations = [{ code: "not_a_real_code", layer: "server" }];
    expect(() => AutonomousAuditRecordSchema.parse(record)).toThrow();
  });
});

describe("audit redaction (no secrets, bodies, attestations, or headers)", () => {
  it("never serializes manifest body, title, attestation sources, or models", () => {
    const record = build({
      manifest: manifest({
        content: {
          postType: "post",
          title: "UNIQUE-TITLE-SECRET",
          body: "UNIQUE-BODY-SECRET with SK-LIVE-TOKEN-123",
          categories: [],
          tags: [],
        },
        attestations: {
          research: {
            performedAt: "2026-08-10T12:00:00.000Z",
            sourceCount: 1,
            sources: ["https://example.com?key=UNIQUE-SOURCE-SECRET"],
            model: "UNIQUE-MODEL-SECRET",
          },
          qa: {
            performedAt: "2026-08-10T12:05:00.000Z",
            passed: true,
            checks: ["UNIQUE-CHECK-SECRET"],
            model: "UNIQUE-QA-SECRET",
          },
        },
      }),
    });
    const json = JSON.stringify(record);
    for (const marker of [
      "UNIQUE-TITLE-SECRET",
      "UNIQUE-BODY-SECRET",
      "SK-LIVE-TOKEN-123",
      "UNIQUE-SOURCE-SECRET",
      "UNIQUE-MODEL-SECRET",
      "UNIQUE-CHECK-SECRET",
      "UNIQUE-QA-SECRET",
    ]) {
      expect(json).not.toContain(marker);
    }
  });

  it("never serializes token-like or header-like input anywhere in the manifest", () => {
    const record = build({
      manifest: manifest({
        content: {
          postType: "post",
          title: SECRET_MARKERS[0],
          body: `${SECRET_MARKERS[1]} ${SECRET_MARKERS[2]}`,
          categories: [],
          tags: [],
        },
        attestations: {
          research: {
            performedAt: "2026-08-10T12:00:00.000Z",
            sourceCount: 2,
            sources: [`https://example.com/${SECRET_MARKERS[0]}`],
            model: SECRET_MARKERS[3],
          },
          qa: {
            performedAt: "2026-08-10T12:05:00.000Z",
            passed: true,
            checks: [SECRET_MARKERS[2]],
          },
        },
      }),
    });
    const json = JSON.stringify(record);
    for (const marker of SECRET_MARKERS) {
      expect(json).not.toContain(marker);
    }
  });

  it("keeps only violation codes and layer — never messages or detail free text", () => {
    const record = build({
      outcome: "rejected",
      violations: [
        violation("pipeline_not_allowed", "the pipeline was rejected because of SECRET-MESSAGE-1", {
          pipelineId: "trt-news",
          layers: ["server"],
          secretDetail: "SECRET-MESSAGE-2",
        }),
        violation("autonomous_disabled", "disabled with SECRET-MESSAGE-3", {
          layer: "site",
          reason: "SECRET-MESSAGE-4",
        }),
      ],
    });
    expect(record.violations).toEqual([
      { code: "pipeline_not_allowed" },
      { code: "autonomous_disabled", layer: "site" },
    ]);
    const json = JSON.stringify(record);
    for (const marker of [
      "SECRET-MESSAGE-1",
      "SECRET-MESSAGE-2",
      "SECRET-MESSAGE-3",
      "SECRET-MESSAGE-4",
    ]) {
      expect(json).not.toContain(marker);
    }
  });

  it("does not store connection credentials — only the connection id and client id", () => {
    const record = build({
      manifest: manifest({
        content: {
          postType: "post",
          title: "x",
          body: "y",
          categories: [],
          tags: [],
        },
      }),
    });
    const json = JSON.stringify(record);
    expect(json).not.toContain("credential");
    expect(json).not.toContain("ciphertext");
    expect(json).not.toContain("token");
    expect(json).not.toContain("authorization");
  });

  it("does not persist the manifest at all — only its request hash", () => {
    const record = build();
    const json = JSON.stringify(record);
    expect(json).not.toContain('schemaVersion":1,"pipelineId'); // no embedded manifest
    expect(json).not.toContain("Body text");
    expect(json).not.toContain("attestations");
    expect(json).toContain("requestHash");
  });
});

describe("request hash (immutable binding)", () => {
  it("is deterministic for identical inputs", () => {
    const a = autonomousRequestHash(manifest(), CONNECTION, FINGERPRINT);
    const b = autonomousRequestHash(manifest(), CONNECTION, FINGERPRINT);
    expect(a).toBe(b);
  });

  it("is stable across manifest key order (canonical JSON)", () => {
    const original = manifest();
    const reordered = JSON.parse(canonicalJson(original)) as AutonomousManifest;
    const a = autonomousRequestHash(original, CONNECTION, FINGERPRINT);
    const b = autonomousRequestHash(reordered, CONNECTION, FINGERPRINT);
    expect(a).toBe(b);
  });

  it("changes when the manifest changes", () => {
    const a = autonomousRequestHash(manifest(), CONNECTION, FINGERPRINT);
    const b = autonomousRequestHash(
      manifest({
        content: {
          postType: "post",
          title: "Changed title",
          body: "Changed body",
          categories: [],
          tags: [],
        },
      }),
      CONNECTION,
      FINGERPRINT,
    );
    expect(a).not.toBe(b);
  });

  it("changes when the connection identity changes", () => {
    const a = autonomousRequestHash(manifest(), CONNECTION, FINGERPRINT);
    const b = autonomousRequestHash(
      manifest(),
      { connectionId: "223e4567-e89b-12d3-a456-426614174000", clientId: "client-b" },
      FINGERPRINT,
    );
    expect(a).not.toBe(b);
  });

  it("changes when the policy fingerprint changes", () => {
    const a = autonomousRequestHash(manifest(), CONNECTION, FINGERPRINT);
    const b = autonomousRequestHash(manifest(), CONNECTION, "b".repeat(64));
    expect(a).not.toBe(b);
  });

  it("records the same request hash the builder computed", () => {
    const record = build();
    expect(record.requestHash).toBe(autonomousRequestHash(manifest(), CONNECTION, FINGERPRINT));
  });
});

describe("provenance answers: why published or blocked", () => {
  it("succeeded records carry no violations and are not blocked", () => {
    const record = build({ outcome: "succeeded" });
    expect(record.violations).toEqual([]);
    expect(isBlocked(record)).toBe(false);
    expect(blockReasons(record)).toEqual([]);
  });

  it("validated dry-run records carry no violations and are not blocked", () => {
    const record = build({ outcome: "validated" });
    expect(isBlocked(record)).toBe(false);
    expect(blockReasons(record)).toEqual([]);
  });

  it("rejected records expose every block reason in order", () => {
    const record = build({
      outcome: "rejected",
      violations: [
        violation("pipeline_not_allowed", "not allowed"),
        violation("rate_cap_exceeded", "rate capped"),
      ],
    });
    expect(isBlocked(record)).toBe(true);
    expect(blockReasons(record)).toEqual(["pipeline_not_allowed", "rate_cap_exceeded"]);
  });

  it("failed execution records are blocked even with an empty violation list", () => {
    const record = build({ outcome: "failed" });
    expect(isBlocked(record)).toBe(true);
  });

  it("records keep policy/version references useful for forensics", () => {
    const record = build({ outcome: "rejected", violations: [violation("manifest_invalid", "x")] });
    expect(record.policyFingerprint).toBe(FINGERPRINT);
    expect(record.pipelineId).toBe("trt-news");
    expect(record.pipelineVersion).toBe("1.2.0");
    expect(record.requestId).toBe("123e4567-e89b-12d3-a456-426614174000");
    // The record is independently parseable — the stored evidence can be
    // re-validated by a later operator without the original request.
    expect(AutonomousAuditRecordSchema.safeParse(record).success).toBe(true);
  });

  it("builds a valid record for schedule_draft intents", () => {
    const record = build({
      manifest: manifest({
        intent: "schedule_draft",
        schedule: {
          publishAt: "2026-08-11T08:00:00.000Z",
          siteTimezone: "UTC",
        },
      }),
    });
    expect(record.intent).toBe("schedule_draft");
    expect(AutonomousAuditRecordSchema.safeParse(record).success).toBe(true);
  });
});
