import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { sanitizeReturnTo } from "./redirect";
import { type CurrentUser, hashSessionToken, sessionCookieOptions } from "./session-core";
import { createSessionRecord, getSessionUser } from "./session-store";

export async function createSession(userId: string) {
  let userAgent: string | null = null;
  try {
    userAgent = (await headers()).get("user-agent");
  } catch {
    userAgent = null;
  }
  const { token, expiresAt } = await createSessionRecord(userId, userAgent);
  (await cookies()).set("torrey_session", token, sessionCookieOptions(expiresAt));
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  let token: string | undefined;
  try {
    token = (await cookies()).get("torrey_session")?.value;
  } catch {
    return null;
  }
  return token ? getSessionUser(token) : null;
});

export async function requireUser(returnTo = "/") {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(sanitizeReturnTo(returnTo))}`);
  return user;
}

export async function requireRole(...roles: CurrentUser["role"][]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) notFound();
  return user;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("torrey_session")?.value;
  if (token && process.env.DATABASE_URL) {
    const { getPool } = await import("@/lib/db");
    await getPool().query(
      "update auth_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null",
      [hashSessionToken(token)],
    );
  }
  cookieStore.delete("torrey_session");
}
