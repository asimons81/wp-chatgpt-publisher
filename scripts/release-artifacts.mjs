import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { ZipArchive } from "archiver";

await mkdir("artifacts", { recursive: true });
async function zipSource() {
  const target = "artifacts/editorial-publisher-for-chatgpt-1.0.1-source.zip";
  await rm(target, { force: true });
  const output = createWriteStream(target);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const done = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
  });
  archive.pipe(output);
  archive.glob("**/*", {
    dot: true,
    nodir: true,
    ignore: [
      "**/node_modules/**",
      "**/vendor/**",
      "artifacts/**",
      ".git/**",
      ".vercel/**",
      "**/.env",
      "**/.env.*",
      "coverage/**",
      "**/dist/**",
      "**/*.tsbuildinfo",
      ".phpunit.result.cache",
      "tmp/**",
      "wordpress-test-core/**",
      "wordpress-test-lib/**",
    ],
  });
  // The example contains documented placeholders only and is intentionally
  // restored after the broad environment-file exclusion above.
  archive.file(".env.example", { name: ".env.example" });
  await archive.finalize();
  await done;
}
await zipSource();
const expected = [
  "editorial-publisher-for-chatgpt-1.0.1-source.zip",
  "editorial-publisher-for-chatgpt-1.0.1.zip",
  "sbom.cdx.json",
];
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
