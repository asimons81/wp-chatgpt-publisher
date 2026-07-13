import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { ZipArchive } from "archiver";

await mkdir("artifacts", { recursive: true });
const target = "artifacts/editorial-publisher-for-chatgpt-1.0.1.zip";
await rm(target, { force: true });
const output = createWriteStream(target);
const archive = new ZipArchive({ zlib: { level: 9 } });
const completed = new Promise((resolve, reject) => {
  output.on("close", resolve);
  output.on("error", reject);
  archive.on("error", reject);
});
archive.pipe(output);
archive.directory(
  "wordpress/editorial-publisher-for-chatgpt",
  "editorial-publisher-for-chatgpt",
  (entry) =>
    /(?:^|\/)(?:vendor|node_modules|tests|\.git)(?:\/|$)/.test(entry.name) ? false : entry,
);
await archive.finalize();
await completed;
console.log(`${target} (${archive.pointer()} bytes)`);
