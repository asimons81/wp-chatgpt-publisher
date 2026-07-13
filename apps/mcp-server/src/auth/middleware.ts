import type { NextFunction, Request, Response } from "express";
import type { ToolContext } from "@wp-chatgpt-publisher/contracts";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { verifyAccessToken } from "./tokens.js";

declare module "express-serve-static-core" {
  interface Request {
    toolContext?: ToolContext;
  }
}
export async function requireAccessToken(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authorization = request.header("authorization");
    if (!authorization?.startsWith("Bearer "))
      throw new AppError(
        "authentication_required",
        "Connect a WordPress site to continue.",
        401,
        "Use the app connection flow in ChatGPT.",
      );
    request.toolContext = await verifyAccessToken(authorization.slice(7));
    next();
  } catch (error) {
    next(error);
  }
}
export function challengeHeader(scope?: string): string {
  const metadata = `${config.publicBaseUrl}/.well-known/oauth-protected-resource`;
  return `Bearer resource_metadata="${metadata}"${scope ? `, scope="${scope}"` : ""}`;
}
