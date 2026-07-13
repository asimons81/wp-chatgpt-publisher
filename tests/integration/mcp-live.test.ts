import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import { TOOL_DEFINITIONS } from "@wp-chatgpt-publisher/tool-schemas";

const endpoint = process.env.WPCP_TEST_MCP_URL;
const accessToken = process.env.WPCP_TEST_MCP_TOKEN;
const live = endpoint && accessToken ? describe : describe.skip;

live("actual MCP Streamable HTTP integration", () => {
  it("discovers static tools and calls WordPress through the real transport", async () => {
    const client = new Client({ name: "wpcp-integration", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(endpoint!), {
      requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
    });
    await client.connect(transport);
    try {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(
        TOOL_DEFINITIONS.map((tool) => tool.name).sort(),
      );
      for (const tool of listed.tools) {
        expect(tool.annotations?.readOnlyHint).toBeTypeOf("boolean");
        expect(tool.annotations?.destructiveHint).toBeTypeOf("boolean");
      }
      const result = await client.callTool({ name: "wordpress_get_site", arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result)).toContain("healthy");
    } finally {
      await client.close();
    }
  });
});
