import type { Readable, Writable } from "node:stream";

export interface UpdateArguments {
  check: boolean;
  help: boolean;
  yes: boolean;
}

export interface UpdateCheckoutOptions {
  arguments_?: string[];
  cwd?: string;
  input?: Readable & { isTTY?: boolean };
  output?: Writable & { isTTY?: boolean };
}

export function parseArguments(arguments_: string[]): UpdateArguments;
export function parseAheadBehind(output: string): { ahead: number; behind: number };
export function stableVersion(value: unknown, source: string): string;
export function compareVersions(left: string, right: string): -1 | 0 | 1;
export function updateCheckout(options?: UpdateCheckoutOptions): Promise<void>;
