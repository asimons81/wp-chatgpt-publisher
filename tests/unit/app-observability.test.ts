import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("metrics endpoint", () => {
  it("is exposed when the operator enables it", async () => {
    const result = await execFileAsync(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/metrics-probe.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, METRICS_ENABLED: "true", LOG_LEVEL: "silent" },
      },
    );

    expect(result.stdout).toContain("WPCP_METRICS_OK");
  });
});
