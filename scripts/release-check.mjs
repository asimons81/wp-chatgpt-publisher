import { access, readFile } from "node:fs/promises";

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
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
if (packageJson.version !== "1.0.1") throw new Error("Root version is not 1.0.1");
const plugin = await readFile(
  "wordpress/editorial-publisher-for-chatgpt/editorial-publisher-for-chatgpt.php",
  "utf8",
);
if (!plugin.includes("Version:           1.0.1")) throw new Error("Plugin header version mismatch");
const readme = await readFile("wordpress/editorial-publisher-for-chatgpt/readme.txt", "utf8");
if (!readme.includes("Stable tag: 1.0.1")) throw new Error("WordPress stable tag mismatch");
for (const forbidden of ["OPENAI_API_KEY", "sk-proj-", "sk_live_", "BEGIN PRIVATE KEY"]) {
  if (plugin.includes(forbidden))
    throw new Error(`Forbidden secret marker in plugin: ${forbidden}`);
}
console.log(`Release metadata valid; ${required.length} required files present.`);
