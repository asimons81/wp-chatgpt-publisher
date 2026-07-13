import type { Connection, Scope } from "@wp-chatgpt-publisher/contracts";

export interface OAuthClient {
  id: string;
  redirectUris: string[];
  name: string;
  createdAt: string;
}
export interface AuthorizationFlow {
  id: string;
  clientId: string;
  redirectUri: string;
  state: string;
  resource: string;
  scopes: Scope[];
  codeChallenge: string;
  siteUrl: string | null;
  expiresAt: string;
  consumedAt: string | null;
}
export interface AuthorizationCode {
  hash: string;
  clientId: string;
  redirectUri: string;
  connectionId: string;
  scopes: Scope[];
  resource: string;
  codeChallenge: string;
  expiresAt: string;
  consumedAt: string | null;
}
export interface RefreshTokenRecord {
  hash: string;
  clientId: string;
  connectionId: string;
  scopes: Scope[];
  resource: string;
  expiresAt: string;
  revokedAt: string | null;
}
export interface ConfirmationRecord {
  hash: string;
  connectionId: string;
  action: string;
  contentId: number;
  expectedVersion: string;
  payloadHash: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface Repository {
  migrate(): Promise<void>;
  ping(): Promise<void>;
  registerClient(client: OAuthClient): Promise<void>;
  getClient(id: string): Promise<OAuthClient | null>;
  createFlow(flow: AuthorizationFlow): Promise<void>;
  getFlow(id: string): Promise<AuthorizationFlow | null>;
  setFlowSite(id: string, siteUrl: string): Promise<void>;
  consumeFlow(id: string): Promise<boolean>;
  saveConnection(connection: Connection): Promise<void>;
  getConnection(id: string): Promise<Connection | null>;
  revokeConnection(id: string): Promise<void>;
  touchConnection(id: string): Promise<void>;
  createAuthorizationCode(code: AuthorizationCode): Promise<void>;
  consumeAuthorizationCode(hash: string): Promise<AuthorizationCode | null>;
  createRefreshToken(token: RefreshTokenRecord): Promise<void>;
  consumeRefreshToken(hash: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshTokens(connectionId: string): Promise<void>;
  createConfirmation(record: ConfirmationRecord): Promise<void>;
  consumeConfirmation(hash: string): Promise<ConfirmationRecord | null>;
  claimIdempotency(
    connectionId: string,
    key: string,
    tool: string,
    requestHash: string,
  ): Promise<{ claimed: boolean; response: unknown }>;
  finishIdempotency(connectionId: string, key: string, response: unknown): Promise<void>;
}
