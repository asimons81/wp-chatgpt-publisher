import { describe, expect, it } from "vitest";
import { TOOL_DEFINITIONS, annotationsFor } from "@wp-chatgpt-publisher/tool-schemas";

describe("static tool policy", () => {
  it("uses a stable WordPress prefix with no administrative non-goals", () => {
    for (const tool of TOOL_DEFINITIONS) expect(tool.name).toMatch(/^wordpress_[a-z_]+$/);
    const names = TOOL_DEFINITIONS.map((tool) => tool.name).join(" ");
    expect(names).not.toMatch(
      /users_manage|plugins_manage|themes_manage|database|filesystem|execute_code|delete/,
    );
  });
  it("marks every tool accurately", () => {
    for (const tool of TOOL_DEFINITIONS) {
      const annotations = annotationsFor(tool.risk);
      expect(annotations.readOnlyHint).toBe(tool.risk === "read");
      expect(annotations.destructiveHint).toBe(tool.risk === "consequential");
    }
  });
  it("never derives tool descriptions from WordPress content", () => {
    for (const tool of TOOL_DEFINITIONS)
      expect(tool.description).not.toMatch(/ignore previous|system prompt|site content/i);
  });
});
