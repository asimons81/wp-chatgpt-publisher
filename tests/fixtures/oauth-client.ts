import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Scope } from "@wp-chatgpt-publisher/contracts";

export type ObjectValue = Record<string, unknown>;

export const object = (value: unknown): ObjectValue =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};

export const text = (value: unknown): string => (typeof value === "string" ? value : "");

export async function json(response: Response): Promise<ObjectValue> {
  return object((await response.json()) as unknown);
}

export class CookieJar {
  readonly #values = new Map<string, string>();

  capture(response: Response): void {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const fallback = response.headers.get("set-cookie");
    const values = headers.getSetCookie?.() ?? (fallback ? [fallback] : []);
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      if (!pair) continue;
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      this.#values.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.#values.size) {
      headers.set(
        "cookie",
        [...this.#values.entries()].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    }
    const response = await fetch(url, { ...init, headers, redirect: "manual" });
    this.capture(response);
    return response;
  }
}

function inputValue(html: string, name: string): string {
  for (const tag of html.match(/<input\b[^>]*>/gi) ?? []) {
    const attributes = new Map(
      [...tag.matchAll(/\b([A-Za-z0-9_:-]+)=["']([^"']*)["']/g)].map((match) => [
        match[1]?.toLowerCase() ?? "",
        match[2] ?? "",
      ]),
    );
    if (attributes.get("name") === name) return attributes.get("value") ?? "";
  }
  return "";
}

function connectionId(accessToken: string): string {
  const payload = accessToken.split(".")[1];
  if (!payload) throw new Error("Access token payload is missing");
  const claims = object(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown);
  const id = text(claims.connection_id);
  if (!id) throw new Error("Access token connection identifier is missing");
  return id;
}

async function requireStatus(
  response: Response,
  expected: number,
  operation: string,
): Promise<void> {
  if (response.status === expected) return;
  const body = (await response.clone().text()).replace(
    /[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    "[signed request]",
  );
  throw new Error(`${operation} returned HTTP ${response.status}: ${body.slice(0, 1_000)}`);
}

export interface OAuthFixtureOptions {
  service: string;
  wordpress: string;
  username: string;
  password: string;
  scopes: readonly Scope[];
  clientName?: string;
}

export interface OAuthFixture {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  connectionId: string;
  browser: CookieJar;
}

export async function authorizeMcp(options: OAuthFixtureOptions): Promise<OAuthFixture> {
  const callback = "http://localhost:9999/oauth/callback";
  const registration = await fetch(`${options.service}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: options.clientName ?? "Editorial Publisher for ChatGPT test",
      redirect_uris: [callback],
    }),
  });
  await requireStatus(registration, 201, "Dynamic client registration");
  const clientId = text((await json(registration)).client_id);
  if (!clientId) throw new Error("Dynamic client registration did not return a client ID");

  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomUUID();
  const authorize = new URL(`${options.service}/oauth/authorize`);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callback,
    state,
    resource: options.service,
    scope: options.scopes.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  const authorization = await fetch(authorize);
  await requireStatus(authorization, 200, "OAuth authorization start");
  const flowId = inputValue(await authorization.text(), "flow_id");
  if (!flowId) throw new Error("OAuth authorization did not create a flow ID");

  const start = await fetch(`${options.service}/connect/start`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ flow_id: flowId, site_url: options.wordpress }),
    redirect: "manual",
  });
  await requireStatus(start, 303, "WordPress discovery");
  const approvalUrl = start.headers.get("location") ?? "";
  if (!approvalUrl.includes("page=wpcp-approve")) {
    throw new Error("WordPress discovery did not return the approval page");
  }

  const browser = new CookieJar();
  await browser.fetch(`${options.wordpress}/wp-login.php`);
  const login = await browser.fetch(`${options.wordpress}/wp-login.php`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      log: options.username,
      pwd: options.password,
      "wp-submit": "Log In",
      redirect_to: approvalUrl,
      testcookie: "1",
    }),
  });
  if (login.status < 300 || login.status >= 400) {
    throw new Error(`WordPress login returned HTTP ${login.status}`);
  }

  const approval = await browser.fetch(approvalUrl);
  await requireStatus(approval, 200, "WordPress connection approval");
  const approvalHtml = await approval.text();
  const nonce = inputValue(approvalHtml, "_wpnonce");
  const requestToken = inputValue(approvalHtml, "request");
  if (!nonce || requestToken.split(".").length !== 3) {
    throw new Error("WordPress approval form did not contain its signed request and nonce");
  }

  const approvalBody = new URLSearchParams({ _wpnonce: nonce, request: requestToken });
  for (const scope of options.scopes) approvalBody.append("scopes[]", scope);
  const approved = await browser.fetch(approvalUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: approvalBody,
  });
  if (approved.status < 300 || approved.status >= 400) {
    await requireStatus(approved, 303, "WordPress connection approval submission");
  }
  const serviceCallback = approved.headers.get("location") ?? "";
  if (!serviceCallback.includes("/connect/callback")) {
    throw new Error("WordPress approval did not return to the verified service callback");
  }

  const callbackResponse = await fetch(serviceCallback, { redirect: "manual" });
  await requireStatus(callbackResponse, 303, "Connection grant exchange");
  const returned = new URL(callbackResponse.headers.get("location") ?? callback);
  if (returned.searchParams.get("state") !== state) throw new Error("OAuth state mismatch");
  const code = returned.searchParams.get("code") ?? "";
  if (!code) throw new Error("Connection callback did not return an authorization code");

  const tokenResponse = await fetch(`${options.service}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: callback,
    }),
  });
  await requireStatus(tokenResponse, 200, "OAuth authorization-code exchange");
  const tokens = await json(tokenResponse);
  const accessToken = text(tokens.access_token);
  const refreshToken = text(tokens.refresh_token);
  if (accessToken.split(".").length !== 3 || refreshToken.length <= 32) {
    throw new Error("OAuth token response was incomplete");
  }
  return {
    accessToken,
    refreshToken,
    clientId,
    connectionId: connectionId(accessToken),
    browser,
  };
}

export async function revokeWordPressConnection(
  browser: CookieJar,
  wordpress: string,
  id: string,
): Promise<void> {
  const page = await browser.fetch(`${wordpress}/wp-admin/admin.php?page=wpcp-connections`);
  await requireStatus(page, 200, "WordPress connection list");
  const html = await page.text();
  const links = [...html.matchAll(/href=["']([^"']+)["']/g)].map((match) =>
    (match[1] ?? "").replaceAll("&#038;", "&").replaceAll("&#38;", "&").replaceAll("&amp;", "&"),
  );
  const revokeUrl = links.find(
    (url) => url.includes("action=wpcp_revoke") && url.includes(`id=${encodeURIComponent(id)}`),
  );
  if (!revokeUrl) throw new Error("The active connection did not expose a revocation action");
  const revoked = await browser.fetch(new URL(revokeUrl, wordpress).toString());
  if (revoked.status < 300 || revoked.status >= 400) {
    throw new Error(`WordPress connection revocation returned HTTP ${revoked.status}`);
  }
}
