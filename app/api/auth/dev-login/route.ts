import { NextResponse } from "next/server";
import { sanitizeReturnTo } from "@/lib/auth/redirect";
import { createSession } from "@/lib/auth/session";
import { getPool } from "@/lib/db";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" || process.env.AUTH_DEV_LOGIN !== "true") {
    return new Response("Not found", { status: 404 });
  }
  const form = await request.formData();
  const userId = String(form.get("userId") ?? "");
  const result = await getPool().query<{ id: string }>(
    `select u.id from portal_users u
     join organizations o on o.id=u.organization_id
     where u.id=$1 and o.slug='demo' and u.is_active`,
    [userId],
  );
  if (!result.rows[0]) return NextResponse.redirect(new URL("/login?error=Demo+account+not+found", request.url), 303);
  await createSession(userId);
  return NextResponse.redirect(new URL(sanitizeReturnTo(String(form.get("next") ?? "")), request.url), 303);
}
