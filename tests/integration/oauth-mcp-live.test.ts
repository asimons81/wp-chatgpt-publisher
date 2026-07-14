import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import { SCOPES } from "@wp-chatgpt-publisher/contracts";
import { TOOL_DEFINITIONS } from "@wp-chatgpt-publisher/tool-schemas";

const service = process.env.WPCP_TEST_MCP_BASE_URL;
const wordpress = process.env.WPCP_TEST_WP_URL;
const username = process.env.WPCP_TEST_WP_USER;
const password = process.env.WPCP_TEST_WP_PASSWORD;
const live = service && wordpress && username && password ? describe : describe.skip;

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
const text = (value: unknown): string => (typeof value === "string" ? value : "");

class CookieJar {
  readonly #values = new Map<string, string>();

  capture(response: Response): void {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const fallback = response.headers.get("set-cookie");
    const values = headers.getSetCookie?.() ?? (fallback ? [fallback] : []);
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      if (!pair) continue;
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      this.#values.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.#values.size)
      headers.set(
        "cookie",
        [...this.#values.entries()].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    const response = await fetch(url, { ...init, headers, redirect: "manual" });
    this.capture(response);
    return response;
  }
}

function inputValue(html: string, name: string): string {
  for (const tag of html.match(/<input\b[^>]*>/gi) ?? []) {
    const attributes = new Map(
      [...tag.matchAll(/\b([A-Za-z0-9_:-]+)=["']([^"']*)["']/g)].map((match) => [
        match[1]?.toLowerCase() ?? "",
        match[2] ?? "",
      ]),
    );
    if (attributes.get("name") === name) return attributes.get("value") ?? "";
  }
  return "";
}

async function json(response: Response): Promise<ObjectValue> {
  return object((await response.json()) as unknown);
}

live("complete OAuth, WordPress approval, and MCP workflow", () => {
  it("connects, rotates tokens, discovers tools, and enforces single-use publish confirmation", async () => {
    const callback = "http://localhost:9999/oauth/callback";
    const registration = await fetch(`${service}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Editorial Publisher for ChatGPT integration",
        redirect_uris: [callback],
      }),
    });
    expect(registration.status).toBe(201);
    const clientId = text((await json(registration)).client_id);
    expect(clientId).not.toBe("");

    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = randomUUID();
    const authorize = new URL(`${service}/oauth/authorize`);
    authorize.search = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: callback,
      state,
      resource: `${service}/mcp`,
      scope: SCOPES.join(" "),
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    const authorization = await fetch(authorize);
    expect(authorization.status).toBe(200);
    const flowId = inputValue(await authorization.text(), "flow_id");
    expect(flowId).not.toBe("");

    const start = await fetch(`${service}/connect/start`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ flow_id: flowId, site_url: wordpress! }),
      redirect: "manual",
    });
    expect(start.status).toBe(303);
    const approvalUrl = start.headers.get("location") ?? "";
    expect(approvalUrl).toContain("page=wpcp-approve");

    const browser = new CookieJar();
    await browser.fetch(`${wordpress}/wp-login.php`);
    const login = await browser.fetch(`${wordpress}/wp-login.php`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        log: username!,
        pwd: password!,
        "wp-submit": "Log In",
        redirect_to: approvalUrl,
        testcookie: "1",
      }),
    });
    expect(login.status).toBeGreaterThanOrEqual(300);
    expect(login.status).toBeLessThan(400);

    const approval = await browser.fetch(approvalUrl);
    const approvalHtml = await approval.text();
    const approvalDiagnostics = approvalHtml.replace(
      /[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[signed request]",
    );
    expect(approval.status, approvalDiagnostics).toBe(200);
    const nonce = inputValue(approvalHtml, "_wpnonce");
    const requestToken = inputValue(approvalHtml, "request");
    expect(nonce, approvalDiagnostics).not.toBe("");
    expect(requestToken.split(".")).toHaveLength(3);

    const approvalBody = new URLSearchParams({ _wpnonce: nonce, request: requestToken });
    for (const scope of SCOPES) approvalBody.append("scopes[]", scope);
    const approved = await browser.fetch(approvalUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: approvalBody,
    });
    const approvedDiagnostics = (await approved.clone().text()).replace(
      /[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[signed request]",
    );
    expect(approved.status, approvedDiagnostics).toBeGreaterThanOrEqual(300);
    expect(approved.status).toBeLessThan(400);
    const serviceCallback = approved.headers.get("location") ?? "";
    expect(serviceCallback).toContain("/connect/callback");

    const callbackResponse = await fetch(serviceCallback, { redirect: "manual" });
    expect(callbackResponse.status).toBe(303);
    const returned = new URL(callbackResponse.headers.get("location") ?? callback);
    expect(returned.searchParams.get("state")).toBe(state);
    const code = returned.searchParams.get("code") ?? "";
    expect(code).not.toBe("");

    const tokenResponse = await fetch(`${service}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: verifier,
        redirect_uri: callback,
      }),
    });
    expect(tokenResponse.status).toBe(200);
    const tokens = await json(tokenResponse);
    const accessToken = text(tokens.access_token);
    const refreshToken = text(tokens.refresh_token);
    expect(accessToken.split(".")).toHaveLength(3);
    expect(refreshToken.length).toBeGreaterThan(32);

    const rotation = await fetch(`${service}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: refreshToken,
      }),
    });
    expect(rotation.status).toBe(200);
    const rotated = await json(rotation);
    expect(text(rotated.refresh_token)).not.toBe(refreshToken);
    const replay = await fetch(`${service}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: refreshToken,
      }),
    });
    expect(replay.status).toBe(401);

    const client = new Client({ name: "wpcp-live-e2e", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${service}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
    });
    await client.connect(transport);
    try {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(
        TOOL_DEFINITIONS.map((tool) => tool.name).sort(),
      );
      for (const tool of listed.tools) {
        expect(tool.annotations?.openWorldHint).toBe(false);
        expect(object(tool._meta).securitySchemes).toBeDefined();
      }
      const site = await client.callTool({ name: "wordpress_get_site", arguments: {} });
      expect(site.isError).not.toBe(true);
      expect(JSON.stringify(site.structuredContent)).toContain("healthy");

      const draft = await client.callTool({
        name: "wordpress_create_draft",
        arguments: {
          title: "OAuth MCP End-to-End Draft",
          content: "## Verified\n\nCreated through the actual MCP transport.",
          contentFormat: "markdown",
          categories: [],
          tags: [],
          idempotencyKey: randomUUID(),
        },
      });
      expect(draft.isError).not.toBe(true);
      const draftData = object(draft.structuredContent);
      const draftObject = object(draftData.object);
      const contentId = Number(draftObject.id);
      const expectedVersion = text(draftData.version);
      expect(contentId).toBeGreaterThan(0);
      expect(expectedVersion).not.toBe("");

      const confirmation = await client.callTool({
        name: "wordpress_request_confirmation",
        arguments: { action: "publish", contentId, expectedVersion },
      });
      expect(confirmation.isError).not.toBe(true);
      const confirmationToken = text(object(confirmation.structuredContent).confirmationToken);
      expect(confirmationToken.length).toBeGreaterThan(32);

      const publishArguments = {
        contentId,
        expectedVersion,
        confirmationToken,
        idempotencyKey: randomUUID(),
      };
      const published = await client.callTool({
        name: "wordpress_publish_post",
        arguments: publishArguments,
      });
      expect(published.isError).not.toBe(true);
      expect(object(published.structuredContent).status).toBe("publish");

      const replayedConfirmation = await client.callTool({
        name: "wordpress_publish_post",
        arguments: { ...publishArguments, idempotencyKey: randomUUID() },
      });
      expect(replayedConfirmation.isError).toBe(true);
      expect(JSON.stringify(replayedConfirmation.structuredContent)).toContain(
        "confirmation_expired",
      );
    } finally {
      await client.close();
    }
  });
});
