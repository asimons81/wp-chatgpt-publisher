import { execFile as execFileCallback } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFile = promisify(execFileCallback);

export function parseArguments(arguments_) {
  const options = { check: false, help: false, yes: false };
  for (const argument of arguments_) {
    if (argument === "--check") options.check = true;
    else if (argument === "--yes" || argument === "-y") options.yes = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (options.check && options.yes) {
    throw new Error("--check cannot be combined with --yes.");
  }
  return options;
}

export function parseAheadBehind(output) {
  const match = output.trim().match(/^(\d+)\s+(\d+)$/);
  if (!match) throw new Error("Git returned an unexpected ahead/behind result.");
  return { ahead: Number(match[1]), behind: Number(match[2]) };
}

export function stableVersion(value, source) {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error(`${source} does not contain a stable semantic version.`);
  }
  return value;
}

export function compareVersions(left, right) {
  const leftParts = stableVersion(left, "Current package.json").split(".").map(Number);
  const rightParts = stableVersion(right, "Upstream package.json").split(".").map(Number);
  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

function helpText() {
  return `Usage: npm run update -- [options]

Safely fast-forward this source checkout to its configured upstream, install
the exact locked dependencies, and rebuild the project.

Options:
  --check       Fetch and report whether an update is available without applying it
  -y, --yes     Apply the update without an interactive confirmation
  -h, --help    Show this help

The command refuses dirty, detached, locally-ahead, or diverged checkouts.`;
}

async function run(command, arguments_, options = {}) {
  try {
    return await execFile(command, arguments_, {
      cwd: options.cwd,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    const details = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${arguments_.join(" ")} failed${details ? `:\n${details}` : "."}`, {
      cause: error,
    });
  }
}

async function git(arguments_, cwd) {
  const { stdout } = await run("git", arguments_, { cwd });
  return stdout.trim();
}

async function packageVersionAt(revision, cwd) {
  const contents = await git(["show", `${revision}:package.json`], cwd);
  let metadata;
  try {
    metadata = JSON.parse(contents);
  } catch (error) {
    throw new Error(`package.json at ${revision} is not valid JSON.`, { cause: error });
  }
  return stableVersion(metadata.version, `package.json at ${revision}`);
}

async function confirmUpdate(message, input, output) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Refusing a non-interactive update without --yes.");
  }
  const prompt = createInterface({ input, output });
  try {
    const answer = await prompt.question(`${message} [y/N] `);
    return /^(?:y|yes)$/i.test(answer.trim());
  } finally {
    prompt.close();
  }
}

export async function updateCheckout({
  arguments_ = process.argv.slice(2),
  cwd = process.cwd(),
  input = process.stdin,
  output = process.stdout,
} = {}) {
  const options = parseArguments(arguments_);
  if (options.help) {
    output.write(`${helpText()}\n`);
    return;
  }

  const repositoryRoot = await git(["rev-parse", "--show-toplevel"], cwd);
  if (resolve(repositoryRoot) !== resolve(cwd)) {
    throw new Error(`Run the updater from the repository root: ${repositoryRoot}`);
  }
  const branch = await git(["symbolic-ref", "--quiet", "--short", "HEAD"], cwd).catch(() => {
    throw new Error("Refusing to update a detached HEAD. Check out a branch first.");
  });
  const remote = await git(["config", "--get", `branch.${branch}.remote`], cwd).catch(() => "");
  const mergeRef = await git(["config", "--get", `branch.${branch}.merge`], cwd).catch(() => "");
  if (!remote || !mergeRef || remote === ".") {
    throw new Error(`Branch ${branch} has no remote upstream. Configure one before updating.`);
  }

  const dirty = await git(["status", "--porcelain=v1", "--untracked-files=all"], cwd);
  if (dirty) {
    throw new Error(
      "Refusing to update a dirty checkout. Commit, stash, or remove every listed change first:\n" +
        dirty,
    );
  }

  output.write(`Checking ${remote} for updates to ${branch}...\n`);
  await run("git", ["fetch", "--prune", remote], { cwd });
  const upstream = `${remote}/${mergeRef.replace(/^refs\/heads\//, "")}`;
  await git(["rev-parse", "--verify", upstream], cwd);

  const relationship = parseAheadBehind(
    await git(["rev-list", "--left-right", "--count", `HEAD...${upstream}`], cwd),
  );
  if (relationship.ahead > 0 && relationship.behind > 0) {
    throw new Error(`Refusing to update because ${branch} has diverged from ${upstream}.`);
  }
  if (relationship.ahead > 0) {
    throw new Error(
      `Refusing to update because ${branch} is ${relationship.ahead} commit(s) ahead of ${upstream}.`,
    );
  }
  if (relationship.behind === 0) {
    output.write("Already up to date.\n");
    return;
  }

  const initialCommit = await git(["rev-parse", "HEAD"], cwd);
  const targetCommit = await git(["rev-parse", upstream], cwd);
  const [currentVersion, targetVersion] = await Promise.all([
    packageVersionAt("HEAD", cwd),
    packageVersionAt(upstream, cwd),
  ]);
  if (compareVersions(targetVersion, currentVersion) < 0) {
    throw new Error(
      `Refusing to downgrade from ${currentVersion} to upstream version ${targetVersion}.`,
    );
  }
  const summary =
    `Update available: ${currentVersion} (${initialCommit.slice(0, 12)}) -> ` +
    `${targetVersion} (${targetCommit.slice(0, 12)}), ${relationship.behind} commit(s).`;
  output.write(`${summary}\n`);
  if (options.check) return;

  const npmEntryPoint = process.env.npm_execpath;
  if (!npmEntryPoint) {
    throw new Error("Cannot locate npm. Run the updater through `npm run update`.");
  }
  if (!options.yes && !(await confirmUpdate("Apply this update?", input, output))) {
    output.write("Update cancelled.\n");
    return;
  }

  // Recheck immediately before the write so another process cannot quietly change the checkout.
  if ((await git(["rev-parse", "HEAD"], cwd)) !== initialCommit) {
    throw new Error("HEAD changed while the update was waiting for confirmation. Run it again.");
  }
  if (await git(["status", "--porcelain=v1", "--untracked-files=all"], cwd)) {
    throw new Error(
      "The checkout changed while the update was waiting for confirmation. Run it again.",
    );
  }

  output.write("Applying fast-forward update...\n");
  await run("git", ["merge", "--ff-only", targetCommit], { cwd });
  try {
    output.write("Installing locked dependencies...\n");
    await run(process.execPath, [npmEntryPoint, "ci", "--ignore-scripts"], { cwd });
    output.write("Building updated project...\n");
    await run(process.execPath, [npmEntryPoint, "run", "build"], { cwd });
  } catch (error) {
    throw new Error(
      `The checkout was fast-forwarded to ${targetCommit}, but post-update validation failed. ` +
        `Fix the reported problem or redeploy the prior commit ${initialCommit}.\n${error.message}`,
      { cause: error },
    );
  }
  output.write(`Updated successfully to ${targetVersion} (${targetCommit.slice(0, 12)}).\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  updateCheckout().catch((error) => {
    process.stderr.write(`Update failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
