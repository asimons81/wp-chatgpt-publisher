import type { ToolResultMessage } from "./types.js";

type Listener = (value: unknown) => void;
const listeners = new Set<Listener>();
const fixtureName = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get("fixture")
  : null;
const fixtures: Record<string, unknown> = {
  site: {
    siteName: "Editorial Lab",
    siteUrl: "https://wordpress.example.test",
    wordpressVersion: "6.9.4",
    userDisplayName: "Publisher Editor",
    seoAdapter: "native",
    connectionHealth: "healthy",
    scopes: [
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
  },
  search: {
    items: [
      {
        id: 42,
        type: "post",
        title: "Release Safety Handbook",
        excerpt: "A practical guide to review, rollback, checksums, and access revocation.",
        status: "publish",
        wordCount: 846,
        modified: "2026-07-12T20:14:00Z",
      },
      {
        id: 57,
        type: "page",
        title: "Editorial standards",
        excerpt: "The house checklist for accurate, accessible, and reversible publishing.",
        status: "draft",
        wordCount: 514,
        modified: "2026-07-12T18:31:00Z",
      },
    ],
    pagination: { nextCursor: "page-2", returned: 2, total: 8, truncated: true },
  },
  media: {
    items: [
      {
        id: 91,
        title: "Release checklist on a desk",
        mimeType: "image/webp",
        altText: "A printed release checklist beside a keyboard",
        thumbnailUrl: "https://placehold.co/160x160/193228/e8f4ed?text=Release",
        width: 1600,
        height: 1200,
      },
      {
        id: 92,
        title: "Editorial planning board",
        mimeType: "image/jpeg",
        altText: "Editorial tasks arranged on a planning board",
        thumbnailUrl: "https://placehold.co/160x160/355243/f3f8f5?text=Plan",
        width: 1800,
        height: 1200,
      },
    ],
    pagination: { returned: 2, total: 2, truncated: false },
  },
  taxonomy: {
    items: [
      {
        name: "category",
        label: "Categories",
        hierarchical: true,
        postTypes: ["post"],
        canAssign: true,
      },
      {
        name: "post_tag",
        label: "Tags",
        hierarchical: false,
        postTypes: ["post"],
        canAssign: true,
      },
    ],
  },
  review: {
    action: "publish",
    confirmationToken: "development-confirmation-token",
    expiresInSeconds: 300,
    review: {
      id: 84,
      site: "Editorial Lab",
      title: "A safer release workflow for small teams",
      postType: "post",
      status: "draft",
      intendedStatus: "publish",
      version: "development-version",
      author: "Publisher Editor",
      slug: "safer-release-workflow",
      categories: ["Release Safety"],
      tags: ["MCP", "WordPress"],
      wordCount: 1268,
      featuredImage: { id: 91, title: "Release checklist on a desk" },
      seo: {
        title: "A safer release workflow | Editorial Lab",
        description: "A practical, reversible publishing workflow for small editorial teams.",
      },
      siteTimezone: "America/Chicago",
      warnings: ["The canonical URL is not set."],
    },
  },
  seo: {
    provider: "native",
    metadata: {
      title: "A safer release workflow | Editorial Lab",
      description: "A practical, reversible publishing workflow for small editorial teams.",
      focusKeyword: "safe release workflow",
      robots: "index,follow",
    },
    support: {
      title: true,
      description: true,
      focusKeyword: true,
      canonicalUrl: true,
      socialTitle: true,
      socialDescription: true,
      socialImageId: true,
      robots: true,
    },
  },
  write: {
    object: { type: "post", id: 84 },
    changedFields: ["title", "content", "seo.description"],
    status: "draft",
    revisionId: 126,
    auditEventId: "75e5261b-5095-43e6-aa9f-90213f012345",
    previewUrl: "https://wordpress.example.test/?p=84&preview=true",
    editUrl: "https://wordpress.example.test/wp-admin/post.php?post=84&action=edit",
  },
  error: {
    error: {
      code: "connection_expired",
      message: "This WordPress connection is no longer active.",
      remediation: "Reconnect the site, then retry this action.",
      requestId: "713db26a-5ae8-42d0-a03f-1ed34ea01234",
    },
  },
};
let current: unknown =
  window.openai?.toolOutput ?? (fixtureName ? fixtures[fixtureName] : undefined);
window.addEventListener("openai:set_globals", (event) => {
  const detail = (event as CustomEvent<{ globals?: { toolOutput?: unknown } }>).detail;
  if (detail?.globals?.toolOutput !== undefined) publish(detail.globals.toolOutput);
});
window.addEventListener(
  "message",
  (event) => {
    if (event.source !== window.parent) return;
    const value = event.data as { jsonrpc?: string; method?: string; params?: ToolResultMessage };
    if (value?.jsonrpc === "2.0" && value.method === "ui/notifications/tool-result")
      publish(value.params?.structuredContent);
  },
  { passive: true },
);
function publish(value: unknown): void {
  current = value;
  for (const listener of listeners) listener(value);
}
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function snapshot(): unknown {
  return current;
}
export async function callTool(
  name: string,
  input: Record<string, unknown>,
): Promise<ToolResultMessage | null> {
  if (fixtureName) {
    const result = {
      structuredContent: {
        object: { type: "post", id: input.contentId ?? input.id ?? 84 },
        changedFields: [name.replace("wordpress_", "")],
        status: name === "wordpress_publish_post" ? "publish" : "draft",
        auditEventId: crypto.randomUUID(),
        publicUrl:
          name === "wordpress_publish_post"
            ? "https://wordpress.example.test/safer-release-workflow/"
            : undefined,
      },
    } satisfies ToolResultMessage;
    publish(result.structuredContent);
    return result;
  }
  if (window.openai?.callTool) {
    const result = await window.openai.callTool(name, input);
    publish(result.structuredContent);
    return result;
  }
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, 15_000);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const message = event.data as { id?: string; result?: ToolResultMessage; error?: unknown };
      if (message?.id !== id) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      if (message.result?.structuredContent !== undefined)
        publish(message.result.structuredContent);
      resolve(message.result ?? null);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: input } },
      "*",
    );
  });
}
