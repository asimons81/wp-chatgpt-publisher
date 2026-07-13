import { access, readFile } from "node:fs/promises";
import { releaseMetadata } from "./release-metadata.mjs";

const required = [
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "CHANGELOG.md",
  "RELEASE_NOTES.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "docs/architecture.md",
  "docs/threat-model.md",
  "docs/chatgpt-setup.md",
  "docs/wordpress-setup.md",
  "docs/self-hosting.md",
  "docs/app-submission.md",
  "docs/wordpress-submission.md",
  "docs/release-checklist.md",
  "docs/demo-script.md",
  "docs/compatibility.md",
  "docs/assets/brand/editorial-publisher-icon.svg",
  "docs/assets/brand/editorial-publisher-icon-1024.png",
  "docs/assets/brand/editorial-publisher-icon-512.png",
  "api/index.ts",
  "vercel.json",
  "wordpress/editorial-publisher-for-chatgpt/readme.txt",
];
for (const file of required) await access(file);
const { version } = await releaseMetadata();
const plugin = await readFile(
  "wordpress/editorial-publisher-for-chatgpt/editorial-publisher-for-chatgpt.php",
  "utf8",
);
if (!plugin.includes(`Version:           ${version}`))
  throw new Error("Plugin header version mismatch");
if (!plugin.includes(`define( 'WPCP_VERSION', '${version}' );`))
  throw new Error("Plugin runtime version mismatch");
const readme = await readFile("wordpress/editorial-publisher-for-chatgpt/readme.txt", "utf8");
if (!readme.includes(`Stable tag: ${version}`)) throw new Error("WordPress stable tag mismatch");
for (const forbidden of ["OPENAI_API_KEY", "sk-proj-", "sk_live_", "BEGIN PRIVATE KEY"]) {
  if (plugin.includes(forbidden))
    throw new Error(`Forbidden secret marker in plugin: ${forbidden}`);
}
console.log(`Release metadata valid; ${required.length} required files present.`);
