import { z } from "zod";

const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    PUBLIC_BASE_URL: z.string().url().default("http://127.0.0.1:8787"),
    DATABASE_URL: z.string().min(1).default("postgresql://wpcp:wpcp@127.0.0.1:5432/wpcp"),
    WPCP_ENCRYPTION_KEY: z.string().optional(),
    WPCP_TOKEN_SIGNING_KEY: z.string().optional(),
    ALLOWED_ORIGINS: z.string().default("https://chatgpt.com"),
    ALLOW_PRIVATE_NETWORKS_IN_DEVELOPMENT: z.enum(["true", "false"]).default("false"),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),
    METRICS_ENABLED: z.enum(["true", "false"]).default("false"),
    TELEMETRY_ENABLED: z.enum(["true", "false"]).default("false"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(3600).max(31_536_000).default(2_592_000),
    CONFIRMATION_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    WORDPRESS_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),
    WORDPRESS_MAX_RESPONSE_BYTES: z.coerce
      .number()
      .int()
      .min(65_536)
      .max(10_485_760)
      .default(2_097_152),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production") {
      if (!value.PUBLIC_BASE_URL.startsWith("https://"))
        ctx.addIssue({
          code: "custom",
          path: ["PUBLIC_BASE_URL"],
          message: "Production requires HTTPS",
        });
      for (const key of ["WPCP_ENCRYPTION_KEY", "WPCP_TOKEN_SIGNING_KEY"] as const) {
        const raw = value[key];
        if (!raw || Buffer.from(raw, "base64").length !== 32)
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "Production requires a base64-encoded 32-byte key",
          });
      }
    }
  });

const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
const environment = {
  ...process.env,
  ...(process.env.PUBLIC_BASE_URL || !vercelUrl ? {} : { PUBLIC_BASE_URL: `https://${vercelUrl}` }),
};
const parsed = ConfigSchema.superRefine((_value, ctx) => {
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL)
    ctx.addIssue({
      code: "custom",
      path: ["DATABASE_URL"],
      message: "Production requires a durable PostgreSQL DATABASE_URL",
    });
}).parse(environment);
const developmentKey = Buffer.alloc(32, 7).toString("base64");
const publicBaseUrl = parsed.PUBLIC_BASE_URL.replace(/\/$/, "");
const mcpResourceUrl = `${publicBaseUrl}/mcp`;

export const config = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  publicBaseUrl,
  mcpResourceUrl,
  oauthResourceUrls: [publicBaseUrl, mcpResourceUrl],
  databaseUrl: parsed.DATABASE_URL,
  encryptionKey: parsed.WPCP_ENCRYPTION_KEY ?? developmentKey,
  tokenSigningKey: parsed.WPCP_TOKEN_SIGNING_KEY ?? developmentKey,
  allowedOrigins: parsed.ALLOWED_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  allowPrivateNetworks:
    parsed.NODE_ENV !== "production" && parsed.ALLOW_PRIVATE_NETWORKS_IN_DEVELOPMENT === "true",
  trustProxy: parsed.TRUST_PROXY,
  metricsEnabled: parsed.METRICS_ENABLED === "true",
  telemetryEnabled: parsed.TELEMETRY_ENABLED === "true",
  logLevel: parsed.LOG_LEVEL,
  accessTokenTtlSeconds: parsed.ACCESS_TOKEN_TTL_SECONDS,
  refreshTokenTtlSeconds: parsed.REFRESH_TOKEN_TTL_SECONDS,
  confirmationTtlSeconds: parsed.CONFIRMATION_TTL_SECONDS,
  wordpressRequestTimeoutMs: parsed.WORDPRESS_REQUEST_TIMEOUT_MS,
  wordpressMaxResponseBytes: parsed.WORDPRESS_MAX_RESPONSE_BYTES,
} as const;
