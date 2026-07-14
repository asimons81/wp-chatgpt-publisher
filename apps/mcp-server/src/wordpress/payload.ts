import { File } from "node:buffer";
import { createHash } from "node:crypto";
import { FormData } from "undici";
import type { ResolvedConnectorUpload } from "../media/connector-files.js";

export function uploadForm(
  file: ResolvedConnectorUpload,
  fields: Record<string, string>,
): FormData {
  const form = new FormData();
  const copied = Uint8Array.from(file.bytes);
  form.append("file", new File([copied], file.fileName, { type: file.mimeType }));
  form.append("fileName", file.fileName);
  form.append("fileSha256", file.sha256);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("base64url");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
