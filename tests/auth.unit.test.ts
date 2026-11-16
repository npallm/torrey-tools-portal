import { describe, expect, it, vi } from "vitest";
import { providerForEmail } from "@/lib/auth/discovery";
import { canAccessOutbox, canManageSso, canSubmitChangeRequest, isAdmin, managesWorker } from "@/lib/auth/permissions";
import { sanitizeReturnTo } from "@/lib/auth/redirect";
import { hashSessionToken, sessionCookieOptions } from "@/lib/auth/session-core";
import { isIntendedWorker } from "@/lib/auth/ownership";
import { stripCompensationDetails } from "@/lib/auth/compensation";

describe("auth helpers", () => {
  it("discovers enabled providers with case-insensitive email domains", () => {
    const providers = [
      { id: "disabled", enabled: false, email_domains: ["example.com"] },
      { id: "active", enabled: true, email_domains: ["EXAMPLE.COM"] },
    ];
    expect(providerForEmail(providers, "person@Example.com")?.id).toBe("active");
    expect(providerForEmail(providers, "person@other.example")).toBeNull();
  });

  it("keeps return targets on a single-origin relative path", () => {
    expect(sanitizeReturnTo("/requests?id=1")).toBe("/requests?id=1");
    expect(sanitizeReturnTo("//evil.example/path")).toBe("/");
    expect(sanitizeReturnTo("/\\evil.example")).toBe("/");
    expect(sanitizeReturnTo("https://evil.example")).toBe("/");
  });

  it("applies role permissions and manager-chain membership", () => {
    const admin = { role: "client_admin" as const };
    const consultant = { role: "consultant" as const };
    const manager = { role: "manager" as const };
    const employee = { role: "employee" as const };
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(consultant)).toBe(true);
    expect(canAccessOutbox(manager)).toBe(false);
    expect(canManageSso(employee)).toBe(false);
    expect(canSubmitChangeRequest(manager)).toBe(true);
    expect(canSubmitChangeRequest(employee)).toBe(false);
    expect(managesWorker(["manager-1", "manager-2"], "manager-1")).toBe(true);
    expect(managesWorker(["manager-1", "manager-2"], "manager-3")).toBe(false);
  });

  it("uses only a sha-256 hash for session token storage and sets a secure cookie in production", () => {
    expect(hashSessionToken("abc")).toMatch(/^[a-f0-9]{64}$/);
    vi.stubEnv("NODE_ENV", "production");
    try {
      const options = sessionCookieOptions(new Date("2026-01-01T00:00:00Z"));
      expect(options).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 43_200,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("requires token links to belong to the signed-in worker, including for administrators", () => {
    const admin = {
      id: "admin",
      organizationId: "org",
      role: "client_admin" as const,
      workerId: "worker-1",
      email: "admin@example.com",
      displayName: "Admin",
      canViewCompensation: true,
      canViewDemographics: false,
    };
    expect(isIntendedWorker(admin, "worker-1")).toBe(true);
    expect(isIntendedWorker(admin, "worker-2")).toBe(false);
  });

  it("strips employee salary and midpoint details while retaining aggregates", () => {
    expect(stripCompensationDetails({
      total: 120000,
      employees: [{ name: "A", annualSalary: 80000, payRangeMid: 90000 }],
    })).toEqual({ total: 120000, employees: [{ name: "A" }] });
  });
});
