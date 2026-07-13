import { createHash } from "node:crypto";

type StatusClass = "2xx" | "3xx" | "4xx" | "5xx";

export class HttpMetrics {
  readonly #startedAt = Date.now();
  readonly #counts = new Map<string, number>();
  readonly #durationSeconds = new Map<string, number>();

  observe(method: string, statusCode: number, durationMs: number): void {
    const normalizedMethod = /^[A-Z]+$/.test(method) ? method : "OTHER";
    const statusClass = this.#statusClass(statusCode);
    const key = `${normalizedMethod}:${statusClass}`;
    this.#counts.set(key, (this.#counts.get(key) ?? 0) + 1);
    this.#durationSeconds.set(key, (this.#durationSeconds.get(key) ?? 0) + durationMs / 1000);
  }

  render(): string {
    const lines = [
      "# HELP wpcp_process_uptime_seconds Process uptime in seconds.",
      "# TYPE wpcp_process_uptime_seconds gauge",
      `wpcp_process_uptime_seconds ${Math.max(0, (Date.now() - this.#startedAt) / 1000)}`,
      "# HELP wpcp_http_requests_total HTTP requests handled by method and status class.",
      "# TYPE wpcp_http_requests_total counter",
    ];
    for (const key of [...this.#counts.keys()].sort()) {
      const [method, statusClass] = key.split(":");
      lines.push(
        `wpcp_http_requests_total{method="${method}",status_class="${statusClass}"} ${this.#counts.get(key)}`,
      );
    }
    lines.push(
      "# HELP wpcp_http_request_duration_seconds_total Total HTTP request duration by method and status class.",
      "# TYPE wpcp_http_request_duration_seconds_total counter",
    );
    for (const key of [...this.#durationSeconds.keys()].sort()) {
      const [method, statusClass] = key.split(":");
      lines.push(
        `wpcp_http_request_duration_seconds_total{method="${method}",status_class="${statusClass}"} ${this.#durationSeconds.get(key)}`,
      );
    }
    return `${lines.join("\n")}\n`;
  }

  #statusClass(statusCode: number): StatusClass {
    if (statusCode >= 500) return "5xx";
    if (statusCode >= 400) return "4xx";
    if (statusCode >= 300) return "3xx";
    return "2xx";
  }
}

export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("base64url").slice(0, 16);
}
