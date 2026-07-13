import { beforeAll, describe, expect, it } from "vitest";

const base = process.env.WPCP_TEST_WP_URL;
const editorialToken = process.env.WPCP_TEST_EDITORIAL_TOKEN;
const publisherToken = process.env.WPCP_TEST_PUBLISHER_TOKEN;
const live = base && editorialToken && publisherToken ? describe : describe.skip;
let createdDraftId = 0;
let createdVersion = "";

async function call(
  path: string,
  token: string | null,
  body?: Record<string, unknown>,
  method = "POST",
) {
  const response = await fetch(`${base}/wp-json/wp-chatgpt-publisher/v1${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      "x-wpcp-request-id": crypto.randomUUID(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await response.json()) as Record<string, unknown>;
  return { response, data };
}

live("live WordPress REST integration", () => {
  beforeAll(() => {
    expect(base).toMatch(/^https?:\/\//);
  });
  it("discovers the installed plugin publicly", async () => {
    const { response, data } = await call("/discovery", null, undefined, "GET");
    expect(response.status).toBe(200);
    expect(data.version).toBe("1.0.0");
  });
  it("rejects missing authentication", async () => {
    const { response } = await call("/site", null, undefined, "GET");
    expect(response.status).toBe(401);
  });
  it("returns a compact authorized site response", async () => {
    const { response, data } = await call("/site", editorialToken!, undefined, "GET");
    expect(response.status).toBe(200);
    expect(data.connectionHealth).toBe("healthy");
    expect(JSON.stringify(data)).not.toContain(editorialToken);
  });
  it("searches summaries without article bodies", async () => {
    const { response, data } = await call("/content/search", editorialToken!, {
      query: "release safety",
      postTypes: ["post"],
      statuses: ["publish"],
      pageSize: 10,
    });
    expect(response.status).toBe(200);
    const items = data.items as Record<string, unknown>[];
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).not.toHaveProperty("content");
    expect(Buffer.byteLength(JSON.stringify(data))).toBeLessThan(32_000);
  });
  it("creates one draft across an idempotent retry", async () => {
    const idempotencyKey = crypto.randomUUID();
    const input = {
      postType: "post",
      title: "Live Integration Draft",
      content: "## Verified\n\nA real WordPress draft.",
      contentFormat: "markdown",
      categories: [],
      tags: [],
      idempotencyKey,
    };
    const first = await call("/drafts", editorialToken!, input);
    const second = await call("/drafts", editorialToken!, input);
    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    createdDraftId = Number((first.data.object as Record<string, unknown>).id);
    createdVersion = String(first.data.version);
    expect((second.data.object as Record<string, unknown>).id).toBe(createdDraftId);
  });
  it("detects a stale update", async () => {
    const good = await call(
      "/drafts",
      editorialToken!,
      {
        id: createdDraftId,
        expectedVersion: createdVersion,
        title: "Updated Live Integration Draft",
        idempotencyKey: crypto.randomUUID(),
      },
      "PATCH",
    );
    expect(good.response.status).toBe(200);
    const stale = await call(
      "/drafts",
      editorialToken!,
      {
        id: createdDraftId,
        expectedVersion: createdVersion,
        excerpt: "stale",
        idempotencyKey: crypto.randomUUID(),
      },
      "PATCH",
    );
    expect(stale.response.status).toBe(409);
  });
  it("denies publishing to an editorial connection", async () => {
    const preview = await call("/preview", editorialToken!, { contentId: createdDraftId });
    const denied = await call("/publish", editorialToken!, {
      contentId: createdDraftId,
      expectedVersion: preview.data.version,
      confirmationToken: "server-only",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(denied.response.status).toBe(403);
  });
  it("rejects a loopback media URL before downloading", async () => {
    const result = await call("/media/upload", editorialToken!, {
      sourceUrl: "http://127.0.0.1/private.png",
      fileName: "private.png",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(result.response.status).toBe(400);
    expect(JSON.stringify(result.data)).not.toMatch(/private network response|localhost body/i);
  });
});
