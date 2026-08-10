import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { ConnectionSchema, ScopeSchema, type Connection } from "@wp-chatgpt-publisher/contracts";
import type {
  AuthorizationCode,
  AuthorizationFlow,
  AutonomousAuditFilter,
  ConfirmationRecord,
  OAuthClient,
  RefreshTokenRecord,
  Repository,
} from "./repository.js";
import { AutonomousAuditRecordSchema, type AutonomousAuditRecord } from "../autonomous/audit.js";

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.valueOf())) throw new TypeError("Database timestamp is invalid");
  return date.toISOString();
}
function scopes(value: unknown): ReturnType<typeof ScopeSchema.parse>[] {
  return ScopeSchema.array().parse(value);
}

interface OAuthClientRow extends QueryResultRow {
  id: string;
  redirect_uris: unknown;
  name: string;
  created_at: unknown;
}
interface AuthorizationFlowRow extends QueryResultRow {
  id: string;
  client_id: string;
  redirect_uri: string;
  state: string;
  resource: string;
  scopes: unknown;
  code_challenge: string;
  site_url: string | null;
  expires_at: unknown;
  consumed_at: unknown;
}
interface ConnectionRow extends QueryResultRow {
  id: string;
  site_url: string;
  site_name: string;
  wordpress_user_id: unknown;
  wordpress_user_name: string;
  scopes: unknown;
  credential_ciphertext: string;
  credential_key_version: number;
  created_at: unknown;
  last_used_at: unknown;
  revoked_at: unknown;
}
interface AuthorizationCodeRow extends QueryResultRow {
  hash: string;
  client_id: string;
  redirect_uri: string;
  connection_id: string;
  scopes: unknown;
  resource: string;
  code_challenge: string;
  expires_at: unknown;
  consumed_at: unknown;
}
interface RefreshTokenRow extends QueryResultRow {
  hash: string;
  client_id: string;
  connection_id: string;
  scopes: unknown;
  resource: string;
  expires_at: unknown;
  revoked_at: unknown;
}
interface ConfirmationRow extends QueryResultRow {
  hash: string;
  connection_id: string;
  action: string;
  content_id: unknown;
  expected_version: string;
  payload_hash: string;
  expires_at: unknown;
  consumed_at: unknown;
}
interface IdempotencyRow extends QueryResultRow {
  tool: string;
  request_hash: string;
  response: unknown;
}
interface AutonomousAuditRow extends QueryResultRow {
  id: string;
  schema_version: number;
  request_id: string;
  connection_id: string;
  client_id: string;
  pipeline_id: string;
  pipeline_version: string;
  intent: string;
  outcome: string;
  violations: unknown;
  policy_fingerprint: string;
  request_hash: string;
  created_at: unknown;
}

export class PostgresRepository implements Repository {
  readonly #pool: Pool;
  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  }
  async migrate(): Promise<void> {
    await this.#pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_clients (
        id text PRIMARY KEY, redirect_uris jsonb NOT NULL, name text NOT NULL, created_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS authorization_flows (
        id uuid PRIMARY KEY, client_id text NOT NULL REFERENCES oauth_clients(id), redirect_uri text NOT NULL,
        state text NOT NULL, resource text NOT NULL, scopes jsonb NOT NULL, code_challenge text NOT NULL,
        site_url text, expires_at timestamptz NOT NULL, consumed_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS connections (
        id uuid PRIMARY KEY, site_url text NOT NULL, site_name text NOT NULL, wordpress_user_id bigint NOT NULL,
        wordpress_user_name text NOT NULL, scopes jsonb NOT NULL, credential_ciphertext text NOT NULL,
        credential_key_version integer NOT NULL, created_at timestamptz NOT NULL, last_used_at timestamptz, revoked_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS authorization_codes (
        hash text PRIMARY KEY, client_id text NOT NULL REFERENCES oauth_clients(id), redirect_uri text NOT NULL,
        connection_id uuid NOT NULL REFERENCES connections(id), scopes jsonb NOT NULL, resource text NOT NULL,
        code_challenge text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        hash text PRIMARY KEY, client_id text NOT NULL REFERENCES oauth_clients(id),
        connection_id uuid NOT NULL REFERENCES connections(id), scopes jsonb NOT NULL, resource text NOT NULL,
        expires_at timestamptz NOT NULL, revoked_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS confirmations (
        hash text PRIMARY KEY, connection_id uuid NOT NULL REFERENCES connections(id), action text NOT NULL,
        content_id bigint NOT NULL, expected_version text NOT NULL, payload_hash text NOT NULL,
        expires_at timestamptz NOT NULL, consumed_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS idempotency (
        connection_id uuid NOT NULL REFERENCES connections(id), key uuid NOT NULL, tool text NOT NULL,
        request_hash text NOT NULL, response jsonb, created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(connection_id, key)
      );
      CREATE TABLE IF NOT EXISTS autonomous_audit (
        id uuid PRIMARY KEY, schema_version integer NOT NULL DEFAULT 1,
        request_id uuid NOT NULL, connection_id uuid NOT NULL REFERENCES connections(id),
        client_id text NOT NULL, pipeline_id text NOT NULL, pipeline_version text NOT NULL,
        intent text NOT NULL, outcome text NOT NULL, violations jsonb NOT NULL DEFAULT '[]',
        policy_fingerprint char(64) NOT NULL, request_hash char(64) NOT NULL,
        created_at timestamptz NOT NULL
      );
      CREATE INDEX IF NOT EXISTS autonomous_audit_connection_created_idx ON autonomous_audit(connection_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS autonomous_audit_pipeline_idx ON autonomous_audit(pipeline_id);
      CREATE INDEX IF NOT EXISTS autonomous_audit_request_idx ON autonomous_audit(request_id);
      CREATE INDEX IF NOT EXISTS authorization_flows_expires_idx ON authorization_flows(expires_at);
      CREATE INDEX IF NOT EXISTS refresh_tokens_connection_idx ON refresh_tokens(connection_id);
      CREATE INDEX IF NOT EXISTS confirmations_expires_idx ON confirmations(expires_at);
    `);
  }
  async ping(): Promise<void> {
    await this.#pool.query("SELECT 1");
  }
  async registerClient(client: OAuthClient): Promise<void> {
    await this.#pool.query(
      "INSERT INTO oauth_clients(id, redirect_uris, name, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET redirect_uris=EXCLUDED.redirect_uris, name=EXCLUDED.name",
      [client.id, JSON.stringify(client.redirectUris), client.name, client.createdAt],
    );
  }
  async getClient(id: string): Promise<OAuthClient | null> {
    const result = await this.#pool.query<OAuthClientRow>(
      "SELECT * FROM oauth_clients WHERE id=$1",
      [id],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          redirectUris: Array.isArray(row.redirect_uris)
            ? row.redirect_uris.filter((value): value is string => typeof value === "string")
            : [],
          name: row.name,
          createdAt: iso(row.created_at),
        }
      : null;
  }
  async createFlow(flow: AuthorizationFlow): Promise<void> {
    await this.#pool.query(
      "INSERT INTO authorization_flows(id,client_id,redirect_uri,state,resource,scopes,code_challenge,site_url,expires_at,consumed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        flow.id,
        flow.clientId,
        flow.redirectUri,
        flow.state,
        flow.resource,
        JSON.stringify(flow.scopes),
        flow.codeChallenge,
        flow.siteUrl,
        flow.expiresAt,
        flow.consumedAt,
      ],
    );
  }
  async getFlow(id: string): Promise<AuthorizationFlow | null> {
    const result = await this.#pool.query<AuthorizationFlowRow>(
      "SELECT * FROM authorization_flows WHERE id=$1",
      [id],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          clientId: row.client_id,
          redirectUri: row.redirect_uri,
          state: row.state,
          resource: row.resource,
          scopes: scopes(row.scopes),
          codeChallenge: row.code_challenge,
          siteUrl: row.site_url,
          expiresAt: iso(row.expires_at),
          consumedAt: row.consumed_at ? iso(row.consumed_at) : null,
        }
      : null;
  }
  async setFlowSite(id: string, siteUrl: string): Promise<void> {
    await this.#pool.query(
      "UPDATE authorization_flows SET site_url=$2 WHERE id=$1 AND consumed_at IS NULL",
      [id, siteUrl],
    );
  }
  async consumeFlow(id: string): Promise<boolean> {
    const result = await this.#pool.query(
      "UPDATE authorization_flows SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL AND expires_at > now()",
      [id],
    );
    return result.rowCount === 1;
  }
  async saveConnection(connection: Connection): Promise<void> {
    const value = ConnectionSchema.parse(connection);
    await this.#pool.query(
      "INSERT INTO connections(id,site_url,site_name,wordpress_user_id,wordpress_user_name,scopes,credential_ciphertext,credential_key_version,created_at,last_used_at,revoked_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        value.id,
        value.siteUrl,
        value.siteName,
        value.wordpressUserId,
        value.wordpressUserName,
        JSON.stringify(value.scopes),
        value.credentialCiphertext,
        value.credentialKeyVersion,
        value.createdAt,
        value.lastUsedAt,
        value.revokedAt,
      ],
    );
  }
  async getConnection(id: string): Promise<Connection | null> {
    const result = await this.#pool.query<ConnectionRow>("SELECT * FROM connections WHERE id=$1", [
      id,
    ]);
    const row = result.rows[0];
    return row
      ? ConnectionSchema.parse({
          id: row.id,
          siteUrl: row.site_url,
          siteName: row.site_name,
          wordpressUserId: Number(row.wordpress_user_id),
          wordpressUserName: row.wordpress_user_name,
          scopes: row.scopes,
          credentialCiphertext: row.credential_ciphertext,
          credentialKeyVersion: row.credential_key_version,
          createdAt: iso(row.created_at),
          lastUsedAt: row.last_used_at ? iso(row.last_used_at) : null,
          revokedAt: row.revoked_at ? iso(row.revoked_at) : null,
        })
      : null;
  }
  async revokeConnection(id: string): Promise<void> {
    await this.#pool.query(
      "UPDATE connections SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL",
      [id],
    );
    await this.revokeRefreshTokens(id);
  }
  async touchConnection(id: string): Promise<void> {
    await this.#pool.query("UPDATE connections SET last_used_at=now() WHERE id=$1", [id]);
  }
  async createAuthorizationCode(code: AuthorizationCode): Promise<void> {
    await this.#pool.query(
      "INSERT INTO authorization_codes(hash,client_id,redirect_uri,connection_id,scopes,resource,code_challenge,expires_at,consumed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        code.hash,
        code.clientId,
        code.redirectUri,
        code.connectionId,
        JSON.stringify(code.scopes),
        code.resource,
        code.codeChallenge,
        code.expiresAt,
        code.consumedAt,
      ],
    );
  }
  async consumeAuthorizationCode(hash: string): Promise<AuthorizationCode | null> {
    return this.#transaction(async (client) => {
      const result = await client.query<AuthorizationCodeRow>(
        "UPDATE authorization_codes SET consumed_at=now() WHERE hash=$1 AND consumed_at IS NULL AND expires_at > now() RETURNING *",
        [hash],
      );
      const row = result.rows[0];
      return row
        ? {
            hash: row.hash,
            clientId: row.client_id,
            redirectUri: row.redirect_uri,
            connectionId: row.connection_id,
            scopes: scopes(row.scopes),
            resource: row.resource,
            codeChallenge: row.code_challenge,
            expiresAt: iso(row.expires_at),
            consumedAt: iso(row.consumed_at),
          }
        : null;
    });
  }
  async createRefreshToken(token: RefreshTokenRecord): Promise<void> {
    await this.#pool.query(
      "INSERT INTO refresh_tokens(hash,client_id,connection_id,scopes,resource,expires_at,revoked_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        token.hash,
        token.clientId,
        token.connectionId,
        JSON.stringify(token.scopes),
        token.resource,
        token.expiresAt,
        token.revokedAt,
      ],
    );
  }
  async consumeRefreshToken(hash: string): Promise<RefreshTokenRecord | null> {
    return this.#transaction(async (client) => {
      const result = await client.query<RefreshTokenRow>(
        "UPDATE refresh_tokens SET revoked_at=now() WHERE hash=$1 AND revoked_at IS NULL AND expires_at > now() RETURNING *",
        [hash],
      );
      const row = result.rows[0];
      return row
        ? {
            hash: row.hash,
            clientId: row.client_id,
            connectionId: row.connection_id,
            scopes: scopes(row.scopes),
            resource: row.resource,
            expiresAt: iso(row.expires_at),
            revokedAt: iso(row.revoked_at),
          }
        : null;
    });
  }
  async revokeRefreshTokens(connectionId: string): Promise<void> {
    await this.#pool.query(
      "UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE connection_id=$1",
      [connectionId],
    );
  }
  async createConfirmation(record: ConfirmationRecord): Promise<void> {
    await this.#pool.query(
      "INSERT INTO confirmations(hash,connection_id,action,content_id,expected_version,payload_hash,expires_at,consumed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        record.hash,
        record.connectionId,
        record.action,
        record.contentId,
        record.expectedVersion,
        record.payloadHash,
        record.expiresAt,
        record.consumedAt,
      ],
    );
  }
  async consumeConfirmation(hash: string): Promise<ConfirmationRecord | null> {
    return this.#transaction(async (client) => {
      const result = await client.query<ConfirmationRow>(
        "UPDATE confirmations SET consumed_at=now() WHERE hash=$1 AND consumed_at IS NULL AND expires_at > now() RETURNING *",
        [hash],
      );
      const row = result.rows[0];
      return row
        ? {
            hash: row.hash,
            connectionId: row.connection_id,
            action: row.action,
            contentId: Number(row.content_id),
            expectedVersion: row.expected_version,
            payloadHash: row.payload_hash,
            expiresAt: iso(row.expires_at),
            consumedAt: iso(row.consumed_at),
          }
        : null;
    });
  }
  async claimIdempotency(
    connectionId: string,
    key: string,
    tool: string,
    requestHash: string,
  ): Promise<{ claimed: boolean; response: unknown }> {
    const result = await this.#pool.query(
      "INSERT INTO idempotency(connection_id,key,tool,request_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING key",
      [connectionId, key, tool, requestHash],
    );
    if (result.rowCount === 1) return { claimed: true, response: null };
    const existing = await this.#pool.query<IdempotencyRow>(
      "SELECT tool,request_hash,response FROM idempotency WHERE connection_id=$1 AND key=$2",
      [connectionId, key],
    );
    const row = existing.rows[0];
    if (!row || row.tool !== tool || row.request_hash !== requestHash)
      throw new Error("Idempotency key was reused with different input");
    return { claimed: false, response: row.response };
  }
  async finishIdempotency(connectionId: string, key: string, response: unknown): Promise<void> {
    await this.#pool.query("UPDATE idempotency SET response=$3 WHERE connection_id=$1 AND key=$2", [
      connectionId,
      key,
      JSON.stringify(response),
    ]);
  }
  async releaseIdempotency(connectionId: string, key: string): Promise<void> {
    await this.#pool.query(
      "DELETE FROM idempotency WHERE connection_id=$1 AND key=$2 AND response IS NULL",
      [connectionId, key],
    );
  }
  async recordAutonomousAudit(record: AutonomousAuditRecord): Promise<void> {
    const value = AutonomousAuditRecordSchema.parse(record);
    await this.#pool.query(
      `INSERT INTO autonomous_audit(
        id, schema_version, request_id, connection_id, client_id, pipeline_id, pipeline_version,
        intent, outcome, violations, policy_fingerprint, request_hash, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        value.id,
        value.schemaVersion,
        value.requestId,
        value.connectionId,
        value.clientId,
        value.pipelineId,
        value.pipelineVersion,
        value.intent,
        value.outcome,
        JSON.stringify(value.violations),
        value.policyFingerprint,
        value.requestHash,
        value.createdAt,
      ],
    );
  }
  async listAutonomousAudits(filter: AutonomousAuditFilter = {}): Promise<AutonomousAuditRecord[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.connectionId) {
      params.push(filter.connectionId);
      clauses.push(`connection_id=$${params.length}`);
    }
    if (filter.pipelineId) {
      params.push(filter.pipelineId);
      clauses.push(`pipeline_id=$${params.length}`);
    }
    if (filter.outcome) {
      params.push(filter.outcome);
      clauses.push(`outcome=$${params.length}`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 1000);
    params.push(limit);
    const result = await this.#pool.query<AutonomousAuditRow>(
      `SELECT id, schema_version, request_id, connection_id, client_id, pipeline_id, pipeline_version,
              intent, outcome, violations, policy_fingerprint, request_hash, created_at
       FROM autonomous_audit ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row) =>
      AutonomousAuditRecordSchema.parse({
        id: row.id,
        schemaVersion: row.schema_version,
        requestId: row.request_id,
        connectionId: row.connection_id,
        clientId: row.client_id,
        pipelineId: row.pipeline_id,
        pipelineVersion: row.pipeline_version,
        intent: row.intent,
        outcome: row.outcome,
        violations: Array.isArray(row.violations) ? row.violations : [],
        policyFingerprint: row.policy_fingerprint,
        requestHash: row.request_hash,
        createdAt: iso(row.created_at),
      }),
    );
  }
  async #transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
