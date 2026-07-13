import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  assertScopes,
  ScopeSchema,
  type Scope,
  type ToolContext,
} from "@wp-chatgpt-publisher/contracts";
import {
  TOOL_DEFINITIONS,
  annotationsFor,
  type ToolDefinition,
  type ToolName,
} from "@wp-chatgpt-publisher/tool-schemas";
import { config } from "../config.js";
import { AppError, toAppError } from "../errors.js";
import { hashToken, randomToken } from "../security/crypto.js";
import type { Repository } from "../storage/repository.js";
import { WordPressClient, stableHash } from "../wordpress/client.js";

const CONSEQUENTIAL_SCOPES: Record<string, Scope> = {
  publish: "publish:execute",
  schedule: "publish:schedule",
  edit_published: "published:edit",
  replace_featured_image: "media:write",
};
const DEFINITIONS: readonly ToolDefinition[] = TOOL_DEFINITIONS;

export class McpService {
  readonly #wordpress = new WordPressClient();
  constructor(private readonly repository: Repository) {}
  createServer(context: ToolContext): McpServer {
    const server = new McpServer({ name: "wp-chatgpt-publisher", version: "1.0.0" });
    this.#registerResources(server);
    for (const definition of DEFINITIONS) this.#registerTool(server, definition, context);
    return server;
  }
  #registerResources(server: McpServer): void {
    const resources = new Map(
      DEFINITIONS.flatMap((tool) =>
        tool.outputTemplate ? [[tool.outputTemplate, tool.title] as const] : [],
      ),
    );
    for (const [uri, title] of resources) {
      registerAppResource(server, uri.split("/").pop() ?? uri, uri, {}, () => ({
        contents: [
          {
            uri,
            mimeType: RESOURCE_MIME_TYPE,
            text: this.#resourceHtml(title),
            _meta: {
              ui: {
                csp: {
                  connectDomains: [config.publicBaseUrl],
                  resourceDomains: [config.publicBaseUrl],
                },
                domain: config.publicBaseUrl,
              },
              "openai/widgetDescription": `${title} for a connected WordPress editorial workflow.`,
            },
          },
        ],
      }));
    }
  }
  #resourceHtml(title: string): string {
    const asset = `${config.publicBaseUrl}/ui/assets/app.js?v=1.0.0`;
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title.replace(/[<>&]/g, "")}</title></head><body><div id="root"></div><script type="module" src="${asset}"></script></body></html>`;
  }
  #registerTool(server: McpServer, definition: ToolDefinition, context: ToolContext): void {
    registerAppTool(
      server,
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        annotations: annotationsFor(definition.risk),
        _meta: {
          ...(definition.outputTemplate
            ? { ui: { resourceUri: definition.outputTemplate, visibility: ["model", "app"] } }
            : {}),
          securitySchemes: [{ type: "oauth2", scopes: [...definition.requiredScopes] }],
          ...(definition.fileParams ? { "openai/fileParams": [...definition.fileParams] } : {}),
          "openai/toolInvocation/invoking": "Working with WordPress…",
          "openai/toolInvocation/invoked": "WordPress updated.",
        },
      },
      (input: unknown) =>
        this.#execute(definition.name as ToolName, definition, input, context) as never,
    );
  }
  async #execute(
    name: ToolName,
    definition: ToolDefinition,
    rawInput: unknown,
    context: ToolContext,
  ) {
    try {
      assertScopes(context.scopes, definition.requiredScopes);
      const input: unknown = definition.inputSchema.parse(rawInput) as unknown;
      const connection = await this.repository.getConnection(context.connectionId);
      if (!connection || connection.revokedAt)
        throw new AppError(
          "connection_expired",
          "This WordPress connection is no longer active.",
          401,
          "Reconnect the site in ChatGPT.",
        );
      const granted = ScopeSchema.array().parse(connection.scopes);
      assertScopes(granted, definition.requiredScopes);
      if (name === "wordpress_request_confirmation")
        return this.#requestConfirmation(connection, input as Record<string, unknown>, context);
      if (definition.risk === "consequential")
        await this.#verifyConfirmation(name, input as Record<string, unknown>, context);
      if (name === "wordpress_set_featured_image")
        await this.#verifyPublishedFeaturedImageReplacement(
          connection,
          input as Record<string, unknown>,
          context,
        );
      const idempotencyKey =
        typeof (input as Record<string, unknown>).idempotencyKey === "string"
          ? (input as Record<string, string>).idempotencyKey
          : null;
      if (idempotencyKey) {
        const claim = await this.repository.claimIdempotency(
          connection.id,
          idempotencyKey,
          name,
          stableHash(input),
        );
        if (!claim.claimed) return this.#result(claim.response, definition.outputTemplate);
      }
      const wordpressInput =
        name === "wordpress_upload_media"
          ? this.#normalizeUploadInput(input as Record<string, unknown>)
          : input;
      const output = await this.#wordpress.call(
        connection,
        name,
        wordpressInput,
        context.requestId,
      );
      if (idempotencyKey)
        await this.repository.finishIdempotency(connection.id, idempotencyKey, output);
      await this.repository.touchConnection(connection.id);
      return this.#result(output, definition.outputTemplate);
    } catch (error) {
      const appError =
        error instanceof Error && error.message.startsWith("Missing required scope")
          ? new AppError(
              "scope_missing",
              error.message,
              403,
              "Edit the WordPress connection permissions, then reconnect in ChatGPT.",
            )
          : toAppError(error);
      return {
        isError: true,
        structuredContent: { error: appError.toSafeObject() },
        content: [
          {
            type: "text",
            text: `${appError.message}${appError.remediation ? ` ${appError.remediation}` : ""}`,
          },
        ],
        _meta:
          appError.status === 401
            ? {
                "mcp/www_authenticate": [
                  `Bearer resource_metadata="${config.publicBaseUrl}/.well-known/oauth-protected-resource"`,
                ],
              }
            : {},
      };
    }
  }
  async #requestConfirmation(
    connection: NonNullable<Awaited<ReturnType<Repository["getConnection"]>>>,
    input: Record<string, unknown>,
    context: ToolContext,
  ) {
    const action = String(input.action);
    const required = CONSEQUENTIAL_SCOPES[action];
    if (!required) throw new AppError("validation_error", "Unsupported confirmation action.", 400);
    assertScopes(context.scopes, [required]);
    assertScopes(connection.scopes, [required]);
    const contentId = Number(input.contentId);
    const expectedVersion = String(input.expectedVersion);
    const preview = await this.#wordpress.call(
      connection,
      "wordpress_get_preview",
      { contentId },
      context.requestId,
    );
    const raw = randomToken();
    const payloadHash = stableHash({
      action,
      contentId,
      expectedVersion,
      publishAt: input.publishAt ?? null,
      mediaId: input.mediaId ?? null,
    });
    await this.repository.createConfirmation({
      hash: hashToken(raw),
      connectionId: connection.id,
      action,
      contentId,
      expectedVersion,
      payloadHash,
      expiresAt: new Date(Date.now() + config.confirmationTtlSeconds * 1000).toISOString(),
      consumedAt: null,
    });
    return this.#result(
      {
        review: preview,
        confirmationToken: raw,
        expiresInSeconds: config.confirmationTtlSeconds,
        action,
      },
      "ui://wp-chatgpt-publisher/publish-confirmation.html",
    );
  }
  async #verifyConfirmation(
    name: ToolName,
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<void> {
    const token = input.confirmationToken;
    if (typeof token !== "string")
      throw new AppError(
        "confirmation_required",
        "A fresh review confirmation is required.",
        409,
        "Call wordpress_request_confirmation for this exact action first.",
      );
    const record = await this.repository.consumeConfirmation(hashToken(token));
    if (!record || record.connectionId !== context.connectionId)
      throw new AppError(
        "confirmation_expired",
        "The confirmation expired or was already used.",
        409,
        "Request a new confirmation and review the current post state.",
      );
    const action =
      name === "wordpress_publish_post"
        ? "publish"
        : name === "wordpress_schedule_post"
          ? "schedule"
          : name === "wordpress_update_published_content"
            ? "edit_published"
            : "replace_featured_image";
    const expectedHash = stableHash({
      action,
      contentId: Number(input.contentId ?? input.id),
      expectedVersion: String(input.expectedVersion),
      publishAt: input.publishAt ?? null,
      mediaId: input.mediaId ?? null,
    });
    if (
      record.action !== action ||
      record.contentId !== Number(input.contentId ?? input.id) ||
      record.expectedVersion !== input.expectedVersion ||
      record.payloadHash !== expectedHash
    )
      throw new AppError(
        "security_rejection",
        "The confirmation does not match the requested action or current content version.",
        409,
        "Request a new confirmation for the exact action.",
      );
  }
  async #verifyPublishedFeaturedImageReplacement(
    connection: NonNullable<Awaited<ReturnType<Repository["getConnection"]>>>,
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<void> {
    const preview = (await this.#wordpress.call(
      connection,
      "wordpress_get_preview",
      { contentId: input.contentId },
      context.requestId,
    )) as Record<string, unknown>;
    const featured =
      typeof preview.featuredImage === "object" && preview.featuredImage
        ? (preview.featuredImage as Record<string, unknown>)
        : {};
    const currentMediaId = Number(featured.id ?? 0);
    const nextMediaId = Number(input.mediaId ?? 0);
    if (preview.status === "publish" && currentMediaId > 0 && currentMediaId !== nextMediaId)
      await this.#verifyConfirmation("wordpress_set_featured_image", input, context);
  }
  #normalizeUploadInput(input: Record<string, unknown>): Record<string, unknown> {
    const file =
      typeof input.file === "object" && input.file ? (input.file as Record<string, unknown>) : null;
    if (!file) return input;
    const rest = { ...input };
    delete rest.file;
    return {
      ...rest,
      sourceUrl: file.download_url,
      fileName: input.fileName ?? file.file_name,
    };
  }
  #result(output: unknown, template?: string) {
    return {
      structuredContent: output as Record<string, unknown>,
      content: [{ type: "text", text: JSON.stringify(output) }],
      _meta: template ? { ui: { resourceUri: template } } : {},
    };
  }
}
