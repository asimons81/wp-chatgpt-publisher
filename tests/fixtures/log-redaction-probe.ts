import type { AddressInfo } from "node:net";
import type { Repository } from "../../apps/mcp-server/src/storage/repository.js";
import { createApp } from "../../apps/mcp-server/src/app.js";

const repository = { ping: () => Promise.resolve() } as unknown as Repository;
const app = createApp(repository);
app.get("/log-redaction-redirect", (_request, response) =>
  response.redirect(
    "/done?code=response-code-secret&grant=response-grant-secret&request=response-jwt-secret",
  ),
);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));

try {
  const { port } = server.address() as AddressInfo;
  const response = await fetch(
    `http://127.0.0.1:${port}/healthz?code=oauth-code-secret&grant=grant-secret&request=jwt-secret&ordinary=value`,
  );
  if (response.status !== 200) throw new Error("Log redaction probe request failed.");
  await response.text();

  const redirect = await fetch(`http://127.0.0.1:${port}/log-redaction-redirect`, {
    redirect: "manual",
  });
  if (redirect.status !== 302) throw new Error("Log redaction redirect probe failed.");
  await redirect.text();

  const malformed = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  const malformedBody = (await malformed.json()) as { error?: { code?: string } };
  if (malformed.status !== 400 || malformedBody.error?.code !== "validation_error") {
    throw new Error("Malformed JSON did not produce a safe validation response.");
  }
  await new Promise((resolve) => setTimeout(resolve, 25));
  process.stdout.write("WPCP_LOG_REDACTION_OK\n");
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
