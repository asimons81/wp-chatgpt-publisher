import type { Connection } from "@wp-chatgpt-publisher/contracts";
import { fetch } from "undici";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { SecretBox } from "../security/crypto.js";
import { validateExternalUrl } from "../security/ssrf.js";
import type { ResolvedConnectorUpload } from "../media/connector-files.js";
import { uploadForm } from "./payload.js";

const box = new SecretBox(config.encryptionKey);
const endpointMap: Record<string, { method: "GET" | "POST" | "PATCH"; path: string }> = {
  wordpress_get_site: { method: "GET", path: "/site" },
  wordpress_test_connection: { method: "GET", path: "/diagnostics/connection" },
  wordpress_search_content: { method: "POST", path: "/content/search" },
  wordpress_get_content: { method: "POST", path: "/content/get" },
  wordpress_list_drafts: { method: "POST", path: "/content/drafts" },
  wordpress_get_revisions: { method: "POST", path: "/content/revisions" },
  wordpress_create_draft: { method: "POST", path: "/drafts" },
  wordpress_update_draft: { method: "PATCH", path: "/drafts" },
  wordpress_update_published_content: { method: "PATCH", path: "/published" },
  wordpress_list_taxonomies: { method: "POST", path: "/taxonomies" },
  wordpress_list_terms: { method: "POST", path: "/terms" },
  wordpress_assign_terms: { method: "POST", path: "/terms/assign" },
  wordpress_search_media: { method: "POST", path: "/media/search" },
  wordpress_upload_media: { method: "POST", path: "/media/upload" },
  wordpress_update_media_metadata: { method: "PATCH", path: "/media" },
  wordpress_set_featured_image: { method: "POST", path: "/media/featured" },
  wordpress_get_seo_metadata: { method: "POST", path: "/seo/get" },
  wordpress_set_seo_metadata: { method: "POST", path: "/seo/set" },
  wordpress_get_preview: { method: "POST", path: "/preview" },
  wordpress_schedule_post: { method: "POST", path: "/schedule" },
  wordpress_publish_post: { method: "POST", path: "/publish" },
};

export class WordPressClient {
  async call(
    connection: Connection,
    tool: string,
    input: unknown,
    requestId: string,
  ): Promise<unknown> {
    const endpoint = endpointMap[tool];
    if (!endpoint)
      throw new AppError("unsupported", `The tool ${tool} is not mapped to WordPress.`, 500);
    const target = await validateExternalUrl(connection.siteUrl, "site");
    const url = `${connection.siteUrl}/wp-json/wp-chatgpt-publisher/v1${endpoint.path}`;
    const credential = box.decrypt(connection.credentialCiphertext, connection.id);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.wordpressRequestTimeoutMs);
    const upload = tool === "wordpress_upload_media" ? resolvedUpload(input) : null;
    const form = upload ? uploadForm(upload.file, upload.fields) : null;
    try {
      const response = await fetch(url, {
        method: endpoint.method,
        headers: {
          authorization: `Bearer ${credential}`,
          ...(form ? {} : { "content-type": "application/json" }),
          accept: "application/json",
          "x-wpcp-request-id": requestId,
        },
        ...(endpoint.method === "GET" ? {} : { body: form ?? JSON.stringify(input) }),
        dispatcher: target.dispatcher,
        redirect: "error",
        signal: controller.signal,
      });
      const length = Number(response.headers.get("content-length") ?? 0);
      if (length > config.wordpressMaxResponseBytes)
        throw new AppError(
          "upstream_error",
          "WordPress returned more data than the configured response budget.",
          502,
          "Narrow the query or request fewer fields.",
        );
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > config.wordpressMaxResponseBytes)
        throw new AppError(
          "upstream_error",
          "WordPress returned more data than the configured response budget.",
          502,
          "Narrow the query or request fewer fields.",
        );
      let body: unknown;
      try {
        body = bytes.length ? JSON.parse(new TextDecoder().decode(bytes)) : {};
      } catch {
        throw new AppError("upstream_error", "WordPress returned an invalid response.", 502);
      }
      if (!response.ok) {
        const source = typeof body === "object" && body ? (body as Record<string, unknown>) : {};
        const code =
          response.status === 401
            ? "connection_expired"
            : response.status === 403
              ? "capability_missing"
              : response.status === 409
                ? "edit_conflict"
                : response.status === 429
                  ? "rate_limited"
                  : "upstream_error";
        throw new AppError(
          code,
          typeof source.message === "string"
            ? source.message.slice(0, 500)
            : upload
              ? "The WordPress REST media upload failed."
              : "WordPress rejected the operation.",
          response.status,
          typeof source.remediation === "string" ? source.remediation.slice(0, 500) : undefined,
          response.status >= 500 || response.status === 429,
          requestId,
        );
      }
      const encoded = JSON.stringify(body);
      if (Buffer.byteLength(encoded) > 128 * 1024)
        throw new AppError(
          "upstream_error",
          "The tool result exceeded the model-visible response budget.",
          502,
          "Use filters, pagination, or a smaller field selection.",
        );
      return body;
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      if (upload) {
        throw new AppError(
          "upstream_error",
          "The WordPress REST media upload failed.",
          502,
          "Check the WordPress connection and upload limit, then retry once.",
          true,
          requestId,
        );
      }
      throw cause;
    } finally {
      clearTimeout(timeout);
    }
  }
}

interface ResolvedUploadInput {
  readonly file: ResolvedConnectorUpload;
  readonly fields: Record<string, string>;
}

function resolvedUpload(input: unknown): ResolvedUploadInput | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const file = source.file;
  if (!file || typeof file !== "object" || !(file as Record<string, unknown>).bytes) return null;
  const resolved = file as ResolvedConnectorUpload;
  if (!(resolved.bytes instanceof Uint8Array)) return null;
  const fields: Record<string, string> = {};
  for (const key of ["title", "caption", "description", "altText", "idempotencyKey"] as const) {
    if (typeof source[key] === "string") fields[key] = source[key];
  }
  return { file: resolved, fields };
}
