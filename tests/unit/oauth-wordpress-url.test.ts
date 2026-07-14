import { describe, expect, it } from "vitest";
import { canonicalWordPressSiteUrl } from "../../apps/mcp-server/src/auth/oauth.js";

describe("WordPress canonical site discovery", () => {
  it("uses the REST API link to adopt WordPress's configured www host", () => {
    expect(
      canonicalWordPressSiteUrl(
        "https://example.com",
        '<https://www.example.com/wp-json/>; rel="https://api.w.org/"',
      ),
    ).toBe("https://www.example.com");
  });

  it("preserves a subdirectory WordPress installation", () => {
    expect(
      canonicalWordPressSiteUrl(
        "https://example.com/blog",
        '<https://example.com/blog/wp-json/>; rel="https://api.w.org/"',
      ),
    ).toBe("https://example.com/blog");
  });

  it("keeps the validated input when the Link header is absent or unrelated", () => {
    expect(canonicalWordPressSiteUrl("https://example.com", null)).toBe("https://example.com");
    expect(
      canonicalWordPressSiteUrl(
        "https://example.com",
        '<https://example.com/feed/>; rel="alternate"',
      ),
    ).toBe("https://example.com");
  });
});
