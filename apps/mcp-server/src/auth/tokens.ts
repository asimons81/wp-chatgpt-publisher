import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { ScopeSchema, type Scope, type ToolContext } from "@wp-chatgpt-publisher/contracts";
import { config } from "../config.js";
import { AppError } from "../errors.js";

const signingKey = Buffer.from(config.tokenSigningKey, "base64");

export interface AccessClaims {
  subject: string;
  clientId: string;
  connectionId: string;
  scopes: Scope[];
  audience: string;
}
export interface ConnectionRequestClaims {
  flowId: string;
  siteUrl: string;
  serviceUrl: string;
  scopes: Scope[];
  expiresAt: number;
}
export async function issueAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({
    client_id: claims.clientId,
    connection_id: claims.connectionId,
    scope: claims.scopes.join(" "),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(config.publicBaseUrl)
    .setSubject(claims.subject)
    .setAudience(claims.audience)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
    .setJti(randomUUID())
    .sign(signingKey);
}
export async function issueConnectionRequest(
  flowId: string,
  siteUrl: string,
  scopes: Scope[],
): Promise<string> {
  return new SignJWT({
    flow_id: flowId,
    site_url: siteUrl,
    scope: scopes.join(" "),
    service_url: config.publicBaseUrl,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(config.publicBaseUrl)
    .setAudience(`${siteUrl.replace(/\/$/, "")}/wp-json/wp-chatgpt-publisher/v1`)
    .setIssuedAt()
    .setExpirationTime("10m")
    .setJti(randomUUID())
    .sign(signingKey);
}
export async function verifyConnectionRequest(token: string): Promise<ConnectionRequestClaims> {
  try {
    const verified = await jwtVerify(token, signingKey, {
      issuer: config.publicBaseUrl,
      algorithms: ["HS256"],
    });
    const flowId = verified.payload.flow_id;
    const siteUrl = verified.payload.site_url;
    const serviceUrl = verified.payload.service_url;
    const rawScope = verified.payload.scope;
    const expiresAt = verified.payload.exp;
    if (
      typeof flowId !== "string" ||
      typeof siteUrl !== "string" ||
      typeof serviceUrl !== "string" ||
      typeof rawScope !== "string" ||
      typeof expiresAt !== "number"
    )
      throw new Error("Required connection request claims are missing");
    const normalizedSiteUrl = siteUrl.replace(/\/$/, "");
    const expectedAudience = `${normalizedSiteUrl}/wp-json/wp-chatgpt-publisher/v1`;
    const audiences = Array.isArray(verified.payload.aud)
      ? verified.payload.aud
      : [verified.payload.aud];
    if (
      serviceUrl !== config.publicBaseUrl ||
      !audiences.includes(expectedAudience) ||
      !verified.payload.jti
    )
      throw new Error("Connection request binding is invalid");
    return {
      flowId,
      siteUrl: normalizedSiteUrl,
      serviceUrl,
      scopes: ScopeSchema.array().parse(rawScope.split(" ").filter(Boolean)),
      expiresAt,
    };
  } catch (error) {
    throw new AppError(
      error instanceof joseErrors.JWTExpired ? "connection_expired" : "authentication_required",
      "The WordPress connection request is invalid or expired.",
      401,
      "Start the connection again in ChatGPT.",
    );
  }
}
export async function verifyAccessToken(
  token: string,
  expectedAudience = config.publicBaseUrl,
): Promise<ToolContext> {
  try {
    const verified = await jwtVerify(token, signingKey, {
      issuer: config.publicBaseUrl,
      audience: expectedAudience,
      algorithms: ["HS256"],
    });
    const clientId = verified.payload.client_id;
    const connectionId = verified.payload.connection_id;
    const rawScope = verified.payload.scope;
    if (
      typeof clientId !== "string" ||
      typeof connectionId !== "string" ||
      typeof rawScope !== "string" ||
      typeof verified.payload.sub !== "string"
    )
      throw new Error("Required claims are missing");
    return {
      subject: verified.payload.sub,
      clientId,
      connectionId,
      scopes: ScopeSchema.array().parse(rawScope.split(" ").filter(Boolean)),
      audience: expectedAudience,
      requestId: randomUUID(),
    };
  } catch (error) {
    const expired = error instanceof joseErrors.JWTExpired;
    throw new AppError(
      expired ? "connection_expired" : "authentication_required",
      expired ? "The ChatGPT connection token expired." : "Authentication is required.",
      401,
      "Reconnect the WordPress site in ChatGPT.",
    );
  }
}
export function verifyPkce(verifier: string, challenge: string): boolean {
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}
