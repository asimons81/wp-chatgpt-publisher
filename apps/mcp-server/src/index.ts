import { config } from "./config.js";
import { createApp } from "./app.js";
import { logger } from "./logger.js";
import { PostgresRepository } from "./storage/postgres.js";

const repository = new PostgresRepository(config.databaseUrl);
await repository.migrate();
const app = createApp(repository);
const server = app.listen(config.port, "0.0.0.0", () =>
  logger.info({ port: config.port, outcome: "started" }, "MCP server ready"),
);
const shutdown = (signal: string) => {
  logger.info({ signal }, "Shutting down");
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, "Shutdown failed");
      process.exitCode = 1;
    }
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
