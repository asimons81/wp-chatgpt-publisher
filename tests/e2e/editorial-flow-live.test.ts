import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, describe, expect, it } from "vitest";
import { SCOPES, SCOPE_PROFILES } from "@wp-chatgpt-publisher/contracts";
import { TOOL_DEFINITIONS } from "@wp-chatgpt-publisher/tool-schemas";
import {
  authorizeMcp,
  object,
  revokeWordPressConnection,
  text,
  type ObjectValue,
} from "../fixtures/oauth-client.js";

const service = process.env.WPCP_TEST_MCP_BASE_URL;
const wordpress = process.env.WPCP_TEST_WP_URL;
const username = process.env.WPCP_TEST_WP_USER;
const password = process.env.WPCP_TEST_WP_PASSWORD;
const live = service && wordpress && username && password ? describe : describe.skip;

const clients: Client[] = [];

async function mcpClient(accessToken: string, name: string): Promise<Client> {
  const client = new Client({ name, version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${service}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
  });
  await client.connect(transport);
  clients.push(client);
  return client;
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<ObjectValue> {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError, JSON.stringify(result.structuredContent)).not.toBe(true);
  return object(result.structuredContent);
}

function firstItem(data: ObjectValue): ObjectValue {
  const items = Array.isArray(data.items) ? data.items : [];
  expect(items.length).toBeGreaterThan(0);
  return object(items[0]);
}

live("complete real WordPress editorial workflow over OAuth and MCP", () => {
  afterAll(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  it("connects, reads, drafts, uploads, classifies, optimizes, revises, publishes, schedules, and revokes", async () => {
    const editorial = await authorizeMcp({
      service: service!,
      wordpress: wordpress!,
      username: username!,
      password: password!,
      scopes: SCOPE_PROFILES.editorial,
      clientName: "Editorial Publisher end-to-end editorial profile",
    });
    const editorialClient = await mcpClient(editorial.accessToken, "editorial-e2e");

    const tools = await editorialClient.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(
      TOOL_DEFINITIONS.map((tool) => tool.name).sort(),
    );
    const resources = await editorialClient.listResources();
    expect(resources.resources.length).toBeGreaterThanOrEqual(6);
    const confirmationResource = resources.resources.find((resource) =>
      resource.uri.includes("publish-confirmation"),
    );
    expect(confirmationResource).toBeDefined();
    const renderedResource = await editorialClient.readResource({
      uri: confirmationResource!.uri,
    });
    expect(JSON.stringify(renderedResource.contents)).toContain("/ui/assets/app.js");

    const site = await call(editorialClient, "wordpress_get_site", {});
    expect(site.connectionHealth).toBe("healthy");
    expect(site.siteUrl).toContain("wordpress.lvh.me");

    const search = await call(editorialClient, "wordpress_search_content", {
      query: "release safety",
      postTypes: ["post"],
      statuses: ["publish"],
      pageSize: 5,
      detail: "standard",
    });
    const searchHit = firstItem(search);
    expect(searchHit).not.toHaveProperty("content");
    expect(Buffer.byteLength(JSON.stringify(search))).toBeLessThan(32_000);

    const retrieved = await call(editorialClient, "wordpress_get_content", {
      id: Number(searchHit.id),
      representation: "markdown",
      fields: ["title", "content", "taxonomies", "links"],
    });
    expect(JSON.stringify(retrieved)).toContain("Safe releases");
    expect(JSON.stringify(retrieved)).not.toContain("<!-- wp:");

    const run = randomUUID().slice(0, 8);
    const created = await call(editorialClient, "wordpress_create_draft", {
      title: `Release-ready editorial flow ${run}`,
      content:
        "## Release confidence\n\nThis disposable article verifies the complete editorial path.\n\n- Review\n- Test\n- Revoke",
      contentFormat: "markdown",
      excerpt: "A disposable full-stack release verification article.",
      slug: `release-ready-editorial-flow-${run}`,
      categories: [],
      tags: [],
      idempotencyKey: randomUUID(),
    });
    const contentId = Number(object(created.object).id);
    let version = text(created.version);
    expect(contentId).toBeGreaterThan(0);
    expect(created.status).toBe("draft");
    expect(created.auditEventId).toBeTruthy();

    const uploaded = await call(editorialClient, "wordpress_upload_media", {
      sourceUrl: "https://s.w.org/about/images/logos/wordpress-logo-stacked-rgb.png",
      fileName: `editorial-publisher-e2e-${run}.png`,
      title: "Editorial Publisher acceptance image",
      altText: "WordPress logo used for a disposable acceptance test",
      idempotencyKey: randomUUID(),
    });
    const mediaId = Number(object(uploaded.object).id);
    expect(mediaId).toBeGreaterThan(0);

    const featured = await call(editorialClient, "wordpress_set_featured_image", {
      contentId,
      mediaId,
      expectedVersion: version,
      idempotencyKey: randomUUID(),
    });
    version = text(featured.version);
    expect(featured.changedFields).toContain("featuredMediaId");

    const categories = await call(editorialClient, "wordpress_list_terms", {
      taxonomy: "category",
      query: "Release Safety",
      pageSize: 10,
    });
    const categoryId = Number(firstItem(categories).id);
    const categoryResult = await call(editorialClient, "wordpress_assign_terms", {
      contentId,
      taxonomy: "category",
      termIds: [categoryId],
      expectedVersion: version,
      idempotencyKey: randomUUID(),
    });
    version = text(categoryResult.version);

    const tags = await call(editorialClient, "wordpress_list_terms", {
      taxonomy: "post_tag",
      query: "MCP",
      pageSize: 10,
    });
    const tagId = Number(firstItem(tags).id);
    const tagResult = await call(editorialClient, "wordpress_assign_terms", {
      contentId,
      taxonomy: "post_tag",
      termIds: [tagId],
      expectedVersion: version,
      idempotencyKey: randomUUID(),
    });
    version = text(tagResult.version);

    const seo = await call(editorialClient, "wordpress_set_seo_metadata", {
      contentId,
      expectedVersion: version,
      metadata: {
        title: "Release-ready editorial flow | Acceptance",
        description: "Disposable metadata proving the normalized SEO write and preview path.",
        focusKeyword: "release-ready editorial flow",
        robots: "noindex,follow",
      },
      idempotencyKey: randomUUID(),
    });
    version = text(seo.version);
    expect(JSON.stringify(seo.changedFields)).toContain("seo.");

    const preview = await call(editorialClient, "wordpress_get_preview", { contentId });
    expect(object(preview.featuredImage).id).toBe(mediaId);
    expect(preview.categories).toContain("Release Safety");
    expect(preview.tags).toContain("MCP");
    expect(object(preview.seo).description).toContain("Disposable metadata");

    const updated = await call(editorialClient, "wordpress_update_draft", {
      id: contentId,
      expectedVersion: version,
      title: `Release-ready editorial flow verified ${run}`,
      content:
        "## Release confidence\n\nThis disposable article passed its full review path.\n\n- Review\n- Test\n- Confirm\n- Revoke",
      contentFormat: "markdown",
      idempotencyKey: randomUUID(),
    });
    version = text(updated.version);
    expect(updated.revisionId).toBeTruthy();

    const revisions = await call(editorialClient, "wordpress_get_revisions", {
      id: contentId,
      includeDiff: true,
      pageSize: 10,
    });
    expect(Array.isArray(revisions.items) ? revisions.items.length : 0).toBeGreaterThan(0);

    const denied = await editorialClient.callTool({
      name: "wordpress_publish_post",
      arguments: {
        contentId,
        expectedVersion: version,
        confirmationToken: "not-authorized",
        idempotencyKey: randomUUID(),
      },
    });
    expect(denied.isError).toBe(true);
    expect(JSON.stringify(denied.structuredContent)).toContain("scope_missing");

    const publisher = await authorizeMcp({
      service: service!,
      wordpress: wordpress!,
      username: username!,
      password: password!,
      scopes: SCOPES,
      clientName: "Editorial Publisher end-to-end publisher profile",
    });
    const publisherClient = await mcpClient(publisher.accessToken, "publisher-e2e");
    const publisherPreview = await call(publisherClient, "wordpress_get_preview", { contentId });
    version = text(publisherPreview.version);

    const confirmation = await call(publisherClient, "wordpress_request_confirmation", {
      action: "publish",
      contentId,
      expectedVersion: version,
    });
    const confirmationToken = text(confirmation.confirmationToken);
    expect(confirmationToken.length).toBeGreaterThan(32);
    const published = await call(publisherClient, "wordpress_publish_post", {
      contentId,
      expectedVersion: version,
      confirmationToken,
      idempotencyKey: randomUUID(),
    });
    expect(published.status).toBe("publish");
    const publicUrl = text(published.publicUrl);
    expect(publicUrl).toContain(`release-ready-editorial-flow-${run}`);
    expect((await fetch(publicUrl)).status).toBe(200);

    const replay = await publisherClient.callTool({
      name: "wordpress_publish_post",
      arguments: {
        contentId,
        expectedVersion: version,
        confirmationToken,
        idempotencyKey: randomUUID(),
      },
    });
    expect(replay.isError).toBe(true);
    expect(JSON.stringify(replay.structuredContent)).toContain("confirmation_expired");

    const scheduledDraft = await call(publisherClient, "wordpress_create_draft", {
      title: `Scheduled editorial flow ${run}`,
      content: "This disposable post verifies timezone-bound scheduling.",
      contentFormat: "markdown",
      categories: [],
      tags: [],
      idempotencyKey: randomUUID(),
    });
    const scheduledId = Number(object(scheduledDraft.object).id);
    const scheduledVersion = text(scheduledDraft.version);
    const scheduledPreview = await call(publisherClient, "wordpress_get_preview", {
      contentId: scheduledId,
    });
    const siteTimezone = text(scheduledPreview.siteTimezone);
    expect(siteTimezone).not.toBe("");
    const publishAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const scheduleConfirmation = await call(publisherClient, "wordpress_request_confirmation", {
      action: "schedule",
      contentId: scheduledId,
      expectedVersion: scheduledVersion,
      publishAt,
    });
    const scheduled = await call(publisherClient, "wordpress_schedule_post", {
      contentId: scheduledId,
      expectedVersion: scheduledVersion,
      publishAt,
      siteTimezone,
      confirmationToken: text(scheduleConfirmation.confirmationToken),
      idempotencyKey: randomUUID(),
    });
    expect(scheduled.status).toBe("future");
    expect(scheduled.siteTimezone).toBe(siteTimezone);
    expect(
      Math.abs(new Date(text(scheduled.scheduledAtUtc)).getTime() - new Date(publishAt).getTime()),
    ).toBeLessThan(1_000);

    await revokeWordPressConnection(publisher.browser, wordpress!, publisher.connectionId);
    const afterRevocation = await publisherClient.callTool({
      name: "wordpress_get_site",
      arguments: {},
    });
    expect(afterRevocation.isError).toBe(true);
    expect(JSON.stringify(afterRevocation.structuredContent)).toContain("connection_expired");
  }, 120_000);
});
