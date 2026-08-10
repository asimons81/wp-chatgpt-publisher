/* AUTO-09 scratch verification: real Postgres round-trip of the audit store.
 * Uses a disposable local database (wpcp_auto09_scratch), never production.
 * Run from the repo root: npx tsx scripts/scratch/auto09-audit-roundtrip.mjs
 */
import { randomUUID } from "node:crypto";
import { PostgresRepository } from "../../apps/mcp-server/src/storage/postgres.js";
import { buildAutonomousAuditRecord } from "../../apps/mcp-server/src/autonomous/audit.js";
import { AutonomousManifestSchema } from "@wp-chatgpt-publisher/contracts";

const CONNECTION_ID = randomUUID();
const CLIENT_ID = "scratch-client";
const FINGERPRINT = "a".repeat(64);

const manifest = AutonomousManifestSchema.parse({
  schemaVersion: 1,
  pipelineId: "trt-news",
  pipelineVersion: "1.2.0",
  requestId: randomUUID(),
  intent: "create_draft",
  content: {
    postType: "post",
    title: "Scratch audit draft",
    body: "scratch body",
    categories: [],
    tags: [],
  },
  attestations: {
    research: {
      performedAt: "2026-08-10T12:00:00.000Z",
      sourceCount: 1,
      sources: ["https://example.com/source"],
    },
    qa: { performedAt: "2026-08-10T12:05:00.000Z", passed: true, checks: [] },
  },
});

const repo = new PostgresRepository(
  "postgresql://wpcp_auto09:scratch-only-local@127.0.0.1:5432/wpcp_auto09_scratch",
);

// Audit records reference real connections (FK, fail-closed): seed one.
// migrate() first so tables exist.
await repo.migrate();
await repo.saveConnection({
  id: CONNECTION_ID,
  siteUrl: "https://example.test",
  siteName: "Scratch Site",
  wordpressUserId: 1,
  wordpressUserName: "editor",
  scopes: ["audit:read", "autonomous:execute"],
  credentialCiphertext: "scratch-ciphertext",
  credentialKeyVersion: 1,
  createdAt: "2026-08-10T12:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
});

const succeeded = buildAutonomousAuditRecord({
  manifest,
  connection: { connectionId: CONNECTION_ID, clientId: CLIENT_ID },
  policyFingerprint: FINGERPRINT,
  outcome: "succeeded",
  createdAt: "2026-08-10T12:10:00.000Z",
});

const blocked = buildAutonomousAuditRecord({
  manifest: { ...manifest, requestId: randomUUID() },
  connection: { connectionId: CONNECTION_ID, clientId: CLIENT_ID },
  policyFingerprint: FINGERPRINT,
  outcome: "rejected",
  violations: [{ code: "rate_cap_exceeded" }],
  createdAt: "2026-08-10T12:11:00.000Z",
});

await repo.recordAutonomousAudit(succeeded);
await repo.recordAutonomousAudit(blocked);

const byConnection = await repo.listAutonomousAudits({ connectionId: CONNECTION_ID });
const byPipeline = await repo.listAutonomousAudits({ pipelineId: "trt-news" });
const byOutcome = await repo.listAutonomousAudits({ outcome: "rejected" });
const all = await repo.listAutonomousAudits();

const json = JSON.stringify(all);
const secrets = ["scratch body", "example.com/source"];
const leaked = secrets.filter((s) => json.includes(s));

console.log(
  JSON.stringify(
    {
      byConnection: byConnection.length,
      byPipeline: byPipeline.length,
      byOutcome: byOutcome.length,
      all: all.length,
      leaked,
      newestFirst: all[0]?.outcome === "rejected",
    },
    null,
    2,
  ),
);

await repo.ping();
console.log("ROUNDTRIP OK");
process.exit(0);
