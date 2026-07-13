import { lookup } from "node:dns/promises";
import type { LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, type Dispatcher } from "undici";
import { config } from "../config.js";

const ALLOWED_PORTS = new Set([443, ...(config.allowPrivateNetworks ? [80, 8080] : [])]);
const BLOCKED_RANGES = new Set([
  "unspecified",
  "broadcast",
  "multicast",
  "linkLocal",
  "loopback",
  "private",
  "reserved",
  "carrierGradeNat",
  "uniqueLocal",
]);

export interface ValidatedTarget {
  readonly url: URL;
  readonly addresses: readonly string[];
  readonly dispatcher: Dispatcher;
}

export function isPublicAddress(address: string): boolean {
  const parsed = ipaddr.process(address);
  return !BLOCKED_RANGES.has(parsed.range());
}

export async function validateExternalUrl(
  input: string,
  purpose: "site" | "media",
): Promise<ValidatedTarget> {
  const url = new URL(input);
  if (url.username || url.password)
    throw new Error("URLs with embedded credentials are not allowed");
  if (url.protocol !== "https:" && !(config.allowPrivateNetworks && url.protocol === "http:"))
    throw new Error("HTTPS is required");
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  if (!ALLOWED_PORTS.has(port)) throw new Error("URL port is not allowed");
  if (purpose === "site") url.pathname = url.pathname.replace(/\/$/, "");
  const records = [
    ...new Set(
      (await lookup(url.hostname, { all: true, verbatim: true })).map((record) => record.address),
    ),
  ];
  if (records.length === 0) throw new Error("Host did not resolve");
  if (!config.allowPrivateNetworks && records.some((address) => !isPublicAddress(address)))
    throw new Error("Private or reserved network addresses are not allowed");
  const pinnedRecords = records.map((address) => ({
    address,
    family: ipaddr.parse(address).kind() === "ipv6" ? 6 : 4,
  }));
  let index = 0;
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    const matching = options.family
      ? pinnedRecords.filter((record) => record.family === options.family)
      : pinnedRecords;
    if (matching.length === 0) {
      callback(new Error("DNS pinning found no matching address family"), "", 0);
      return;
    }
    if (options.all) {
      callback(null, matching);
      return;
    }
    const record = matching[index++ % matching.length];
    if (!record) {
      callback(new Error("DNS pinning failed"), "", 0);
      return;
    }
    callback(null, record.address, record.family);
  };
  const dispatcher = new Agent({
    connect: {
      lookup: pinnedLookup,
    },
  });
  return { url, addresses: records, dispatcher };
}
