import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
async function files(directory) {
  // The recursion starts at the fixed plugin root and only appends names returned by readdir.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await files(path)));
    else if (entry.name.endsWith(".php")) output.push(path);
  }
  return output;
}
const phpFiles = await files("wordpress/editorial-publisher-for-chatgpt");
for (const file of phpFiles) {
  const { stdout } = await exec("php", ["-l", file]);
  process.stdout.write(stdout);
}
console.log(`PHP syntax valid in ${phpFiles.length} files.`);
