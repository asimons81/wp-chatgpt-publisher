import { describe, expect, it } from "vitest";
import { config } from "../../apps/mcp-server/src/config.js";
import {
  isAcceptedOAuthResource,
  OAUTH_FORM_ACTION,
} from "../../apps/mcp-server/src/auth/oauth-policy.js";

describe("OAuth browser and resource policy", () => {
  it("allows the form to hand off only to self or HTTPS destinations", () => {
    expect(OAUTH_FORM_ACTION).toEqual(["'self'", "https:"]);
  });

  it("accepts the canonical service and endpoint resource identifiers", () => {
    expect(isAcceptedOAuthResource(config.publicBaseUrl)).toBe(true);
    expect(isAcceptedOAuthResource(config.mcpResourceUrl)).toBe(true);
    expect(isAcceptedOAuthResource("https://unrelated.example/mcp")).toBe(false);
  });
});
