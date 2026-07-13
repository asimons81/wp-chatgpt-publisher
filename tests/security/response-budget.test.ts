import { describe, expect, it } from "vitest";
import { TOOL_DEFINITIONS } from "@wp-chatgpt-publisher/tool-schemas";

describe("context budget", () => {
  it("keeps the complete static tool inventory compact", () => {
    expect(
      Buffer.byteLength(
        JSON.stringify(
          TOOL_DEFINITIONS.map(({ name, title, description, requiredScopes, risk }) => ({
            name,
            title,
            description,
            requiredScopes,
            risk,
          })),
        ),
      ),
    ).toBeLessThan(20_000);
  });
});
