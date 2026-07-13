import pino from "pino";
import { VERSION } from "@wp-chatgpt-publisher/contracts";
import { config } from "./config.js";
import { redactSecrets } from "./security/crypto.js";

const SECRET_KEYS = [
  "authorization",
  "cookie",
  "set-cookie",
  "token",
  "access_token",
  "refresh_token",
  "client_secret",
  "credential",
  "password",
  "content",
];

type RequestLogInput = { id?: unknown; method?: string; url?: string };
type ResponseLogInput = { statusCode?: number; headers?: unknown };

export function requestLogSerializer(request: RequestLogInput) {
  const id =
    typeof request.id === "string" || typeof request.id === "number" ? request.id : undefined;
  return {
    id,
    method: request.method,
    path: request.url?.split(/[?#]/u, 1)[0] || "/",
  };
}

export function responseLogSerializer(response: ResponseLogInput) {
  return { statusCode: response.statusCode };
}

export function errorLogSerializer(error: unknown) {
  const normalized = error instanceof Error ? error : new Error("Unknown error");
  return {
    type: normalized.name,
    message: redactSecrets(normalized.message),
    code: "internal_error",
  };
}

export const logger = pino({
  level: config.logLevel,
  base: { service: "wp-chatgpt-publisher", version: VERSION },
  redact: {
    paths: SECRET_KEYS.flatMap((key) => [
      key,
      `req.headers.${key}`,
      `res.headers.${key}`,
      `*.${key}`,
      `*.*.${key}`,
    ]),
    censor: "[REDACTED]",
  },
  serializers: {
    err: errorLogSerializer,
    req: requestLogSerializer,
    res: responseLogSerializer,
  },
});
