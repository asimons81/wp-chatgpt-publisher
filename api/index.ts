import { createApp } from "../apps/mcp-server/src/app.js";
import { config } from "../apps/mcp-server/src/config.js";
import { PostgresRepository } from "../apps/mcp-server/src/storage/postgres.js";

const repository = new PostgresRepository(config.databaseUrl);
await repository.migrate();

export default createApp(repository);
