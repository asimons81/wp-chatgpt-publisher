import { spawnSync } from "node:child_process";

const argumentsForComposer = process.argv.slice(2);
if (!argumentsForComposer.length) throw new Error("Provide a Composer command to run.");

const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "-v",
    `${process.cwd()}:/app`,
    "-w",
    "/app",
    "composer:2",
    "composer",
    ...argumentsForComposer,
  ],
  { stdio: "inherit", shell: false },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
