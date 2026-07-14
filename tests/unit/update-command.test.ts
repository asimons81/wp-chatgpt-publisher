import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import {
  compareVersions,
  parseAheadBehind,
  parseArguments,
  stableVersion,
  updateCheckout,
} from "../../scripts/update.mjs";

const execFile = promisify(execFileCallback);

async function command(commandName: string, arguments_: string[], cwd?: string) {
  return execFile(commandName, arguments_, { cwd, encoding: "utf8", windowsHide: true });
}

async function writePackage(directory: string, version: string) {
  const packageJson = {
    name: "safe-update-fixture",
    version,
    private: true,
    scripts: { build: 'node -e ""' },
  };
  const packageLock = {
    name: packageJson.name,
    version,
    lockfileVersion: 3,
    requires: true,
    packages: { "": { name: packageJson.name, version } },
  };
  await Promise.all([
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Isolated test directory created above.
    writeFile(join(directory, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`),
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Isolated test directory created above.
    writeFile(join(directory, "package-lock.json"), `${JSON.stringify(packageLock, null, 2)}\n`),
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Isolated test directory created above.
    writeFile(join(directory, ".gitignore"), "node_modules/\n"),
  ]);
}

describe("safe update command", () => {
  it("accepts check, confirmation, and help flags", () => {
    expect(parseArguments(["--check"])).toEqual({ check: true, help: false, yes: false });
    expect(parseArguments(["-y"])).toEqual({ check: false, help: false, yes: true });
    expect(parseArguments(["--help"])).toEqual({ check: false, help: true, yes: false });
  });

  it("rejects unknown and contradictory flags", () => {
    expect(() => parseArguments(["--force"])).toThrow("Unknown option");
    expect(() => parseArguments(["--check", "--yes"])).toThrow("cannot be combined");
  });

  it("parses git ahead and behind counts without guessing", () => {
    expect(parseAheadBehind("0\t3\n")).toEqual({ ahead: 0, behind: 3 });
    expect(() => parseAheadBehind("unexpected")).toThrow("unexpected ahead/behind");
  });

  it("accepts only stable semantic versions", () => {
    expect(stableVersion("1.2.3", "package.json")).toBe("1.2.3");
    expect(() => stableVersion("1.2.3-beta.1", "package.json")).toThrow("stable semantic version");
    expect(() => stableVersion(123, "package.json")).toThrow("stable semantic version");
  });

  it("compares stable versions numerically for downgrade protection", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.2", "1.2.3")).toBe(-1);
  });

  it("applies a real fast-forward, locked install, and build", async () => {
    const root = await mkdtemp(join(tmpdir(), "wpcp-update-"));
    const upstream = join(root, "upstream");
    const remote = join(root, "remote.git");
    const checkout = join(root, "checkout");
    try {
      await command("git", ["init", "--initial-branch=main", upstream]);
      await command("git", ["config", "user.name", "Updater Test"], upstream);
      await command("git", ["config", "user.email", "updater@example.invalid"], upstream);
      await writePackage(upstream, "1.0.0");
      await command("git", ["add", "."], upstream);
      await command("git", ["commit", "-m", "Initial fixture"], upstream);
      await command("git", ["init", "--bare", remote]);
      await command("git", ["remote", "add", "origin", remote], upstream);
      await command("git", ["push", "-u", "origin", "main"], upstream);
      await command("git", ["symbolic-ref", "HEAD", "refs/heads/main"], remote);
      await command("git", ["clone", remote, checkout]);

      await writePackage(upstream, "1.0.1");
      await command("git", ["add", "package.json", "package-lock.json"], upstream);
      await command("git", ["commit", "-m", "Release fixture update"], upstream);
      await command("git", ["push", "origin", "main"], upstream);

      let output = "";
      const outputStream = new Writable({
        write(chunk: Buffer | string, _encoding: BufferEncoding, callback) {
          output += chunk.toString();
          callback();
        },
      });
      await updateCheckout({ arguments_: ["--yes"], cwd: checkout, output: outputStream });

      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Isolated test directory created above.
      const installed: unknown = JSON.parse(await readFile(join(checkout, "package.json"), "utf8"));
      expect(installed).toMatchObject({ version: "1.0.1" });
      expect(output).toContain("Updated successfully to 1.0.1");
      const { stdout: status } = await command("git", ["status", "--porcelain=v1"], checkout);
      expect(status).toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
