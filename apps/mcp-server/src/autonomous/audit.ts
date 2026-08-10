import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { AutonomousManifest } from "@wp-chatgpt-publisher/contracts";
import {
  canonicalJson,
  type AutonomousViolation,
  type AutonomousViolationCode,
} from "./validate.js";

/**
 * Server-side autonomous audit log and provenance (AUTO-09 / ADR 0006 §6).
 *
 * Records safe structured attempt/success/block evidence WITHOUT secrets:
 *   - the record schema is a strict allowlist — unknown fields are rejected;
 *   - manifest bodies, attestation free text, tokens, and headers NEVER enter
 *     a record; the manifest is represented only by its immutable
 *     `requestHash`;
 *   - violations carry only their allowlisted code and, when the gate knows
 *     it, the layer that rejected the request ("server" | "site") — never the
 *     violation message or detail free text;
 *   - the outcome enum (`validated` | `rejected` | `succeeded` | `failed`)
 *     plus the violation codes answer "why published or blocked".
 *
 * The builder is a pure function of its inputs (no I/O, no clocks except an
 * injectable timestamp for tests). Persistence is a repository
 * responsibility; a failed audit write must fail the surrounding
 * consequential operation closed (ADR 0006 §9.12 — security_rejection) —
 * callers observe persistence failure as a thrown error from the repository.
 */

export const AUTONOMOUS_AUDIT_SCHEMA_VERSION = 1;

export const AUTONOMOUS_AUDIT_OUTCOMES = ["validated", "rejected", "succeeded", "failed"] as const;
export type AutonomousAuditOutcome = (typeof AUTONOMOUS_AUDIT_OUTCOMES)[number];

/** Audit layers known to the autonomous gate. */
const AUDIT_LAYERS = ["server", "site"] as const;

/** Structured, allowlisted violation reference — code + layer only. */
export const AutonomousAuditViolationSchema = z
  .object({
    code: z.enum([
      "autonomous_disabled",
      "pipeline_not_allowed",
      "pipeline_version_mismatch",
      "manifest_invalid",
      "derived_fact_mismatch",
      "capability_missing",
      "policy_fingerprint_mismatch",
      "rate_cap_exceeded",
      "scope_missing",
    ]),
    layer: z.enum(AUDIT_LAYERS).optional(),
  })
  .strict();
export type AutonomousAuditViolation = z.infer<typeof AutonomousAuditViolationSchema>;

/**
 * Strict allowlisted audit record. Every field is non-free-text and
 * sanitized at construction; `.strict()` rejects any unknown key so a
 * future caller cannot accidentally persist a manifest body or token.
 */
export const AutonomousAuditRecordSchema = z
  .object({
    schemaVersion: z.literal(AUTONOMOUS_AUDIT_SCHEMA_VERSION),
    id: z.string().uuid(),
    requestId: z.string().uuid(),
    connectionId: z.string().uuid(),
    clientId: z.string().min(1).max(200),
    pipelineId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-z0-9][a-z0-9._-]*$/),
    pipelineVersion: z.string().min(1).max(64),
    intent: z.enum(["create_draft", "schedule_draft"]),
    outcome: z.enum(AUTONOMOUS_AUDIT_OUTCOMES),
    violations: z.array(AutonomousAuditViolationSchema).default([]),
    policyFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    requestHash: z.string().regex(/^[0-9a-f]{64}$/),
    createdAt: z.string().datetime(),
  })
  .strict();
export type AutonomousAuditRecord = z.infer<typeof AutonomousAuditRecordSchema>;

/** Identity reference for the audit record (never the credential). */
export interface AutonomousAuditConnection {
  connectionId: string;
  clientId: string;
}

/**
 * Immutable request hash: SHA-256 of the canonical serialization of
 * (manifest, connection reference, policy fingerprint). The manifest is
 * consumed here and nowhere else in the audit path, so the hash binds the
 * record to the exact validated content without storing the content. Any
 * change to manifest, connection, or policy fingerprint changes the hash.
 */
export function autonomousRequestHash(
  manifest: AutonomousManifest,
  connection: AutonomousAuditConnection,
  policyFingerprint: string,
): string {
  const canonical = canonicalJson({
    manifest,
    connection: {
      connectionId: connection.connectionId,
      clientId: connection.clientId,
    },
    policyFingerprint,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Normalize gate violations to the allowlisted audit shape. */
function toAuditViolations(violations: readonly AutonomousViolation[]): AutonomousAuditViolation[] {
  return violations.map((violation) => {
    const layer =
      violation.detail && typeof violation.detail === "object"
        ? (violation.detail as { layer?: unknown }).layer
        : undefined;
    const normalized: AutonomousAuditViolation = { code: violation.code };
    if (layer === "server" || layer === "site") normalized.layer = layer;
    return normalized;
  });
}

export interface BuildAutonomousAuditRecordInput {
  /** The validated manifest claim. Used only for request-hash derivation. */
  manifest: AutonomousManifest;
  connection: AutonomousAuditConnection;
  /** SHA-256 fingerprint of the effective site policy at validation time. */
  policyFingerprint: string;
  outcome: AutonomousAuditOutcome;
  /** Gate violations (rejected/failed outcomes). Messages are never kept. */
  violations?: readonly AutonomousViolation[];
  /** Defaults to a fresh UUID; inject for deterministic tests. */
  id?: string;
  /** Defaults to the current time; inject for deterministic tests. */
  createdAt?: string;
}

/**
 * Build a safe, strict-validated audit record. Throws on any input that
 * would violate the allowlist (e.g. an outcome outside the enum) — the
 * audit path never silently downgrades evidence.
 */
export function buildAutonomousAuditRecord(
  input: BuildAutonomousAuditRecordInput,
): AutonomousAuditRecord {
  const record: AutonomousAuditRecord = {
    schemaVersion: AUTONOMOUS_AUDIT_SCHEMA_VERSION,
    id: input.id ?? randomUUID(),
    requestId: input.manifest.requestId,
    connectionId: input.connection.connectionId,
    clientId: input.connection.clientId,
    pipelineId: input.manifest.pipelineId,
    pipelineVersion: input.manifest.pipelineVersion,
    intent: input.manifest.intent,
    outcome: input.outcome,
    violations: toAuditViolations(input.violations ?? []),
    policyFingerprint: input.policyFingerprint,
    requestHash: autonomousRequestHash(input.manifest, input.connection, input.policyFingerprint),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  return AutonomousAuditRecordSchema.parse(record);
}

/** Outcome helper: a record whose violations are non-empty is a block. */
export function isBlocked(record: AutonomousAuditRecord): boolean {
  return record.outcome === "rejected" || record.outcome === "failed";
}

/** Structured codes answering "why published or blocked". */
export function blockReasons(record: AutonomousAuditRecord): AutonomousViolationCode[] {
  return record.violations.map((violation) => violation.code);
}
