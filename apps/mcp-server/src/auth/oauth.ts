import { randomUUID } from "node:crypto";
import type { Router } from "express";
import express from "express";
import { fetch } from "undici";
import { z } from "zod";
import { ScopeSchema, SCOPES, type Scope } from "@wp-chatgpt-publisher/contracts";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { SecretBox, hashToken, randomToken } from "../security/crypto.js";
import { validateExternalUrl } from "../security/ssrf.js";
import type { Repository } from "../storage/repository.js";
import {
  issueAccessToken,
  issueConnectionRequest,
  verifyConnectionRequest,
  verifyPkce,
} from "./tokens.js";

const REDIRECT_HOSTS = new Set(["chatgpt.com", "platform.openai.com", "localhost", "127.0.0.1"]);
const htmlEscape = (value: string) =>
  value.replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char,
  );
const expires = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
type Body = Record<string, unknown>;
const bodyObject = (value: unknown): Body =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Body) : {};

function parseScopes(raw: unknown): Scope[] {
  if (typeof raw !== "string") return [];
  const parsed = ScopeSchema.array().safeParse(raw.split(" ").filter(Boolean));
  if (!parsed.success)
    throw new AppError("validation_error", "One or more requested scopes are unsupported.", 400);
  return [...new Set(parsed.data)];
}
function safeRedirectUri(raw: unknown): string {
  if (typeof raw !== "string")
    throw new AppError("validation_error", "redirect_uri is required.", 400);
  const url = new URL(raw);
  if (url.protocol !== "https:" && !(config.nodeEnv !== "production" && url.protocol === "http:"))
    throw new AppError("security_rejection", "The redirect URI must use HTTPS.", 400);
  if (config.nodeEnv === "production" && !REDIRECT_HOSTS.has(url.hostname))
    throw new AppError(
      "security_rejection",
      "The redirect URI is not an approved ChatGPT endpoint.",
      400,
    );
  if (url.hash)
    throw new AppError("validation_error", "Redirect URI fragments are not allowed.", 400);
  return url.toString();
}
function redirectWith(base: string, values: Record<string, string>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  return url.toString();
}

export function canonicalWordPressSiteUrl(siteUrl: string, linkHeader: string | null): string {
  const restRoot = linkHeader?.match(
    /<([^>]+)>\s*;\s*rel=(?:"https:\/\/api\.w\.org\/"|https:\/\/api\.w\.org\/)/i,
  )?.[1];
  if (!restRoot) return siteUrl;
  try {
    const canonical = new URL(restRoot);
    const suffix = "wp-json/";
    if (!canonical.pathname.endsWith(suffix)) return siteUrl;
    canonical.pathname = canonical.pathname.slice(0, -suffix.length);
    canonical.search = "";
    canonical.hash = "";
    return canonical.toString().replace(/\/$/, "");
  } catch {
    return siteUrl;
  }
}

export function createOAuthRouter(repository: Repository): Router {
  const router = express.Router();
  const box = new SecretBox(config.encryptionKey);
  router.get("/.well-known/oauth-protected-resource", (_request, response) =>
    response.json({
      resource: config.publicBaseUrl,
      authorization_servers: [config.publicBaseUrl],
      scopes_supported: SCOPES,
      resource_documentation: `${config.publicBaseUrl}/docs`,
    }),
  );
  router.get("/.well-known/oauth-authorization-server", (_request, response) =>
    response.json({
      issuer: config.publicBaseUrl,
      authorization_endpoint: `${config.publicBaseUrl}/oauth/authorize`,
      token_endpoint: `${config.publicBaseUrl}/oauth/token`,
      registration_endpoint: `${config.publicBaseUrl}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: SCOPES,
    }),
  );
  router.post(
    "/connect/validate",
    express.json({ limit: "16kb" }),
    async (request, response, next) => {
      try {
        const body = bodyObject(request.body);
        if (typeof body.request !== "string" || body.request.length > 8192)
          throw new AppError("validation_error", "A connection request token is required.", 400);
        const claims = await verifyConnectionRequest(body.request);
        const flow = await repository.getFlow(claims.flowId);
        if (
          !flow ||
          flow.consumedAt ||
          new Date(flow.expiresAt) <= new Date() ||
          flow.siteUrl?.replace(/\/$/, "") !== claims.siteUrl ||
          flow.scopes.length !== claims.scopes.length ||
          flow.scopes.some((scope) => !claims.scopes.includes(scope))
        )
          throw new AppError(
            "connection_expired",
            "The connection request no longer matches an active authorization flow.",
            401,
            "Start the connection again in ChatGPT.",
          );
        response.set("cache-control", "no-store").json({
          flow_id: claims.flowId,
          site_url: claims.siteUrl,
          service_url: claims.serviceUrl,
          scope: claims.scopes.join(" "),
          exp: claims.expiresAt,
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/oauth/register",
    express.json({ limit: "32kb" }),
    async (request, response, next) => {
      try {
        const body = bodyObject(request.body);
        const redirectUris = Array.isArray(body.redirect_uris)
          ? body.redirect_uris.map(safeRedirectUri)
          : [];
        if (redirectUris.length === 0 || redirectUris.length > 10)
          throw new AppError("validation_error", "Provide between one and ten redirect URIs.", 400);
        const client = {
          id: randomUUID(),
          redirectUris,
          name: typeof body.client_name === "string" ? body.client_name.slice(0, 200) : "ChatGPT",
          createdAt: new Date().toISOString(),
        };
        await repository.registerClient(client);
        response.status(201).json({
          client_id: client.id,
          client_name: client.name,
          redirect_uris: client.redirectUris,
          token_endpoint_auth_method: "none",
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.get("/oauth/authorize", async (request, response, next) => {
    try {
      const {
        client_id: clientId,
        state,
        resource,
        code_challenge: challenge,
        code_challenge_method: method,
        response_type: responseType,
      } = request.query;
      if (
        typeof clientId !== "string" ||
        typeof state !== "string" ||
        typeof resource !== "string" ||
        typeof challenge !== "string" ||
        method !== "S256" ||
        responseType !== "code"
      )
        throw new AppError(
          "validation_error",
          "The authorization request is incomplete or unsupported.",
          400,
        );
      if (!config.oauthResourceUrls.includes(resource))
        throw new AppError(
          "security_rejection",
          "The OAuth resource does not match this server.",
          400,
        );
      const client = await repository.getClient(clientId);
      if (!client) throw new AppError("authentication_required", "Unknown OAuth client.", 401);
      const redirectUri = safeRedirectUri(request.query.redirect_uri);
      if (!client.redirectUris.includes(redirectUri))
        throw new AppError(
          "security_rejection",
          "The redirect URI is not registered for this client.",
          400,
        );
      const requestedScopes = parseScopes(request.query.scope);
      if (requestedScopes.length === 0)
        throw new AppError("validation_error", "At least one scope is required.", 400);
      const flowId = randomUUID();
      await repository.createFlow({
        id: flowId,
        clientId,
        redirectUri,
        state,
        resource,
        scopes: requestedScopes,
        codeChallenge: challenge,
        siteUrl: null,
        expiresAt: expires(600),
        consumedAt: null,
      });
      response
        .type("html")
        .send(
          `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect WordPress</title><style>body{font:16px system-ui;background:#f6f7f7;color:#1d2327;margin:0;padding:32px}.card{max-width:560px;margin:auto;background:#fff;border:1px solid #c3c4c7;border-radius:12px;padding:28px;box-shadow:0 8px 28px #0001}label{display:block;font-weight:600;margin:20px 0 8px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #8c8f94;border-radius:6px;font:inherit}button{margin-top:20px;background:#2271b1;color:#fff;border:0;border-radius:6px;padding:12px 18px;font-weight:600}.scope{color:#50575e;font-size:14px;line-height:1.5}</style></head><body><main class="card"><h1>Connect your WordPress site</h1><p>You will sign in and approve access on your own WordPress site. Your normal WordPress password never goes to this service or ChatGPT.</p><form action="/connect/start" method="post"><input type="hidden" name="flow_id" value="${flowId}"><label for="site_url">WordPress site URL</label><input id="site_url" name="site_url" type="url" required placeholder="https://example.com"><p class="scope">Requested permissions: ${htmlEscape(requestedScopes.join(", "))}</p><button type="submit">Continue to WordPress</button></form></main></body></html>`,
        );
    } catch (error) {
      next(error);
    }
  });
  router.post(
    "/connect/start",
    express.urlencoded({ extended: false, limit: "16kb" }),
    async (request, response, next) => {
      try {
        const body = bodyObject(request.body);
        if (typeof body.flow_id !== "string" || typeof body.site_url !== "string")
          throw new AppError("validation_error", "Flow and site URL are required.", 400);
        const flow = await repository.getFlow(body.flow_id);
        if (!flow || flow.consumedAt || new Date(flow.expiresAt) <= new Date())
          throw new AppError(
            "connection_expired",
            "The connection request expired.",
            400,
            "Start the connection again in ChatGPT.",
          );
        let target = await validateExternalUrl(body.site_url, "site");
        let siteUrl = target.url.toString().replace(/\/$/, "");
        let discovery = await fetch(`${siteUrl}/wp-json/wp-chatgpt-publisher/v1/discovery`, {
          dispatcher: target.dispatcher,
          redirect: "error",
          signal: AbortSignal.timeout(config.wordpressRequestTimeoutMs),
        });
        if (!discovery.ok)
          throw new AppError(
            "unsupported",
            "Editorial Publisher for ChatGPT was not discovered at this site.",
            400,
            "Install and activate the WordPress plugin, confirm HTTPS, then retry.",
          );
        const canonicalSiteUrl = canonicalWordPressSiteUrl(siteUrl, discovery.headers.get("link"));
        if (canonicalSiteUrl !== siteUrl) {
          target = await validateExternalUrl(canonicalSiteUrl, "site");
          discovery = await fetch(`${canonicalSiteUrl}/wp-json/wp-chatgpt-publisher/v1/discovery`, {
            dispatcher: target.dispatcher,
            redirect: "error",
            signal: AbortSignal.timeout(config.wordpressRequestTimeoutMs),
          });
          if (!discovery.ok)
            throw new AppError(
              "unsupported",
              "Editorial Publisher for ChatGPT was not discovered at the canonical WordPress URL.",
              400,
              "Confirm the WordPress Address and Site Address settings, then retry.",
            );
          siteUrl = canonicalSiteUrl;
        }
        await repository.setFlowSite(flow.id, siteUrl);
        const requestToken = await issueConnectionRequest(flow.id, siteUrl, flow.scopes);
        const approval = new URL(`${siteUrl}/wp-admin/admin.php`);
        approval.searchParams.set("page", "wpcp-approve");
        approval.searchParams.set("service", config.publicBaseUrl);
        approval.searchParams.set("request", requestToken);
        response.redirect(303, approval.toString());
      } catch (error) {
        next(error);
      }
    },
  );
  router.get("/connect/callback", async (request, response, next) => {
    try {
      const { flow: flowId, grant } = request.query;
      if (typeof flowId !== "string" || typeof grant !== "string")
        throw new AppError(
          "validation_error",
          "The WordPress approval response is incomplete.",
          400,
        );
      const flow = await repository.getFlow(flowId);
      if (!flow || !flow.siteUrl || flow.consumedAt || new Date(flow.expiresAt) <= new Date())
        throw new AppError(
          "connection_expired",
          "The connection approval expired.",
          400,
          "Start the connection again in ChatGPT.",
        );
      const target = await validateExternalUrl(flow.siteUrl, "site");
      const exchange = await fetch(
        `${flow.siteUrl}/wp-json/wp-chatgpt-publisher/v1/connections/exchange`,
        {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ grant, flow_id: flow.id, service_url: config.publicBaseUrl }),
          dispatcher: target.dispatcher,
          redirect: "error",
          signal: AbortSignal.timeout(config.wordpressRequestTimeoutMs),
        },
      );
      if (!exchange.ok)
        throw new AppError(
          "authentication_required",
          "WordPress rejected or expired the approval grant.",
          401,
          "Return to ChatGPT and reconnect the site.",
        );
      const body = (await exchange.json()) as Record<string, unknown>;
      const parsedConnectionId = z.string().uuid().safeParse(body.connection_id);
      const credential = typeof body.credential === "string" ? body.credential : "";
      const siteName = typeof body.site_name === "string" ? body.site_name : "WordPress";
      const userId = Number(body.user_id);
      const userName = typeof body.user_name === "string" ? body.user_name : "WordPress user";
      if (!parsedConnectionId.success || !credential || !Number.isInteger(userId) || userId <= 0)
        throw new AppError(
          "upstream_error",
          "WordPress returned an invalid connection response.",
          502,
        );
      const connectionId = parsedConnectionId.data;
      await repository.saveConnection({
        id: connectionId,
        siteUrl: flow.siteUrl,
        siteName,
        wordpressUserId: userId,
        wordpressUserName: userName,
        scopes: flow.scopes,
        credentialCiphertext: box.encrypt(credential, connectionId),
        credentialKeyVersion: 1,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        revokedAt: null,
      });
      if (!(await repository.consumeFlow(flow.id)))
        throw new AppError("connection_expired", "This approval was already used.", 400);
      const rawCode = randomToken();
      await repository.createAuthorizationCode({
        hash: hashToken(rawCode),
        clientId: flow.clientId,
        redirectUri: flow.redirectUri,
        connectionId,
        scopes: flow.scopes,
        resource: flow.resource,
        codeChallenge: flow.codeChallenge,
        expiresAt: expires(120),
        consumedAt: null,
      });
      response.redirect(303, redirectWith(flow.redirectUri, { code: rawCode, state: flow.state }));
    } catch (error) {
      next(error);
    }
  });
  router.post(
    "/oauth/token",
    express.urlencoded({ extended: false, limit: "16kb" }),
    async (request, response, next) => {
      try {
        const body = bodyObject(request.body);
        const grantType = body.grant_type;
        const clientId = body.client_id;
        if (typeof clientId !== "string" || !(await repository.getClient(clientId)))
          throw new AppError("authentication_required", "Unknown OAuth client.", 401);
        let connectionId: string;
        let grantedScopes: Scope[];
        let resource: string;
        if (grantType === "authorization_code") {
          if (
            typeof body.code !== "string" ||
            typeof body.code_verifier !== "string" ||
            typeof body.redirect_uri !== "string"
          )
            throw new AppError(
              "validation_error",
              "Authorization code exchange parameters are incomplete.",
              400,
            );
          const code = await repository.consumeAuthorizationCode(hashToken(body.code));
          if (
            !code ||
            code.clientId !== clientId ||
            code.redirectUri !== body.redirect_uri ||
            !verifyPkce(body.code_verifier, code.codeChallenge)
          )
            throw new AppError(
              "authentication_required",
              "The authorization code is invalid, expired, or already used.",
              401,
            );
          connectionId = code.connectionId;
          grantedScopes = code.scopes;
          resource = code.resource;
        } else if (grantType === "refresh_token") {
          if (typeof body.refresh_token !== "string")
            throw new AppError("validation_error", "A refresh token is required.", 400);
          const token = await repository.consumeRefreshToken(hashToken(body.refresh_token));
          if (!token || token.clientId !== clientId)
            throw new AppError(
              "authentication_required",
              "The refresh token is invalid, expired, revoked, or already rotated.",
              401,
            );
          connectionId = token.connectionId;
          grantedScopes = token.scopes;
          resource = token.resource;
        } else
          throw new AppError(
            "unsupported",
            "Only authorization_code and refresh_token grants are supported.",
            400,
          );
        const connection = await repository.getConnection(connectionId);
        if (!connection || connection.revokedAt)
          throw new AppError("connection_expired", "The WordPress connection was revoked.", 401);
        const requested = body.scope ? parseScopes(body.scope) : grantedScopes;
        if (requested.some((scope) => !grantedScopes.includes(scope)))
          throw new AppError(
            "scope_missing",
            "A token cannot be expanded beyond the approved scopes.",
            403,
          );
        const refreshToken = randomToken();
        await repository.createRefreshToken({
          hash: hashToken(refreshToken),
          clientId,
          connectionId,
          scopes: requested,
          resource,
          expiresAt: expires(config.refreshTokenTtlSeconds),
          revokedAt: null,
        });
        response
          .set("cache-control", "no-store")
          .set("pragma", "no-cache")
          .json({
            access_token: await issueAccessToken({
              subject: connection.wordpressUserId.toString(),
              clientId,
              connectionId,
              scopes: requested,
              audience: resource,
            }),
            token_type: "Bearer",
            expires_in: config.accessTokenTtlSeconds,
            refresh_token: refreshToken,
            scope: requested.join(" "),
          });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
