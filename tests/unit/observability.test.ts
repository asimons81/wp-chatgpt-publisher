import { describe, expect, it } from "vitest";
import {
  errorLogSerializer,
  requestLogSerializer,
  responseLogSerializer,
} from "../../apps/mcp-server/src/logger.js";
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

  it("removes query strings and secrets from structured log fields", () => {
    const request = requestLogSerializer({
      id: "request-1",
      method: "GET",
      url: "/connect/callback?flow=flow-secret&grant=grant-secret#fragment",
    });
    const error = errorLogSerializer(
      new Error("Failed https://example.test/callback?code=oauth-secret&request=jwt-secret"),
    );
    const response = responseLogSerializer({
      statusCode: 302,
      headers: { location: "/done?grant=response-grant-secret" },
    });

    expect(request).toEqual({ id: "request-1", method: "GET", path: "/connect/callback" });
    expect(JSON.stringify(request)).not.toContain("grant-secret");
    expect(JSON.stringify(error)).not.toContain("oauth-secret");
    expect(JSON.stringify(error)).not.toContain("jwt-secret");
    expect(response).toEqual({ statusCode: 302 });
    expect(JSON.stringify(response)).not.toContain("response-grant-secret");
  });
});
