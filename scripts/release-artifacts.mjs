import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { releaseMetadata } from "./release-metadata.mjs";
import { writeReproducibleZip } from "./reproducible-zip.mjs";

const execFileAsync = promisify(execFile);
const { pluginZip, sourceZip } = await releaseMetadata();
const { stdout } = await execFileAsync(
  "git",
  ["ls-tree", "--full-tree", "-r", "--name-only", "-z", "HEAD"],
  {
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024,
  },
);
const trackedFiles = stdout.toString("utf8").split("\0").filter(Boolean);
const sourceEntries = [];
for (const source of trackedFiles) {
  const { stdout: data } = await execFileAsync("git", ["cat-file", "blob", `HEAD:${source}`], {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  sourceEntries.push({ data, name: source });
}
await writeReproducibleZip(`artifacts/${sourceZip}`, sourceEntries);
const expected = [sourceZip, pluginZip, "sbom.cdx.json"];
const available = new Set(await readdir("artifacts"));
const names = expected.filter((name) => available.has(name));
if (names.length !== expected.length)
  throw new Error("Build the WordPress ZIP and SBOM before creating release artifacts.");
const lines = [];
for (const name of names.sort()) {
  const digest = createHash("sha256")
    // Names are basenames returned from the fixed artifacts directory and filtered by extension.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    .update(await readFile(`artifacts/${name}`))
    .digest("hex");
  lines.push(`${digest}  ${name}`);
}
await writeFile("artifacts/SHA256SUMS", `${lines.join("\n")}\n`);
console.log(`Wrote checksums for ${lines.length} artifacts.`);
