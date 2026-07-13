import { describe, expect, it } from "vitest";
import {
  issueAccessToken,
  issueConnectionRequest,
  verifyAccessToken,
  verifyConnectionRequest,
  verifyPkce,
} from "../../apps/mcp-server/src/auth/tokens.js";
import { createHash, randomUUID } from "node:crypto";

describe("signed WordPress connection requests", () => {
  it("verifies issuer, audience, site, and scopes", async () => {
    const token = await issueConnectionRequest(
      "1a0c3476-754c-41a5-96cb-c26d9449c27d",
      "https://wordpress.example",
      ["site:read", "drafts:write"],
    );
    await expect(verifyConnectionRequest(token)).resolves.toMatchObject({
      flowId: "1a0c3476-754c-41a5-96cb-c26d9449c27d",
      siteUrl: "https://wordpress.example",
      serviceUrl: "http://127.0.0.1:8787",
      scopes: ["site:read", "drafts:write"],
    });
  });

  it("rejects payload tampering", async () => {
    const token = await issueConnectionRequest(
      "1a0c3476-754c-41a5-96cb-c26d9449c27d",
      "https://wordpress.example",
      ["site:read"],
    );
    const [header, payload, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    decoded.scope = "site:read publish:execute";
    const tampered = `${header}.${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${signature}`;
    await expect(verifyConnectionRequest(tampered)).rejects.toMatchObject({
      code: "authentication_required",
    });
  });

  it("issues audience-bound access tokens with validated scopes", async () => {
    const connectionId = randomUUID();
    const token = await issueAccessToken({
      subject: "wordpress-user-7",
      clientId: "chatgpt-test-client",
      connectionId,
      scopes: ["site:read", "content:read"],
      audience: "http://127.0.0.1:8787",
    });
    await expect(verifyAccessToken(token)).resolves.toMatchObject({
      subject: "wordpress-user-7",
      clientId: "chatgpt-test-client",
      connectionId,
      scopes: ["site:read", "content:read"],
      audience: "http://127.0.0.1:8787",
    });
    await expect(verifyAccessToken(token, "https://wrong.example")).rejects.toMatchObject({
      code: "authentication_required",
    });
  });

  it("validates S256 PKCE without accepting another verifier", () => {
    const verifier = "A".repeat(64);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce(`${verifier}B`, challenge)).toBe(false);
  });
});
