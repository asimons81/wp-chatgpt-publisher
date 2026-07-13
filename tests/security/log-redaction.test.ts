import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("structured request log redaction", () => {
  it("never emits OAuth or query-string secrets through the real HTTP logger", async () => {
    const result = await execFileAsync(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/log-redaction-probe.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, LOG_LEVEL: "info" },
      },
    );

    expect(result.stdout).toContain("WPCP_LOG_REDACTION_OK");
    expect(result.stdout).toContain('"path":"/healthz"');
    expect(result.stdout).toContain('"path":"/log-redaction-redirect"');
    for (const secret of [
      "oauth-code-secret",
      "grant-secret",
      "jwt-secret",
      "ordinary=value",
      "response-code-secret",
      "response-grant-secret",
      "response-jwt-secret",
    ])
      expect(result.stdout).not.toContain(secret);
  });
});
