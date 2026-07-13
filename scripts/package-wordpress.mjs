/* eslint-disable security/detect-non-literal-fs-filename -- Recursion is rooted in the fixed plugin source directory. */
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { PLUGIN_SLUG, releaseMetadata } from "./release-metadata.mjs";
import { writeReproducibleZip } from "./reproducible-zip.mjs";

async function filesBelow(root) {
  const files = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )) {
    if (["vendor", "node_modules", "tests", ".git"].includes(entry.name)) continue;
    const source = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(source)));
    else if (entry.isFile()) files.push(source);
  }
  return files;
}

const { pluginZip } = await releaseMetadata();
const root = join("wordpress", PLUGIN_SLUG);
const entries = (await filesBelow(root)).map((source) => ({
  source,
  name: `${PLUGIN_SLUG}/${relative(root, source)}`,
}));
const target = `artifacts/${pluginZip}`;
const bytes = await writeReproducibleZip(target, entries);
console.log(`${target} (${bytes} bytes)`);
