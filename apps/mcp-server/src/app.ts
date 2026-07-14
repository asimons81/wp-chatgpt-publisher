import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { VERSION } from "@wp-chatgpt-publisher/contracts";
import { config } from "./config.js";
import { AppError, toAppError } from "./errors.js";
import { createOAuthRouter } from "./auth/oauth.js";
import { challengeHeader, requireAccessToken } from "./auth/middleware.js";
import {
  errorLogSerializer,
  logger,
  requestLogSerializer,
  responseLogSerializer,
} from "./logger.js";
import { McpService } from "./mcp/server.js";
import { HttpMetrics } from "./observability.js";
import type { Repository } from "./storage/repository.js";

export function createApp(repository: Repository) {
  const app = express();
  const metrics = new HttpMetrics();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(
    pinoHttp({
      logger,
      genReqId: (request) =>
        typeof request.headers["x-request-id"] === "string"
          ? request.headers["x-request-id"]
          : randomUUID(),
      customProps: (request) => ({ requestId: request.id }),
      wrapSerializers: false,
      serializers: {
        err: errorLogSerializer,
        req: requestLogSerializer,
        res: responseLogSerializer,
      },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          // The OAuth form posts locally, then intentionally redirects to the
          // HTTPS WordPress site that passed discovery and SSRF validation.
          formAction: ["'self'", "https:"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
        },
      },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, !origin || config.allowedOrigins.includes(origin));
      },
      methods: ["GET", "POST", "DELETE"],
      allowedHeaders: [
        "authorization",
        "content-type",
        "mcp-session-id",
        "mcp-protocol-version",
        "x-request-id",
      ],
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skip: (request) => request.path === "/healthz",
    }),
  );
  app.use((request, response, next) => {
    const startedAt = performance.now();
    response.on("finish", () => {
      metrics.observe(request.method, response.statusCode, performance.now() - startedAt);
    });
    next();
  });
  app.get("/healthz", (_request, response) => response.json({ status: "ok", version: VERSION }));
  app.get("/readyz", async (_request, response) => {
    try {
      await repository.ping();
      response.json({ status: "ready" });
    } catch {
      response.status(503).json({ status: "not_ready" });
    }
  });
  app.get("/version", (_request, response) =>
    response.json({ name: "wp-chatgpt-publisher", version: VERSION, protocol: "mcp" }),
  );
  if (config.metricsEnabled)
    app.get("/metrics", (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.type("text/plain; version=0.0.4; charset=utf-8").send(metrics.render());
    });
  app.use(createOAuthRouter(repository));
  app.use(
    "/ui",
    express.static(resolve(process.cwd(), "apps/chatgpt-ui/dist"), {
      fallthrough: false,
      immutable: true,
      maxAge: "1y",
      setHeaders(response) {
        response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      },
    }),
  );
  const mcp = new McpService(repository);
  app.all(
    "/mcp",
    express.json({ limit: "2mb" }),
    requireAccessToken,
    async (request, response, next) => {
      try {
        if (!request.toolContext)
          throw new AppError("authentication_required", "Authentication is required.", 401);
        const server = mcp.createServer(request.toolContext);
        const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
        response.on("close", () => {
          void transport.close();
          void server.close();
        });
        // SDK 1.29's transport declarations are incompatible with
        // exactOptionalPropertyTypes even though the runtime class implements Transport.
        await server.connect(transport as unknown as Transport);
        await transport.handleRequest(request, response, request.body);
      } catch (error) {
        next(error);
      }
    },
  );
  const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
    void next;
    const appError = toAppError(error);
    if (appError.status === 401) response.setHeader("WWW-Authenticate", challengeHeader());
    logger.warn(
      {
        err: error instanceof Error ? error : new Error("Unknown error"),
        requestId: appError.requestId,
        outcome: "error",
      },
      appError.message,
    );
    response.status(appError.status).json({ error: appError.toSafeObject() });
  };
  app.use(errorHandler);
  return app;
}
