/* eslint-disable security/detect-non-literal-fs-filename -- Artifact names come from validated release metadata. */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, utimes, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { releaseMetadata } from "./release-metadata.mjs";

const execFileAsync = promisify(execFile);
const { pluginZip, sourceZip } = await releaseMetadata();
const pluginArtifact = `artifacts/${pluginZip}`;
const sourceArtifact = `artifacts/${sourceZip}`;
const timestampProbe = "wordpress/editorial-publisher-for-chatgpt/readme.txt";
const originalTimes = await stat(timestampProbe);
const sourceWorkingTreeProbe = ".gitignore";
const originalSourceWorkingTree = await readFile(sourceWorkingTreeProbe);
const originalSourceTimes = await stat(sourceWorkingTreeProbe);

async function buildArchives() {
  await execFileAsync(process.execPath, ["scripts/package-wordpress.mjs"]);
  await execFileAsync(process.execPath, ["scripts/release-artifacts.mjs"]);
}

async function digest(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

let first;
let second;
try {
  await buildArchives();
  first = {
    plugin: await digest(pluginArtifact),
    source: await digest(sourceArtifact),
  };

  await utimes(timestampProbe, originalTimes.atime, new Date("2040-01-01T00:00:00.000Z"));
  await writeFile(
    sourceWorkingTreeProbe,
    Buffer.concat([originalSourceWorkingTree, Buffer.from("working-tree-probe")]),
  );
  await buildArchives();
  second = {
    plugin: await digest(pluginArtifact),
    source: await digest(sourceArtifact),
  };
} finally {
  await utimes(timestampProbe, originalTimes.atime, originalTimes.mtime);
  await writeFile(sourceWorkingTreeProbe, originalSourceWorkingTree);
  await utimes(sourceWorkingTreeProbe, originalSourceTimes.atime, originalSourceTimes.mtime);
}

if (first.plugin !== second.plugin || first.source !== second.source) {
  throw new Error(`Release archives are not reproducible: ${JSON.stringify({ first, second })}`);
}
console.log(`Reproducible plugin ZIP: ${first.plugin}`);
console.log(`Reproducible source ZIP: ${first.source}`);
