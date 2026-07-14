import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../apps/mcp-server/src/app.js";
import { config } from "../../apps/mcp-server/src/config.js";
import type {
  AuthorizationFlow,
  Repository,
} from "../../apps/mcp-server/src/storage/repository.js";

describe("OAuth HTTP contract", () => {
  let server: Server;
  let baseUrl: string;
  let createdFlow: AuthorizationFlow | undefined;

  beforeEach(async () => {
    createdFlow = undefined;
    const repository = {
      getClient: (id: string) =>
        Promise.resolve(
          id === "chatgpt-client"
            ? {
                id,
                redirectUris: ["http://localhost:9999/oauth/callback"],
                name: "ChatGPT",
                createdAt: new Date().toISOString(),
              }
            : null,
        ),
      createFlow: (flow: AuthorizationFlow) => {
        createdFlow = flow;
        return Promise.resolve();
      },
    } as unknown as Repository;

    server = createApp(repository).listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  function authorizeUrl(resource: string): URL {
    const url = new URL("/oauth/authorize", baseUrl);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: "chatgpt-client",
      redirect_uri: "http://localhost:9999/oauth/callback",
      state: "state",
      resource,
      scope: "site:read",
      code_challenge: "challenge",
      code_challenge_method: "S256",
    }).toString();
    return url;
  }

  it("publishes the MCP endpoint as the canonical protected resource", async () => {
    const response = await fetch(new URL("/.well-known/oauth-protected-resource", baseUrl));
    const metadata = (await response.json()) as { resource?: string };

    expect(response.status).toBe(200);
    expect(metadata.resource).toBe(config.mcpResourceUrl);
  });

  it("allows the OAuth form navigation to continue to an HTTPS WordPress site", async () => {
    const response = await fetch(authorizeUrl(config.mcpResourceUrl));
    const policy = response.headers.get("content-security-policy") ?? "";

    expect(response.status).toBe(200);
    expect(policy).toContain("form-action 'self' https:");
    expect(createdFlow?.resource).toBe(config.mcpResourceUrl);
  });

  it("rejects a resource identifier that does not match the MCP endpoint", async () => {
    const response = await fetch(authorizeUrl(config.publicBaseUrl));

    expect(response.status).toBe(400);
    expect(createdFlow).toBeUndefined();
  });
});
