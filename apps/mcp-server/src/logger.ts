import pino from "pino";
import { config } from "./config.js";

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
export const logger = pino({
  level: config.logLevel,
  base: { service: "wp-chatgpt-publisher", version: "1.0.0" },
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
    err(error: Error) {
      return { type: error.name, message: error.message, code: "internal_error" };
    },
    req(request: { id?: string; method?: string; url?: string }) {
      return { id: request.id, method: request.method, url: request.url?.split("?")[0] };
    },
  },
});
