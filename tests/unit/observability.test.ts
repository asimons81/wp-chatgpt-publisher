import { describe, expect, it } from "vitest";
import { hashIdentifier, HttpMetrics } from "../../apps/mcp-server/src/observability.js";

describe("observability", () => {
  it("exports bounded low-cardinality HTTP metrics", () => {
    const metrics = new HttpMetrics();
    metrics.observe("GET", 200, 125);
    metrics.observe("GET", 404, 25);
    const output = metrics.render();

    expect(output).toContain('wpcp_http_requests_total{method="GET",status_class="2xx"} 1');
    expect(output).toContain('wpcp_http_requests_total{method="GET",status_class="4xx"} 1');
    expect(output).toContain(
      'wpcp_http_request_duration_seconds_total{method="GET",status_class="2xx"} 0.125',
    );
    expect(output).not.toContain("/healthz");
  });

  it("hashes connection identifiers into stable non-reversible log labels", () => {
    const raw = "connection-secret-123";
    const first = hashIdentifier(raw);

    expect(first).toBe(hashIdentifier(raw));
    expect(first).toHaveLength(16);
    expect(first).not.toContain(raw);
  });
});
