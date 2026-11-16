import { afterAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db";
import { createSessionRecord, getSessionUser } from "@/lib/auth/session-store";
import { resolvePortalUser } from "@/lib/auth/provisioning";
import { createAuthRequest, consumeAuthRequest } from "@/lib/server/auth";
import {
  createFeedbackRequest,
  getFeedbackRequestDetail,
  submitFeedbackResponse,
} from "@/lib/server/feedback";
import { getActivePeople } from "@/lib/server/org";
import { today } from "@/lib/server/common";
import type { CurrentUser } from "@/lib/auth/session-core";
import { getOneOnOneSeries, logOneOnOneMeeting } from "@/lib/server/oneOnOnes";

const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;
let pool: Pool | null = null;
const db = () => (pool ??= getPool());
const noAuthAccount = "No portal account for this email; ask your HR admin.";

async function demoOrganizationId() {
  const result = await db().query<{ id: string }>("select id from organizations where slug='demo'");
  return result.rows[0].id;
}

databaseDescribe("auth and peer feedback database flows", () => {
  afterAll(async () => {
    if (pool) await pool.end();
  });

  it("creates hashed sessions and rejects expired, idle, revoked, and inactive sessions", async () => {
    const organizationId = await demoOrganizationId();
    const user = await db().query<{ id: string }>(
      `insert into portal_users (organization_id,email,display_name,role)
       values ($1,$2,'Test account','employee') returning id`,
      [organizationId, `session-${randomUUID()}@example.invalid`],
    );
    const userId = user.rows[0].id;
    try {
      const active = await createSessionRecord(userId, "auth test");
      const stored = await db().query<{ token_hash: string; expires_at: Date }>(
        "select token_hash, expires_at from auth_sessions where portal_user_id=$1 order by created_at desc limit 1",
        [userId],
      );
      expect(stored.rows[0].token_hash).not.toBe(active.token);
      expect(stored.rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(stored.rows[0].expires_at.getTime()).toBeGreaterThan(Date.now());
      expect(await getSessionUser(active.token)).toMatchObject({ id: userId, email: expect.stringContaining("session-") });

      const expired = await createSessionRecord(userId);
      await db().query("update auth_sessions set expires_at=now()-interval '1 minute' where token_hash=$1", [
        (await import("@/lib/auth/session-core")).hashSessionToken(expired.token),
      ]);
      expect(await getSessionUser(expired.token)).toBeNull();

      const idle = await createSessionRecord(userId);
      await db().query("update auth_sessions set last_seen_at=now()-interval '3 hours' where token_hash=$1", [
        (await import("@/lib/auth/session-core")).hashSessionToken(idle.token),
      ]);
      expect(await getSessionUser(idle.token)).toBeNull();

      const revoked = await createSessionRecord(userId);
      await db().query("update auth_sessions set revoked_at=now() where token_hash=$1", [
        (await import("@/lib/auth/session-core")).hashSessionToken(revoked.token),
      ]);
      expect(await getSessionUser(revoked.token)).toBeNull();

      const inactive = await createSessionRecord(userId);
      await db().query("update portal_users set is_active=false where id=$1", [userId]);
      expect(await getSessionUser(inactive.token)).toBeNull();
    } finally {
      await db().query("delete from portal_users where id=$1", [userId]);
    }
  });

  it("links identities by email or subject, provisions by work email, and consumes auth requests once", async () => {
    const organizationId = await demoOrganizationId();
    const marker = randomUUID();
    const portalUser = await db().query<{ id: string }>(
      `insert into portal_users (organization_id,email,display_name,role)
       values ($1,$2,'Link target','employee') returning id`,
      [organizationId, `link-${marker}@example.invalid`],
    );
    const linkedProvider = await db().query<{ id: string }>(
      `insert into identity_providers (organization_id,kind,display_name,enabled)
       values ($1,'oidc','Link test',true) returning id`,
      [organizationId],
    );
    const jitProvider = await db().query<{ id: string }>(
      `insert into identity_providers
         (organization_id,kind,display_name,enabled,jit_provisioning,default_role)
       values ($1,'oidc','JIT test',true,true,'employee') returning id`,
      [organizationId],
    );
    const offProvider = await db().query<{ id: string }>(
      `insert into identity_providers (organization_id,kind,display_name,enabled,jit_provisioning)
       values ($1,'oidc','JIT off',true,false) returning id`,
      [organizationId],
    );
    const contact = await db().query<{ worker_id: string }>(
      `select worker_id from worker_contacts where organization_id=$1 and kind='email' and usage='work' limit 1`,
      [organizationId],
    );
    const jitEmail = `jit-${marker}@torreytools.com`;
    await db().query(
      `insert into worker_contacts (organization_id,worker_id,kind,usage,value)
       values ($1,$2,'email','work',$3)`,
      [organizationId, contact.rows[0].worker_id, jitEmail],
    );
    let jitUserId: string | null = null;
    try {
      const linkedId = await resolvePortalUser(
        organizationId,
        linkedProvider.rows[0].id,
        "subject-1",
        `link-${marker}@example.invalid`,
      );
      expect(linkedId).toBe(portalUser.rows[0].id);
      expect(await resolvePortalUser(organizationId, linkedProvider.rows[0].id, "subject-1", "different@example.invalid"))
        .toBe(portalUser.rows[0].id);

      jitUserId = await resolvePortalUser(organizationId, jitProvider.rows[0].id, "jit-subject", jitEmail);
      const jit = await db().query<{ worker_id: string | null; role: string }>(
        "select worker_id,role from portal_users where id=$1",
        [jitUserId],
      );
      expect(jit.rows[0]).toEqual({ worker_id: contact.rows[0].worker_id, role: "employee" });
      await expect(resolvePortalUser(
        organizationId,
        offProvider.rows[0].id,
        "no-jit-subject",
        `no-jit-${marker}@example.invalid`,
      )).rejects.toThrow(noAuthAccount);

      const state = `state-${marker}`;
      await createAuthRequest({
        state,
        providerId: linkedProvider.rows[0].id,
        nonce: "nonce",
        codeVerifier: "verifier",
        returnTo: "//untrusted.example/path",
      });
      const consumed = await consumeAuthRequest(state);
      expect(consumed?.return_to).toBe("/");
      expect(await consumeAuthRequest(state)).toBeNull();
    } finally {
      await db().query("delete from worker_contacts where value=$1", [jitEmail]);
      if (jitUserId) await db().query("delete from portal_users where id=$1", [jitUserId]);
      await db().query("delete from portal_users where id=$1", [portalUser.rows[0].id]);
      await db().query("delete from identity_providers where id=any($1::uuid[])", [
        [linkedProvider.rows[0].id, jitProvider.rows[0].id, offProvider.rows[0].id],
      ]);
    }
  });

  it("queues feedback emails, enforces recipient ownership and unlocks results at three responses", async () => {
    const organizationId = await demoOrganizationId();
    const people = await getActivePeople();
    const manager = people.find((person) => people.some((report) => report.managerId === person.id));
    expect(manager).toBeDefined();
    const subject = people.find((person) => person.managerId === manager!.id);
    expect(subject).toBeDefined();
    const peerIds = people
      .filter((person) => person.id !== manager!.id && person.id !== subject!.id)
      .slice(0, 5)
      .map((person) => person.id);
    const due = new Date(`${today()}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 30);
    const requestId = await createFeedbackRequest({
      organizationId,
      requesterWorkerId: manager!.id,
      subjectWorkerId: subject!.id,
      recipientWorkerIds: peerIds,
      message: "Please share a thoughtful perspective.",
      dueDate: due.toISOString().slice(0, 10),
    });
    try {
      const queued = await db().query<{ count: string }>(
        `select count(*) from outbox_messages
         where related_table='feedback_requests' and related_id=$1 and status='queued'`,
        [requestId],
      );
      expect(Number(queued.rows[0].count)).toBe(5);
      const recipients = await db().query<{ token: string; peer_worker_id: string }>(
        "select token,peer_worker_id from feedback_request_recipients where request_id=$1 order by id",
        [requestId],
      );
      await expect(submitFeedbackResponse({
        token: recipients.rows[0].token,
        viewerWorkerId: "00000000-0000-0000-0000-000000000001",
        rating: 4,
        keepDoing: "Continue.",
        doDifferently: "Ask more.",
        anythingElse: "",
      })).rejects.toThrow("This link belongs to another person.");
      for (const recipient of recipients.rows.slice(0, 2)) {
        await submitFeedbackResponse({
          token: recipient.token,
          viewerWorkerId: recipient.peer_worker_id,
          rating: 4,
          keepDoing: "Continue sharing context.",
          doDifferently: "Invite input earlier.",
          anythingElse: "",
        });
      }
      const viewer: CurrentUser = {
        id: randomUUID(),
        organizationId,
        role: "manager",
        workerId: manager!.id,
        email: "feedback-manager@example.invalid",
        displayName: "Feedback manager",
        canViewCompensation: false,
        canViewDemographics: false,
      };
      const locked = await getFeedbackRequestDetail(requestId, viewer);
      expect(locked?.unlocked).toBe(false);
      expect(locked?.responses).toEqual([]);
      const third = recipients.rows[2];
      await submitFeedbackResponse({
        token: third.token,
        viewerWorkerId: third.peer_worker_id,
        rating: 5,
        keepDoing: "Keep facilitating.",
        doDifferently: "Share priorities.",
        anythingElse: "",
      });
      const unlocked = await getFeedbackRequestDetail(requestId, viewer);
      expect(unlocked?.unlocked).toBe(true);
      expect(unlocked?.responses).toHaveLength(3);
      expect(unlocked?.averageRating).toBeCloseTo(13 / 3);
      expect(unlocked?.responses[0]).not.toHaveProperty("id");
    } finally {
      await db().query(
        "delete from outbox_messages where related_table='feedback_requests' and related_id=$1",
        [requestId],
      );
      await db().query("delete from feedback_requests where id=$1", [requestId]);
    }
  });

  it("shows each 1:1 participant only their private meeting notes", async () => {
    const organizationId = await demoOrganizationId();
    const series = await db().query<{
      id: string;
      manager_worker_id: string;
      report_worker_id: string;
    }>(
      "select id,manager_worker_id,report_worker_id from one_on_one_series where organization_id=$1 limit 1",
      [organizationId],
    );
    const row = series.rows[0];
    expect(row).toBeDefined();
    const thirdParty = await db().query<{ id: string }>(
      `select id from workers where organization_id=$1 and id<>all($2::uuid[]) limit 1`,
      [organizationId, [row.manager_worker_id, row.report_worker_id]],
    );
    const manager: CurrentUser = {
      id: randomUUID(), organizationId, role: "manager", workerId: row.manager_worker_id,
      email: "manager@example.invalid", displayName: "Manager", canViewCompensation: false, canViewDemographics: false,
    };
    const report: CurrentUser = {
      ...manager, id: randomUUID(), role: "employee", workerId: row.report_worker_id,
      email: "report@example.invalid", displayName: "Report",
    };
    const outsider: CurrentUser = {
      ...manager, id: randomUUID(), role: "client_admin", workerId: thirdParty.rows[0].id,
      email: "admin@example.invalid", displayName: "Admin", canViewCompensation: true,
    };
    const meetingDate = today();
    const managerMeeting = await logOneOnOneMeeting({
      seriesId: row.id, meetingDate, sharedNotes: "Shared manager note", privateNote: "Manager-only text",
      viewerWorkerId: row.manager_worker_id, reportPulse: null,
    });
    const reportMeeting = await logOneOnOneMeeting({
      seriesId: row.id, meetingDate, sharedNotes: "Shared report note", privateNote: "Report-only text",
      viewerWorkerId: row.report_worker_id, reportPulse: null,
    });
    try {
      const managerView = await getOneOnOneSeries(row.id, manager);
      const reportView = await getOneOnOneSeries(row.id, report);
      const outsiderView = await getOneOnOneSeries(row.id, outsider);
      expect(managerView?.meetings.some((meeting) => meeting.manager_private_notes === "Manager-only text")).toBe(true);
      expect(managerView?.meetings.some((meeting) => meeting.report_private_notes === "Report-only text")).toBe(false);
      expect(reportView?.meetings.some((meeting) => meeting.report_private_notes === "Report-only text")).toBe(true);
      expect(reportView?.meetings.some((meeting) => meeting.manager_private_notes === "Manager-only text")).toBe(false);
      expect(outsiderView?.canViewDetails).toBe(false);
      expect(outsiderView?.meetings).toEqual([]);
      expect(outsiderView?.agenda).toEqual([]);
      expect(outsiderView?.actions).toEqual([]);
    } finally {
      await db().query("delete from one_on_one_meetings where id=any($1::uuid[])", [
        [managerMeeting, reportMeeting],
      ]);
    }
  });
});
