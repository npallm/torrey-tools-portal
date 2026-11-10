import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { getPool } from "@/lib/db";
import type { ApproverRef } from "@/lib/approvals/workflow";
import { startChain } from "@/lib/approvals/workflow";
import {
  decideChangeRequest,
  submitChangeRequest,
} from "@/lib/server/changeRequests";

const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;
let pool: Pool | null = null;
const db = () => (pool ??= getPool());
const runId = randomUUID();
const requestIds: string[] = [];

async function organizationId() {
  const result = await db().query<{ id: string }>("select id from organizations where slug='demo'");
  return result.rows[0].id;
}

async function workerId(fullName: string) {
  const [firstName, ...lastParts] = fullName.split(" ");
  const result = await db().query<{ id: string }>(
    `select id from workers
     where organization_id=$1 and first_name=$2 and last_name=$3`,
    [await organizationId(), firstName, lastParts.join(" ")],
  );
  if (!result.rows[0]) throw new Error(`Seeded worker not found: ${fullName}`);
  return result.rows[0].id;
}

async function testRequest(approvers: ApproverRef[]) {
  const [subjectWorkerId, submittedByWorkerId] = await Promise.all([
    workerId("Alana Brooks"),
    workerId("Maya Chen"),
  ]);
  const id = await submitChangeRequest({
    subjectWorkerId,
    submittedByWorkerId,
    changeType: "title",
    currentValue: "People Associate",
    requestedValue: `Approval test ${runId}`,
    effectiveDate: "2026-12-01",
    reason: `approval-test-${runId}`,
    approvers,
  });
  requestIds.push(id);
  return { id, subjectWorkerId, submittedByWorkerId };
}

async function firstToken(requestId: string) {
  const result = await db().query<{ token: string }>(
    `select l.token from change_request_approval_links l
     join change_request_approval_steps s on s.id=l.step_id
     where s.change_request_id=$1 and s.step_number=1`,
    [requestId],
  );
  if (!result.rows[0]) throw new Error("Expected an approval token for step 1.");
  return result.rows[0].token;
}

async function heldPosition(excludedWorkerIds: string[] = []) {
  const result = await db().query<{ position_id: string; worker_id: string }>(
    `select ja.position_id, ja.worker_id
     from job_assignments ja
     join positions p on p.id=ja.position_id and p.organization_id=ja.organization_id
     join workers w on w.id=ja.worker_id and w.organization_id=ja.organization_id
     where ja.organization_id=$1 and ja.position_id is not null
       and ja.effective_from <= current_date
       and (ja.effective_to is null or ja.effective_to >= current_date)
       and not (ja.worker_id=any($2::uuid[]))
     order by p.position_code nulls last, p.id
     limit 1`,
    [await organizationId(), excludedWorkerIds],
  );
  if (!result.rows[0]) throw new Error("No held position was seeded.");
  return result.rows[0];
}

databaseDescribe("change request approval database flow", () => {
  afterAll(async () => {
    if (pool) {
      if (requestIds.length) {
        await pool.query(
          "delete from outbox_messages where related_table='change_requests' and related_id=any($1::uuid[])",
          [requestIds],
        );
        await pool.query("delete from change_requests where id=any($1::uuid[])", [requestIds]);
      }
      await pool.end();
    }
  });

  it("stores a three-step chain, initial links, and the generic approval email subject", async () => {
    const [submitter, subject, firstApprover, lastApprover] = await Promise.all([
      workerId("Maya Chen"),
      workerId("Alana Brooks"),
      workerId("Jordan Reyes"),
      workerId("Olivia Grant"),
    ]);
    const position = await heldPosition([submitter, subject, firstApprover, lastApprover]);
    const approvers: ApproverRef[] = [
      { kind: "worker", workerId: firstApprover },
      { kind: "position", positionId: position.position_id },
      { kind: "worker", workerId: lastApprover },
    ];
    const { id } = await testRequest(approvers);
    const resolver = (approver: ApproverRef) => {
      if (approver.kind === "worker") return [approver.workerId];
      return approver.positionId === position.position_id ? [position.worker_id] : [];
    };
    const expected = startChain(approvers, resolver, submitter, subject);
    const stored = await db().query<{
      step_number: number;
      approver_kind: "worker" | "position";
      approver_worker_id: string | null;
      approver_position_id: string | null;
      status: string;
      eligible_worker_ids: string[];
    }>(
      `select step_number, approver_kind, approver_worker_id, approver_position_id,
              status, eligible_worker_ids
       from change_request_approval_steps where change_request_id=$1 order by step_number`,
      [id],
    );
    expect(stored.rows).toHaveLength(3);
    expect(stored.rows.map((row) => ({
      stepNumber: row.step_number,
      approver: row.approver_kind === "worker"
        ? { kind: "worker", workerId: row.approver_worker_id }
        : { kind: "position", positionId: row.approver_position_id },
      status: row.status,
      eligibleWorkerIds: row.eligible_worker_ids,
    }))).toEqual(expected.steps.map(({ stepNumber, approver, status, eligibleWorkerIds }) => ({
      stepNumber,
      approver,
      status,
      eligibleWorkerIds,
    })));
    const links = await db().query<{ count: string }>(
      `select count(*) as count from change_request_approval_links l
       join change_request_approval_steps s on s.id=l.step_id
       where s.change_request_id=$1 and s.step_number=1`,
      [id],
    );
    expect(Number(links.rows[0].count)).toBe(1);
    const message = await db().query<{ subject: string }>(
      `select subject from outbox_messages
       where related_table='change_requests' and related_id=$1 and link_path like '/approvals/%'
       limit 1`,
      [id],
    );
    expect(message.rows[0]?.subject).toBe("Maya Chen submitted a change request for Alana Brooks");
  });

  it("activates the next step and rejects a second use of the first token", async () => {
    const firstApprover = await workerId("Jordan Reyes");
    const nextApprover = await workerId("Olivia Grant");
    const { id } = await testRequest([
      { kind: "worker", workerId: firstApprover },
      { kind: "worker", workerId: nextApprover },
    ]);
    const token = await firstToken(id);
    await expect(decideChangeRequest(token, "approve")).resolves.toBe("pending");
    const secondStep = await db().query<{
      status: string;
      eligible_worker_ids: string[];
      activated_at: Date | null;
    }>(
      `select status, eligible_worker_ids, activated_at from change_request_approval_steps
       where change_request_id=$1 and step_number=2`,
      [id],
    );
    expect(secondStep.rows[0].status).toBe("pending");
    expect(secondStep.rows[0].eligible_worker_ids).toEqual([nextApprover]);
    expect(secondStep.rows[0].activated_at).not.toBeNull();
    const nextLink = await db().query<{ count: string }>(
      `select count(*) as count from change_request_approval_links l
       join change_request_approval_steps s on s.id=l.step_id
       where s.change_request_id=$1 and s.step_number=2`,
      [id],
    );
    expect(Number(nextLink.rows[0].count)).toBe(1);
    await expect(decideChangeRequest(token, "approve")).rejects.toThrow("already been used");
  });

  it("resolves a position step to its current holder", async () => {
    const submitter = await workerId("Maya Chen");
    const subject = await workerId("Alana Brooks");
    const position = await heldPosition([submitter, subject]);
    const { id } = await testRequest([{ kind: "position", positionId: position.position_id }]);
    const step = await db().query<{ eligible_worker_ids: string[] }>(
      "select eligible_worker_ids from change_request_approval_steps where change_request_id=$1 and step_number=1",
      [id],
    );
    expect(step.rows[0].eligible_worker_ids).toEqual([position.worker_id]);
  });

  it("requires a rejection comment, skips later steps, and emails the submitter", async () => {
    const approver = await workerId("Jordan Reyes");
    const nextApprover = await workerId("Olivia Grant");
    const { id } = await testRequest([
      { kind: "worker", workerId: approver },
      { kind: "worker", workerId: nextApprover },
    ]);
    const token = await firstToken(id);
    await expect(decideChangeRequest(token, "reject")).rejects.toThrow("comment is required");
    await expect(decideChangeRequest(token, "reject", "Budget is not approved.")).resolves.toBe("rejected");
    const result = await db().query<{
      status: string;
      completed_at: Date | null;
    }>("select status, completed_at from change_requests where id=$1", [id]);
    expect(result.rows[0].status).toBe("rejected");
    expect(result.rows[0].completed_at).not.toBeNull();
    const steps = await db().query<{ status: string; comment: string | null }>(
      "select status, comment from change_request_approval_steps where change_request_id=$1 order by step_number",
      [id],
    );
    expect(steps.rows.map((step) => step.status)).toEqual(["rejected", "skipped"]);
    expect(steps.rows[0].comment).toBe("Budget is not approved.");
    const decisionEmail = await db().query<{ subject: string; to_email: string }>(
      `select subject, to_email from outbox_messages
       where related_table='change_requests' and related_id=$1 and link_path=$2`,
      [id, `/requests/${id}`],
    );
    expect(decisionEmail.rows[0].subject).toContain("was rejected");
    expect(decisionEmail.rows[0].to_email).toContain("@example.invalid");
  });

  it("rejects seven steps and accepts six", async () => {
    const approver = await workerId("Jordan Reyes");
    const sixSteps = Array.from({ length: 6 }, () => ({ kind: "worker", workerId: approver } as const));
    await expect(testRequest([...sixSteps, { kind: "worker", workerId: approver }])).rejects.toThrow("at most 6");
    const { id } = await testRequest(sixSteps);
    const result = await db().query<{ count: string }>(
      "select count(*) as count from change_request_approval_steps where change_request_id=$1",
      [id],
    );
    expect(Number(result.rows[0].count)).toBe(6);
  });

  it("marks the request approved and completed after the final step", async () => {
    const approver = await workerId("Jordan Reyes");
    const { id } = await testRequest([{ kind: "worker", workerId: approver }]);
    const token = await firstToken(id);
    await expect(decideChangeRequest(token, "approve")).resolves.toBe("approved");
    const result = await db().query<{
      status: string;
      completed_at: Date | null;
    }>("select status, completed_at from change_requests where id=$1", [id]);
    expect(result.rows[0].status).toBe("approved");
    expect(result.rows[0].completed_at).not.toBeNull();
  });
});
