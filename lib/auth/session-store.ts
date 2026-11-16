import { randomBytes } from "node:crypto";
import { getPool } from "@/lib/db";
import { hashSessionToken, type CurrentUser } from "./session-core";

export async function createSessionRecord(userId: string, userAgent: string | null = null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const pool = getPool();
  const result = await pool.query(
    `insert into auth_sessions (token_hash, portal_user_id, expires_at, user_agent)
     select $1, id, $2, $3 from portal_users
     where id = $4 and is_active
     returning id`,
    [hashSessionToken(token), expiresAt, userAgent, userId],
  );
  if (!result.rowCount) throw new Error("This portal account is inactive.");
  await pool.query("update portal_users set last_login_at = now() where id = $1", [userId]);
  return { token, expiresAt };
}

export async function getSessionUser(token: string): Promise<CurrentUser | null> {
  if (!process.env.DATABASE_URL) return null;
  const pool = getPool();
  const result = await pool.query<{
    session_id: string;
    id: string;
    organization_id: string;
    role: CurrentUser["role"];
    worker_id: string | null;
    email: string;
    display_name: string | null;
    can_view_compensation: boolean;
    can_view_demographics: boolean;
  }>(
    `select s.id as session_id, u.id, u.organization_id, u.role, u.worker_id,
            u.email, u.display_name, u.can_view_compensation, u.can_view_demographics
     from auth_sessions s
     join portal_users u on u.id = s.portal_user_id
     where s.token_hash = $1 and s.revoked_at is null
       and s.expires_at > now()
       and s.last_seen_at > now() - interval '2 hours'
       and u.is_active`,
    [hashSessionToken(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  await pool.query(
    `update auth_sessions set last_seen_at = now()
     where id = $1 and revoked_at is null
       and last_seen_at <= now() - interval '1 minute'`,
    [row.session_id],
  );
  return {
    id: row.id,
    organizationId: row.organization_id,
    role: row.role,
    workerId: row.worker_id,
    email: row.email,
    displayName: row.display_name,
    canViewCompensation: row.can_view_compensation,
    canViewDemographics: row.can_view_demographics,
  };
}
