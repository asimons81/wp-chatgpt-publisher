import { readFile } from "node:fs/promises";

export const PLUGIN_SLUG = "editorial-publisher-for-chatgpt";

export async function releaseMetadata() {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const version = packageJson.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("The root package version must be a stable semantic version.");
  }

  return {
    version,
    pluginZip: `${PLUGIN_SLUG}-${version}.zip`,
    sourceZip: `${PLUGIN_SLUG}-${version}-source.zip`,
  };
}
