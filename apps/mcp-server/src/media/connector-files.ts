import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ConnectorFileInput } from "@wp-chatgpt-publisher/contracts";
import { fetch } from "undici";
import { AppError } from "../errors.js";
import { validateExternalUrl } from "../security/ssrf.js";

const MIME_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  "image/jpeg": [".jpg", ".jpeg", ".jpe"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
};

export interface ResolvedConnectorUpload {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mimeType: keyof typeof MIME_EXTENSIONS;
  readonly sha256: string;
}

export interface ConnectorFileResolutionOptions {
  readonly approvedRoots: readonly string[];
  readonly maximumBytes: number;
  readonly downloadRemote?: (url: string, maximumBytes: number) => Promise<Uint8Array>;
}

function error(
  code: "validation_error" | "security_rejection" | "upstream_error",
  message: string,
  status: number,
  remediation?: string,
): AppError {
  return new AppError(code, message, status, remediation);
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

function mountedPath(locator: string): string | null {
  if (path.isAbsolute(locator)) return path.resolve(locator);
  if (locator.startsWith("file:")) {
    try {
      return path.resolve(fileURLToPath(locator));
    } catch {
      throw error("validation_error", "The connector file reference could not be resolved.", 400);
    }
  }
  if (locator.startsWith("sandbox:")) {
    const value = locator.slice("sandbox:".length).replace(/^\/+/, "/");
    return path.isAbsolute(value) ? path.resolve(value) : null;
  }
  return null;
}

async function readMountedFile(
  locator: string,
  approvedRoots: readonly string[],
  maximumBytes: number,
): Promise<Uint8Array> {
  const candidate = mountedPath(locator);
  if (!candidate)
    throw error("validation_error", "The connector file reference could not be resolved.", 400);
  const lexicalRoot = approvedRoots
    .map((root) => path.resolve(root))
    .find((root) => isInside(root, candidate));
  if (!lexicalRoot) {
    throw error(
      "security_rejection",
      "The connector file path is outside an approved mounted upload directory.",
      400,
      "Attach the file through ChatGPT so it is mounted in an approved upload directory.",
    );
  }
  let resolvedCandidate: string;
  let resolvedRoot: string;
  try {
    // Paths are constrained lexically first, then realpath-checked again below to block symlink escapes.
    [resolvedCandidate, resolvedRoot] = await Promise.all([
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      realpath(candidate),
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      realpath(lexicalRoot),
    ]);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      throw error("validation_error", "The mounted connector file does not exist.", 400);
    }
    throw error("validation_error", "The mounted connector file could not be inspected.", 400);
  }
  if (!isInside(resolvedRoot, resolvedCandidate)) {
    throw error(
      "security_rejection",
      "The connector file resolves outside an approved mounted upload directory.",
      400,
    );
  }
  // resolvedCandidate is proven to remain under resolvedRoot immediately above.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const details = await stat(resolvedCandidate);
  if (!details.isFile())
    throw error("validation_error", "The mounted connector file is not a readable file.", 400);
  if (details.size > maximumBytes) {
    throw error("validation_error", "The image exceeds the WordPress site upload limit.", 413);
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return new Uint8Array(await readFile(resolvedCandidate));
}

async function downloadRemote(url: string, maximumBytes: number): Promise<Uint8Array> {
  let target;
  try {
    target = await validateExternalUrl(url, "media");
  } catch {
    throw error(
      "security_rejection",
      "The connector file download URL is not an approved HTTPS URL.",
      400,
    );
  }
  const response = await fetch(target.url, {
    headers: { accept: "image/*" },
    dispatcher: target.dispatcher,
    redirect: "error",
  });
  if (!response.ok || !response.body) {
    throw error(
      "upstream_error",
      "The connector file reference could not be downloaded.",
      502,
      "Attach the image again and retry with the new connector file reference.",
    );
  }
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maximumBytes) {
    throw error("validation_error", "The image exceeds the WordPress site upload limit.", 413);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = (await reader.read()) as ReadableStreamReadResult<Uint8Array>;
    if (result.done) break;
    total += result.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw error("validation_error", "The image exceeds the WordPress site upload limit.", 413);
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function detectImageMime(bytes: Uint8Array): keyof typeof MIME_EXTENSIONS | null {
  if (
    bytes.length >= 8 &&
    Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from("89504e470d0a1a0a", "hex"))
  )
    return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  const header = Buffer.from(bytes.subarray(0, 32));
  if (
    header.subarray(0, 6).toString("ascii") === "GIF87a" ||
    header.subarray(0, 6).toString("ascii") === "GIF89a"
  )
    return "image/gif";
  if (
    header.subarray(0, 4).toString("ascii") === "RIFF" &&
    header.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  if (
    header.subarray(4, 8).toString("ascii") === "ftyp" &&
    /avif|avis/.test(header.toString("ascii", 8))
  )
    return "image/avif";
  return null;
}

function safeFileName(input: string | undefined, locator: string, mimeType: string): string {
  let fallback = "";
  const local = mountedPath(locator);
  if (local) fallback = path.basename(local);
  else {
    try {
      fallback = path.basename(new URL(locator).pathname);
    } catch {
      // The unresolved-reference error below is more useful than a URL parser error.
    }
  }
  const fileName = input ?? fallback;
  if (
    !fileName ||
    fileName !== path.posix.basename(fileName) ||
    fileName !== path.win32.basename(fileName) ||
    !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,239}$/.test(fileName)
  ) {
    throw error("validation_error", "The connector image filename is not safe.", 400);
  }
  const extension = path.extname(fileName).toLowerCase();
  if (!MIME_EXTENSIONS[mimeType]?.includes(extension)) {
    throw error(
      "validation_error",
      "The image filename extension does not match its verified MIME type.",
      415,
    );
  }
  return fileName;
}

export async function resolveConnectorFile(
  file: ConnectorFileInput,
  options: ConnectorFileResolutionOptions,
): Promise<ResolvedConnectorUpload> {
  if (!Number.isSafeInteger(options.maximumBytes) || options.maximumBytes <= 0) {
    throw error("upstream_error", "WordPress did not provide a valid upload size limit.", 502);
  }
  let bytes: Uint8Array;
  if (mountedPath(file.download_url)) {
    bytes = await readMountedFile(file.download_url, options.approvedRoots, options.maximumBytes);
  } else if (file.download_url.startsWith("https://")) {
    bytes = await (options.downloadRemote ?? downloadRemote)(
      file.download_url,
      options.maximumBytes,
    );
  } else {
    throw error("validation_error", "The connector file reference could not be resolved.", 400);
  }
  if (bytes.byteLength === 0)
    throw error("validation_error", "The connector image file is empty.", 400);
  if (bytes.byteLength > options.maximumBytes) {
    throw error("validation_error", "The image exceeds the WordPress site upload limit.", 413);
  }
  const mimeType = detectImageMime(bytes);
  if (!mimeType) {
    throw error(
      "validation_error",
      "The connector file is not a supported JPEG, PNG, GIF, WebP, or AVIF image.",
      415,
    );
  }
  if (file.mime_type && file.mime_type !== mimeType) {
    throw error(
      "validation_error",
      "The connector file MIME type does not match its contents.",
      415,
    );
  }
  return {
    bytes,
    fileName: safeFileName(file.file_name, file.download_url, mimeType),
    mimeType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
