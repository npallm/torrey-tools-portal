import { createHash } from "node:crypto";

export type CurrentUser = {
  id: string;
  organizationId: string;
  role: "consultant" | "client_admin" | "manager" | "employee";
  workerId: string | null;
  email: string;
  displayName: string | null;
  canViewCompensation: boolean;
  canViewDemographics: boolean;
};

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
    maxAge: 12 * 60 * 60,
  };
}
