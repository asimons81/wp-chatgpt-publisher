import { rm } from "node:fs/promises";
for (const path of [
  "apps/mcp-server/dist",
  "apps/chatgpt-ui/dist",
  "packages/contracts/dist",
  "packages/tool-schemas/dist",
  "packages/test-fixtures/dist",
  "apps/mcp-server/tsconfig.tsbuildinfo",
  "apps/chatgpt-ui/tsconfig.tsbuildinfo",
  "packages/contracts/tsconfig.tsbuildinfo",
  "packages/tool-schemas/tsconfig.tsbuildinfo",
  "packages/test-fixtures/tsconfig.tsbuildinfo",
  "coverage",
  "artifacts",
])
  await rm(path, { recursive: true, force: true });
