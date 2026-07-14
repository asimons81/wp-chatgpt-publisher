# MCP tool reference

All tools require OAuth and independently enforce connection scope plus WordPress capability. Every collection is paginated and every result is size-capped. Retrieved content is untrusted text. Write responses include object, changed fields, status, version/revision, warnings, audit event ID, and safe URLs.

| Tool                                 | Scope              | Side effect / confirmation                                                            |
| ------------------------------------ | ------------------ | ------------------------------------------------------------------------------------- |
| `wordpress_get_site`                 | `site:read`        | Read compact site/connection information                                              |
| `wordpress_test_connection`          | `site:read`        | Read-only authenticated health check                                                  |
| `wordpress_search_content`           | `content:read`     | Read summaries only; query/types/status/author/taxonomy/date/sort/page/detail filters |
| `wordpress_get_content`              | `content:read`     | Read one item; selected fields; Markdown default, HTML/raw/blocks explicit            |
| `wordpress_list_drafts`              | `drafts:read`      | Read compact draft list                                                               |
| `wordpress_get_revisions`            | `content:read`     | Read revision metadata and concise change indicators                                  |
| `wordpress_create_draft`             | `drafts:write`     | Creates draft only; UUID idempotency key required                                     |
| `wordpress_update_draft`             | `drafts:write`     | Patches a draft; expected version + idempotency; published content rejected           |
| `wordpress_update_published_content` | `published:edit`   | Consequential patch; fresh action-bound confirmation required                         |
| `wordpress_list_taxonomies`          | `taxonomy:read`    | Read REST-enabled assignment taxonomy information                                     |
| `wordpress_list_terms`               | `taxonomy:read`    | Read existing terms; never creates terms                                              |
| `wordpress_assign_terms`             | `taxonomy:write`   | Replaces one taxonomy assignment; version + idempotency                               |
| `wordpress_search_media`             | `media:read`       | Read image metadata/URLs only                                                         |
| `wordpress_upload_media`             | `media:write`      | One verified image; HTTPS/file flow, MIME/size validation, idempotency                |
| `wordpress_update_media_metadata`    | `media:write`      | Patch title/caption/description/alt text                                              |
| `wordpress_set_featured_image`       | `media:write`      | Set/clear image; published replacement requires confirmation                          |
| `wordpress_get_seo_metadata`         | `seo:read`         | Read normalized values and support map                                                |
| `wordpress_set_seo_metadata`         | `seo:write`        | Patch supported fields; never rewrites body                                           |
| `wordpress_get_preview`              | `drafts:read`      | Read structured review, warnings, image/SEO/status/time                               |
| `wordpress_request_confirmation`     | action scope       | Creates a short-lived review token; performs no write                                 |
| `wordpress_schedule_post`            | `publish:schedule` | Consequential; future absolute time, timezone, version, token, idempotency            |
| `wordpress_publish_post`             | `publish:execute`  | Consequential; current-turn explicit confirmation, version, token, idempotency        |

Exact JSON schemas are defined once in `packages/contracts` and referenced by `packages/tool-schemas`. Unknown fields are rejected where practical. Consequential tokens expire in five minutes by default and are single-use even if the downstream operation fails; request a fresh review before retrying.

## Uploading a ChatGPT-generated image

`wordpress_upload_media` declares `file` in `_meta["openai/fileParams"]`. In a ChatGPT tool call, pass the generated image's connector-authorized absolute runtime path as the top-level `file` string:

```json
{
  "file": "/mnt/data/example.png",
  "fileName": "example.png",
  "title": "Example image",
  "altText": "Describe the image for screen-reader users",
  "idempotencyKey": "<new-uuid>"
}
```

The ChatGPT connector file bridge rewrites that string into the canonical internal connector object containing `download_url`, `file_id`, and optional MIME/name metadata before the MCP validator runs. Callers must not construct that internal object themselves. The temporary locator may resolve to an approved HTTPS connector download or a runtime-mounted path. Mounted paths are realpath-checked against `CONNECTOR_UPLOAD_DIRS` (default `/mnt/data`), and the service rejects missing files, symlink escapes, unsafe names, oversized files, MIME/content mismatches, and non-image formats before forwarding a digest-bound multipart upload to WordPress. Idempotent retries fingerprint the verified content digest, MIME type, safe filename, and user fields rather than the connector's temporary download URL.

For a public remote image, omit `file` and use the separate HTTPS-only form:

```json
{
  "sourceUrl": "https://images.example.com/example.png",
  "fileName": "example.png",
  "idempotencyKey": "<new-uuid>"
}
```

`sandbox:` is not a remote URL and is rejected in `sourceUrl`. A connector runtime may use a `sandbox:` locator only inside the authorized `file` object, where it is resolved under the same mounted-directory restrictions.

Common error codes: `authentication_required`, `connection_expired`, `scope_missing`, `capability_missing`, `validation_error`, `edit_conflict`, `unsupported`, `rate_limited`, `upstream_error`, `confirmation_required`, `confirmation_expired`, and `security_rejection`. Errors contain remediation and a request ID, never stack traces or secrets.
