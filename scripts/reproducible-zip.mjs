/* eslint-disable security/detect-non-literal-fs-filename -- Callers provide reviewed release paths; archive names are validated below. */
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { ZipArchive } from "archiver";

const ZIP_EPOCH = new Date("2000-01-01T00:00:00.000Z");

function compareNames(left, right) {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

/**
 * Write a byte-stable ZIP from explicit source/name pairs.
 *
 * Entry order, timestamps, path separators, and file modes are normalized so
 * that checkout time and host operating system do not change the artifact.
 */
export async function writeReproducibleZip(target, entries) {
  await mkdir(dirname(target), { recursive: true });
  await rm(target, { force: true });

  const output = createWriteStream(target);
  // STORE avoids implementation-dependent DEFLATE output across operating
  // systems and zlib versions. These release archives are small enough that
  // byte stability is more valuable than compression.
  const archive = new ZipArchive({ forceLocalTime: false, store: true });
  const completed = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(output);
  for (const entry of [...entries].sort(compareNames)) {
    const name = entry.name.replaceAll("\\", "/").replace(/^\/+/, "");
    if (!name || name.includes("../") || name.endsWith("/..")) {
      throw new Error(`Unsafe archive entry name: ${entry.name}`);
    }
    const contents = entry.data ?? (await readFile(entry.source));
    archive.append(contents, {
      name,
      date: ZIP_EPOCH,
      mode: 0o100644,
    });
  }

  await archive.finalize();
  await completed;
  return archive.pointer();
}
