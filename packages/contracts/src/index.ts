import { z } from "zod";

export const PRODUCT_NAME = "Editorial Publisher for ChatGPT";
export const PRODUCT_SLUG = "wp-chatgpt-publisher";
export const VERSION = "1.0.2";
export const REST_NAMESPACE = "wp-chatgpt-publisher/v1";

// Base scopes granted by the legacy SCOPE_PROFILES. The autonomous scope is
// intentionally excluded: no profile grants it; a site operator must approve
// it explicitly at connection time (ADR 0006 §1).
export const BASE_SCOPES = [
  "site:read",
  "content:read",
  "drafts:read",
  "drafts:write",
  "media:read",
  "media:write",
  "taxonomy:read",
  "taxonomy:write",
  "seo:read",
  "seo:write",
  "published:edit",
  "publish:schedule",
  "publish:execute",
  "audit:read",
] as const;

export const SCOPES = [...BASE_SCOPES, "autonomous:execute"] as const;

export const ScopeSchema = z.enum(SCOPES);
export type Scope = z.infer<typeof ScopeSchema>;

export const SCOPE_PROFILES = {
  readOnly: ["site:read", "content:read", "drafts:read", "media:read", "taxonomy:read", "seo:read"],
  editorial: [
    "site:read",
    "content:read",
    "drafts:read",
    "drafts:write",
    "media:read",
    "media:write",
    "taxonomy:read",
    "taxonomy:write",
    "seo:read",
    "seo:write",
  ],
  publisher: [...BASE_SCOPES],
} as const satisfies Record<string, readonly Scope[]>;

export const ConnectionSchema = z
  .object({
    id: z.string().uuid(),
    siteUrl: z.string().url(),
    siteName: z.string().min(1).max(200),
    wordpressUserId: z.number().int().positive(),
    wordpressUserName: z.string().min(1).max(200),
    scopes: z.array(ScopeSchema).min(1),
    credentialCiphertext: z.string().min(1),
    credentialKeyVersion: z.number().int().positive(),
    createdAt: z.string().datetime(),
    lastUsedAt: z.string().datetime().nullable(),
    revokedAt: z.string().datetime().nullable(),
  })
  .strict();
export type Connection = z.infer<typeof ConnectionSchema>;

export const ToolContextSchema = z
  .object({
    subject: z.string().min(1),
    clientId: z.string().min(1),
    connectionId: z.string().uuid(),
    scopes: z.array(ScopeSchema),
    audience: z.string().url(),
    requestId: z.string().uuid(),
  })
  .strict();
export type ToolContext = z.infer<typeof ToolContextSchema>;

export const ContentStatusSchema = z.enum(["draft", "pending", "private", "publish", "future"]);
export const ContentFormatSchema = z.enum(["markdown", "html", "blocks"]);
export const ContentRepresentationSchema = z.enum(["markdown", "html", "raw", "blocks"]);

export const SeoMetadataSchema = z
  .object({
    title: z.string().max(300).optional(),
    description: z.string().max(500).optional(),
    focusKeyword: z.string().max(200).optional(),
    canonicalUrl: z.string().url().optional(),
    socialTitle: z.string().max(300).optional(),
    socialDescription: z.string().max(500).optional(),
    socialImageId: z.number().int().positive().optional(),
    robots: z
      .enum(["index,follow", "noindex,follow", "index,nofollow", "noindex,nofollow"])
      .optional(),
  })
  .strict();
export type SeoMetadata = z.infer<typeof SeoMetadataSchema>;

export const SearchContentInputSchema = z
  .object({
    query: z.string().max(500).default(""),
    postTypes: z
      .array(z.string().regex(/^[a-z0-9_-]+$/))
      .max(10)
      .default(["post", "page"]),
    statuses: z.array(ContentStatusSchema).max(5).default(["publish", "draft"]),
    author: z.number().int().positive().optional(),
    category: z.number().int().positive().optional(),
    tag: z.number().int().positive().optional(),
    after: z.string().datetime().optional(),
    before: z.string().datetime().optional(),
    sort: z
      .enum(["relevance", "modified_desc", "modified_asc", "date_desc", "date_asc"])
      .default("relevance"),
    pageSize: z.number().int().min(1).max(50).default(10),
    cursor: z.string().max(500).optional(),
    detail: z.enum(["minimal", "standard"]).default("standard"),
  })
  .strict();

export const GetContentInputSchema = z
  .object({
    id: z.number().int().positive(),
    fields: z
      .array(
        z.enum([
          "title",
          "content",
          "excerpt",
          "author",
          "taxonomies",
          "seo",
          "media",
          "dates",
          "links",
        ]),
      )
      .max(9)
      .default([
        "title",
        "content",
        "excerpt",
        "author",
        "taxonomies",
        "seo",
        "media",
        "dates",
        "links",
      ]),
    representation: ContentRepresentationSchema.default("markdown"),
    revisionId: z.number().int().positive().optional(),
  })
  .strict();

export const ListDraftsInputSchema = z
  .object({
    postTypes: z
      .array(z.string().regex(/^[a-z0-9_-]+$/))
      .max(10)
      .default(["post", "page"]),
    author: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(50).default(10),
    cursor: z.string().max(500).optional(),
  })
  .strict();

export const CreateDraftInputSchema = z
  .object({
    postType: z
      .string()
      .regex(/^[a-z0-9_-]+$/)
      .default("post"),
    title: z.string().min(1).max(500),
    content: z.string().max(1_000_000),
    contentFormat: ContentFormatSchema.default("markdown"),
    excerpt: z.string().max(10_000).optional(),
    slug: z
      .string()
      .max(200)
      .regex(/^[a-z0-9-]*$/)
      .optional(),
    author: z.number().int().positive().optional(),
    categories: z.array(z.number().int().positive()).max(100).default([]),
    tags: z.array(z.number().int().positive()).max(100).default([]),
    featuredMediaId: z.number().int().positive().optional(),
    seo: SeoMetadataSchema.optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const UpdateDraftInputSchema = z
  .object({
    id: z.number().int().positive(),
    expectedVersion: z.string().min(1).max(200),
    title: z.string().min(1).max(500).optional(),
    content: z.string().max(1_000_000).optional(),
    contentFormat: ContentFormatSchema.optional(),
    excerpt: z.string().max(10_000).optional(),
    slug: z
      .string()
      .max(200)
      .regex(/^[a-z0-9-]*$/)
      .optional(),
    categories: z.array(z.number().int().positive()).max(100).optional(),
    tags: z.array(z.number().int().positive()).max(100).optional(),
    featuredMediaId: z.number().int().positive().nullable().optional(),
    seo: SeoMetadataSchema.optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .refine(
    (value) =>
      Object.keys(value).some((key) => !["id", "expectedVersion", "idempotencyKey"].includes(key)),
    "At least one field must be updated",
  );

export const RevisionInputSchema = z
  .object({
    id: z.number().int().positive(),
    includeDiff: z.boolean().default(true),
    pageSize: z.number().int().min(1).max(25).default(10),
    cursor: z.string().max(500).optional(),
  })
  .strict();
export const TaxonomyInputSchema = z
  .object({
    postType: z
      .string()
      .regex(/^[a-z0-9_-]+$/)
      .optional(),
  })
  .strict();
export const ListTermsInputSchema = z
  .object({
    taxonomy: z.string().regex(/^[a-z0-9_-]+$/),
    query: z.string().max(200).default(""),
    pageSize: z.number().int().min(1).max(100).default(25),
    cursor: z.string().max(500).optional(),
  })
  .strict();
export const AssignTermsInputSchema = z
  .object({
    contentId: z.number().int().positive(),
    taxonomy: z.string().regex(/^[a-z0-9_-]+$/),
    termIds: z.array(z.number().int().positive()).max(100),
    expectedVersion: z.string().min(1),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const SearchMediaInputSchema = z
  .object({
    query: z.string().max(300).default(""),
    mimeType: z
      .enum(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"])
      .optional(),
    pageSize: z.number().int().min(1).max(50).default(12),
    cursor: z.string().max(500).optional(),
  })
  .strict();
export const APPROVED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
] as const;
export const ConnectorFileInputSchema = z
  .object({
    // ChatGPT may rewrite this temporary locator to an approved mounted path.
    download_url: z.string().min(1).max(4096),
    file_id: z.string().min(1).max(500),
    mime_type: z.enum(APPROVED_IMAGE_MIME_TYPES).optional(),
    file_name: z.string().min(1).max(240).optional(),
  })
  .strict();
export type ConnectorFileInput = z.infer<typeof ConnectorFileInputSchema>;
export const UploadMediaInputSchema = z
  .object({
    file: ConnectorFileInputSchema.optional(),
    sourceUrl: z
      .string()
      .url()
      .refine((value) => value.startsWith("https://"), "Remote media must use HTTPS")
      .optional(),
    fileName: z.string().min(1).max(240).optional(),
    title: z.string().max(500).optional(),
    caption: z.string().max(10_000).optional(),
    description: z.string().max(20_000).optional(),
    altText: z.string().max(2_000).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .refine(
    (value) => Number(Boolean(value.file)) + Number(Boolean(value.sourceUrl)) === 1,
    "Provide exactly one file source",
  )
  .refine((value) => Boolean(value.file?.file_name || value.fileName), "A file name is required");
export const UpdateMediaInputSchema = z
  .object({
    mediaId: z.number().int().positive(),
    title: z.string().max(500).optional(),
    caption: z.string().max(10_000).optional(),
    description: z.string().max(20_000).optional(),
    altText: z.string().max(2_000).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const SetFeaturedImageInputSchema = z
  .object({
    contentId: z.number().int().positive(),
    mediaId: z.number().int().positive().nullable(),
    expectedVersion: z.string().min(1),
    confirmationToken: z.string().max(2_000).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const ContentIdInputSchema = z.object({ contentId: z.number().int().positive() }).strict();
export const SetSeoInputSchema = z
  .object({
    contentId: z.number().int().positive(),
    expectedVersion: z.string().min(1),
    metadata: SeoMetadataSchema,
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const ScheduleInputSchema = z
  .object({
    contentId: z.number().int().positive(),
    publishAt: z.string().datetime({ offset: true }),
    siteTimezone: z.string().min(1).max(100),
    expectedVersion: z.string().min(1),
    confirmationToken: z.string().min(1),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const PublishInputSchema = z
  .object({
    contentId: z.number().int().positive(),
    expectedVersion: z.string().min(1),
    confirmationToken: z.string().min(1),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const ReviewActionInputSchema = z
  .object({
    contentId: z.number().int().positive(),
    action: z.enum(["publish", "schedule", "edit_published", "replace_featured_image"]),
    publishAt: z.string().datetime({ offset: true }).optional(),
    mediaId: z.number().int().positive().nullable().optional(),
    expectedVersion: z.string().min(1),
  })
  .strict();

export const ToolErrorSchema = z
  .object({
    code: z.enum([
      "authentication_required",
      "connection_expired",
      "scope_missing",
      "capability_missing",
      "validation_error",
      "edit_conflict",
      "unsupported",
      "rate_limited",
      "upstream_error",
      "confirmation_required",
      "confirmation_expired",
      "security_rejection",
      // Autonomous pipeline errors (ADR 0006 §7). All are fail-closed and
      // non-retryable unless the upstream failure itself is transient.
      "autonomous_disabled",
      "pipeline_not_allowed",
      "pipeline_version_mismatch",
      "manifest_invalid",
      "derived_fact_mismatch",
      "policy_fingerprint_mismatch",
      "rate_cap_exceeded",
    ]),
    message: z.string(),
    remediation: z.string().optional(),
    requestId: z.string().uuid(),
    retryable: z.boolean(),
  })
  .strict();
export const WriteResultSchema = z
  .object({
    object: z.object({ type: z.string(), id: z.number().int().positive() }).strict(),
    changedFields: z.array(z.string()),
    status: ContentStatusSchema,
    version: z.string(),
    revisionId: z.number().int().positive().nullable(),
    warnings: z.array(z.string()),
    auditEventId: z.string().uuid(),
    previewUrl: z.string().url().nullable(),
    editUrl: z.string().url().nullable(),
    publicUrl: z.string().url().nullable(),
  })
  .strict();
export const PaginationSchema = z
  .object({
    nextCursor: z.string().nullable(),
    truncated: z.boolean(),
    returned: z.number().int().nonnegative(),
    total: z.number().int().nonnegative().nullable(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Autonomous editorial pipeline (ADR 0006). All schemas are strict: unknown
// fields are rejected and the whole boundary fails closed.
// ---------------------------------------------------------------------------

export const AutonomousLimitsSchema = z
  .object({
    maxRequestsPerHour: z.number().int().min(1).max(1000).default(20),
    maxRequestsPerDay: z.number().int().min(1).max(10000).default(100),
    maxScheduledPerDay: z.number().int().min(1).max(1000).default(20),
  })
  .strict();
export type AutonomousLimits = z.infer<typeof AutonomousLimitsSchema>;

export const AUTONOMOUS_PIPELINE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

// One allowed pipeline descriptor. Used in both the server operational
// allowlist (AUTONOMOUS_ALLOWED_PIPELINES) and the plugin site policy
// (wpcp_autonomous_policy.allowedPipelines).
export const AutonomousPipelinePolicySchema = z
  .object({
    pipelineId: z.string().min(1).max(128).regex(AUTONOMOUS_PIPELINE_ID_PATTERN),
    minPipelineVersion: z.string().min(1).max(64),
    limits: AutonomousLimitsSchema,
  })
  .strict();
export type AutonomousPipelinePolicy = z.infer<typeof AutonomousPipelinePolicySchema>;

// Plugin site policy (WordPress option wpcp_autonomous_policy). Missing,
// malformed, or unknown-field policies are treated as disabled by the
// validator — the schema itself is strict so parse failure IS the disabled
// signal. schemaVersion is pinned to 1 so a future contract bump fails
// closed instead of being misread.
export const AutonomousPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    enabled: z.boolean().default(false),
    allowedPipelines: z.array(AutonomousPipelinePolicySchema).default([]),
  })
  .strict();
export type AutonomousPolicy = z.infer<typeof AutonomousPolicySchema>;

export const AutonomousManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    pipelineId: z.string().min(1).max(128).regex(AUTONOMOUS_PIPELINE_ID_PATTERN),
    pipelineVersion: z.string().min(1).max(64),
    requestId: z.string().uuid(),
    intent: z.enum(["create_draft", "schedule_draft"]),
    content: z
      .object({
        postType: z
          .string()
          .regex(/^[a-z0-9_-]+$/)
          .default("post"),
        title: z.string().min(1).max(500),
        body: z.string().max(1_000_000),
        bodyFormat: ContentFormatSchema.default("markdown"),
        excerpt: z.string().max(10_000).optional(),
        slug: z
          .string()
          .max(200)
          .regex(/^[a-z0-9-]*$/)
          .optional(),
        author: z.number().int().positive().optional(),
        categories: z.array(z.number().int().positive()).max(100).default([]),
        tags: z.array(z.number().int().positive()).max(100).default([]),
        featuredMediaId: z.number().int().positive().optional(),
        seo: SeoMetadataSchema.optional(),
      })
      .strict(),
    schedule: z
      .object({
        publishAt: z.string().datetime({ offset: true }),
        siteTimezone: z.string().min(1).max(100),
      })
      .strict()
      .optional(),
    attestations: z
      .object({
        research: z
          .object({
            performedAt: z.string().datetime(),
            sourceCount: z.number().int().min(0).max(1000),
            sources: z.array(z.string().url()).max(100).default([]),
            model: z.string().max(200).optional(),
          })
          .strict(),
        qa: z
          .object({
            performedAt: z.string().datetime(),
            passed: z.boolean(),
            checks: z.array(z.string().max(100)).max(50).default([]),
            model: z.string().max(200).optional(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.intent === "schedule_draft" && !value.schedule) {
      ctx.addIssue({
        code: "custom",
        path: ["schedule"],
        message: "schedule_draft requires a schedule",
      });
    }
  });
export type AutonomousManifest = z.infer<typeof AutonomousManifestSchema>;

// Server-derived current WordPress facts. Never supplied by the client; the
// validator compares manifest claims against these and fails closed on any
// mismatch (ADR 0006 §4).
export const AutonomousDerivedFactsSchema = z
  .object({
    contentStatus: ContentStatusSchema,
    version: z.string().min(1).max(200),
    postType: z.string(),
    author: z.number().int().positive().nullable(),
    featuredMediaId: z.number().int().positive().nullable(),
    seoSupport: z.record(z.string(), z.boolean()),
    capability: z.boolean(),
    rateCounts: z
      .object({
        hour: z.number().int().nonnegative(),
        day: z.number().int().nonnegative(),
        scheduled: z.number().int().nonnegative(),
      })
      .strict(),
    policyFingerprint: z.string(),
  })
  .strict();
export type AutonomousDerivedFacts = z.infer<typeof AutonomousDerivedFactsSchema>;

export function hasAllScopes(granted: readonly Scope[], required: readonly Scope[]): boolean {
  const grantSet = new Set(granted);
  return required.every((scope) => grantSet.has(scope));
}

export function assertScopes(granted: readonly Scope[], required: readonly Scope[]): void {
  if (!hasAllScopes(granted, required)) {
    const missing = required.filter((scope) => !granted.includes(scope));
    throw new Error(`Missing required scope: ${missing.join(", ")}`);
  }
}
