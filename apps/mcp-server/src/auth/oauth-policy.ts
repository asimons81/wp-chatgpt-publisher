import { config } from "../config.js";

export const OAUTH_FORM_ACTION = ["'self'", "https:"] as const;

export function isAcceptedOAuthResource(resource: string): boolean {
  return config.oauthResourceUrls.includes(resource);
}
