import type { AddressInfo } from "node:net";
import type { Repository } from "../../apps/mcp-server/src/storage/repository.js";
import { createApp } from "../../apps/mcp-server/src/app.js";

const repository = { ping: () => Promise.resolve() } as unknown as Repository;
const server = createApp(repository).listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));

try {
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/metrics`);
  const body = await response.text();
  if (
    response.status !== 200 ||
    response.headers.get("cache-control") !== "no-store" ||
    !response.headers.get("content-type")?.includes("text/plain") ||
    !body.includes("# TYPE wpcp_http_requests_total counter")
  )
    throw new Error("Enabled metrics endpoint did not return the expected response.");
  process.stdout.write("WPCP_METRICS_OK\n");
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
