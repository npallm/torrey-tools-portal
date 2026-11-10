import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import {
  approvalRequestEmail,
  currentStep,
  decide,
  decisionEmail,
  startChain,
  withdraw,
  type ApprovalState,
  type ApproverRef,
  type Decision,
} from "../approvals/workflow";
import { changeRequests as legacyRequests } from "../data";

const changeTypeLabels: Record<string, string> = {
  title: "Title change",
  compensation: "Compensation change",
  department: "Department transfer",
  schedule: "Schedule change",
  manager: "Manager change",
  status: "Status change",
};

type SeedDecision = Decision;
type SeedRequest = {
  subject: string;
  submitter: string;
  changeType: keyof typeof changeTypeLabels;
  currentValue: string | null;
  requestedValue: string;
  effectiveDate: string;
  reason: string | null;
  createdAt: string;
  approvers: ApproverRef[];
  templateId: string | null;
  decisions?: SeedDecision[];
  withdrawn?: boolean;
};

type SeedPositions = {
  hrbpPositionId: string;
  vacantPositionId: string;
};

function dateAt(date: string, hour: number) {
  return `${date}T${String(hour).padStart(2, "0")}:00:00Z`;
}

function absoluteUrl(path: string) {
  return `${(process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "")}${path}`;
}

async function seedWorkerInfo(client: PoolClient, organizationId: string, workerId: string) {
  const result = await client.query<{
    id: string;
    employee_number: string | null;
    first_name: string;
    last_name: string;
    email: string | null;
  }>(
    `select w.id, w.employee_number, w.first_name, w.last_name, contact.value as email
     from workers w
     left join lateral (
       select wc.value from worker_contacts wc
       where wc.organization_id=$1 and wc.worker_id=w.id and wc.kind='email' and wc.usage='work'
       order by wc.is_primary desc, wc.id limit 1
     ) contact on true
     where w.organization_id=$1 and w.id=$2`,
    [organizationId, workerId],
  );
  const worker = result.rows[0];
  if (!worker) throw new Error(`Cannot seed approvals for unknown worker ${workerId}`);
  return {
    id: worker.id,
    name: `${worker.first_name} ${worker.last_name}`,
    email: worker.email || `${worker.employee_number ?? worker.id}@example.invalid`,
  };
}

export async function seedChangeRequests(
  client: PoolClient,
  organizationId: string,
  workerIds: Map<string, string>,
  positions: SeedPositions,
) {
  const worker = (employeeId: string) => {
    const workerId = workerIds.get(employeeId);
    if (!workerId) throw new Error(`Missing seeded worker ${employeeId}`);
    return workerId;
  };
  const positionHolders = await client.query<{ position_id: string; worker_id: string }>(
    `select ja.position_id, ja.worker_id from job_assignments ja
     where ja.organization_id=$1 and ja.position_id is not null
       and ja.effective_from <= current_date and (ja.effective_to is null or ja.effective_to >= current_date)`,
    [organizationId],
  );
  const holdersByPosition = new Map<string, string[]>();
  for (const row of positionHolders.rows) {
    holdersByPosition.set(row.position_id, [...(holdersByPosition.get(row.position_id) ?? []), row.worker_id]);
  }
  const resolve = (approver: ApproverRef) => approver.kind === "worker"
    ? [approver.workerId]
    : holdersByPosition.get(approver.positionId) ?? [];
  const person = (employeeId: string): ApproverRef => ({ kind: "worker", workerId: worker(employeeId) });
  const role = (positionId: string): ApproverRef => ({ kind: "position", positionId });

  async function insertTemplate(
    name: string,
    changeType: string | null,
    isDefault: boolean,
    approvers: ApproverRef[],
  ) {
    const result = await client.query<{ id: string }>(
      `insert into approval_chain_templates (organization_id,name,change_type,is_default)
       values ($1,$2,$3,$4) returning id`,
      [organizationId, name, changeType, isDefault],
    );
    const id = result.rows[0].id;
    for (const [index, approver] of approvers.entries()) {
      await client.query(
        `insert into approval_chain_template_steps
           (template_id,step_number,approver_kind,approver_worker_id,approver_position_id)
         values ($1,$2,$3,$4,$5)`,
        [id, index + 1, approver.kind,
          approver.kind === "worker" ? approver.workerId : null,
          approver.kind === "position" ? approver.positionId : null],
      );
    }
    return id;
  }

  const compensationTemplate = await insertTemplate(
    "Compensation change",
    "compensation",
    true,
    [person("emp-002"), role(positions.hrbpPositionId), person("emp-010"), person("emp-001")],
  );
  const standardTemplate = await insertTemplate(
    "Standard change",
    null,
    true,
    [person("emp-002"), role(positions.hrbpPositionId)],
  );
  await insertTemplate(
    "Executive six-step chain",
    "manager",
    false,
    ["emp-002", "emp-001", "emp-009", "emp-010", "emp-011", "emp-012"].map(person),
  );

  const oldTitleRequest = legacyRequests.find((request) => request.id === "cr-001")!;
  const oldScheduleRequest = legacyRequests.find((request) => request.id === "cr-002")!;
  const seeds: SeedRequest[] = [
    {
      subject: oldTitleRequest.employeeId,
      submitter: "emp-001",
      changeType: "title",
      currentValue: null,
      requestedValue: oldTitleRequest.details,
      effectiveDate: "2026-12-01",
      reason: null,
      createdAt: dateAt(oldTitleRequest.submittedAt, 10),
      approvers: [role(positions.hrbpPositionId), person("emp-010")],
      templateId: standardTemplate,
    },
    {
      subject: oldScheduleRequest.employeeId,
      submitter: "emp-004",
      changeType: "schedule",
      currentValue: "5-day schedule",
      requestedValue: oldScheduleRequest.details,
      effectiveDate: "2026-12-01",
      reason: null,
      createdAt: dateAt(oldScheduleRequest.submittedAt, 10),
      approvers: [role(positions.hrbpPositionId), person("emp-010")],
      templateId: standardTemplate,
      decisions: [
        { actorWorkerId: worker("emp-026"), decision: "approve" },
        { actorWorkerId: worker("emp-010"), decision: "approve" },
      ],
    },
    {
      subject: "emp-005",
      submitter: "emp-003",
      changeType: "compensation",
      currentValue: "$84,000",
      requestedValue: "$92,000",
      effectiveDate: "2026-12-01",
      reason: "Pay alignment after expanded responsibilities.",
      createdAt: dateAt("2026-11-07", 9),
      approvers: [person("emp-002"), role(positions.hrbpPositionId), person("emp-010"), person("emp-001")],
      templateId: compensationTemplate,
    },
    {
      subject: "emp-003",
      submitter: "emp-002",
      changeType: "department",
      currentValue: "Operations",
      requestedValue: "People",
      effectiveDate: "2026-12-01",
      reason: "Transition into the People team.",
      createdAt: dateAt("2026-11-05", 14),
      approvers: [person("emp-001"), role(positions.hrbpPositionId)],
      templateId: standardTemplate,
      decisions: [{ actorWorkerId: worker("emp-001"), decision: "approve" }],
    },
    {
      subject: "emp-032",
      submitter: "emp-001",
      changeType: "title",
      currentValue: "Operations Analyst",
      requestedValue: "Senior Operations Analyst",
      effectiveDate: "2026-12-01",
      reason: "Scope and team impact have expanded.",
      createdAt: dateAt("2026-11-02", 11),
      approvers: [person("emp-009"), role(positions.hrbpPositionId)],
      templateId: standardTemplate,
      decisions: [
        { actorWorkerId: worker("emp-009"), decision: "approve" },
        { actorWorkerId: worker("emp-026"), decision: "reject", comment: "Please provide a completed leveling review." },
      ],
    },
    {
      subject: "emp-010",
      submitter: "emp-002",
      changeType: "schedule",
      currentValue: "5-day schedule",
      requestedValue: "Flexible schedule",
      effectiveDate: "2026-12-01",
      reason: "Request withdrawn before review.",
      createdAt: dateAt("2026-11-01", 12),
      approvers: [person("emp-001"), role(positions.hrbpPositionId)],
      templateId: standardTemplate,
      withdrawn: true,
    },
    {
      subject: "emp-012",
      submitter: "emp-002",
      changeType: "department",
      currentValue: "Client Services",
      requestedValue: "Revenue Operations",
      effectiveDate: "2026-12-15",
      reason: "Align reporting with a new operating model.",
      createdAt: dateAt("2026-11-06", 10),
      approvers: [person("emp-001"), role(positions.vacantPositionId), person("emp-010")],
      templateId: standardTemplate,
      decisions: [{ actorWorkerId: worker("emp-001"), decision: "approve" }],
    },
    {
      subject: "emp-053",
      submitter: "emp-018",
      changeType: "manager",
      currentValue: "Victor Huang",
      requestedValue: "Marcus Lee",
      effectiveDate: "2026-12-15",
      reason: "Proposed reporting-line adjustment.",
      createdAt: dateAt("2026-11-07", 13),
      approvers: ["emp-002", "emp-001", "emp-009", "emp-010", "emp-011", "emp-012"].map(person),
      templateId: null,
    },
  ];

  for (const [requestIndex, seed] of seeds.entries()) {
    const submitterId = worker(seed.submitter);
    const subjectId = worker(seed.subject);
    const stateAtStart = startChain(seed.approvers, resolve, submitterId, subjectId);
    let state: ApprovalState = stateAtStart;
    const activatedAt = new Map<number, string>([[1, seed.createdAt]]);
    const decisions = new Map<number, { actorWorkerId: string; decision: "approve" | "reject"; comment: string | null; decidedAt: string }>();
    const eventRows: { type: string; step: number | null; actor: string | null; detail: string; at: string }[] = [
      { type: "submitted", step: null, actor: submitterId, detail: "Change request submitted.", at: seed.createdAt },
      { type: "step_activated", step: 1, actor: null, detail: "Approval step activated.", at: seed.createdAt },
    ];

    for (const [decisionIndex, decision] of (seed.decisions ?? []).entries()) {
      const pending = currentStep(state);
      if (!pending) throw new Error("Seed approval decision has no active step.");
      const decisionAt = dateAt(seed.createdAt.slice(0, 10), 12 + decisionIndex);
      const next = decide(state, decision, resolve, submitterId, subjectId);
      state = next;
      decisions.set(pending.stepNumber, {
        actorWorkerId: decision.actorWorkerId,
        decision: decision.decision,
        comment: decision.comment?.trim() || null,
        decidedAt: decisionAt,
      });
      eventRows.push({
        type: decision.decision === "approve" ? "approved_step" : "rejected",
        step: pending.stepNumber,
        actor: decision.actorWorkerId,
        detail: decision.decision === "reject" ? decision.comment!.trim() : "Approval step approved.",
        at: decisionAt,
      });
      const nextPending = currentStep(state);
      if (nextPending && nextPending.stepNumber !== pending.stepNumber) {
        activatedAt.set(nextPending.stepNumber, decisionAt);
        eventRows.push({
          type: "step_activated",
          step: nextPending.stepNumber,
          actor: null,
          detail: "Approval step activated.",
          at: decisionAt,
        });
      }
    }
    if (seed.withdrawn) {
      state = withdraw(state);
      eventRows.push({
        type: "withdrawn",
        step: null,
        actor: submitterId,
        detail: "Request withdrawn by submitter.",
        at: dateAt(seed.createdAt.slice(0, 10), 15),
      });
    }
    const completedAt = state.status === "pending"
      ? null
      : decisions.size
        ? [...decisions.values()].at(-1)!.decidedAt
        : dateAt(seed.createdAt.slice(0, 10), 15);
    const createdAt = seed.createdAt;
    const requestResult = await client.query<{ id: string }>(
      `insert into change_requests
         (organization_id,worker_id,change_type,current_value,requested_value,effective_date,reason,status,
          submitted_by,submitted_by_worker_id,approval_template_id,created_at,completed_at,decided_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning id`,
      [organizationId, subjectId, seed.changeType, seed.currentValue, seed.requestedValue, seed.effectiveDate,
        seed.reason, state.status, seed.submitter, submitterId, seed.templateId, createdAt, completedAt, completedAt],
    );
    const requestId = requestResult.rows[0].id;

    for (const step of state.steps) {
      const decision = decisions.get(step.stepNumber);
      const activation = activatedAt.get(step.stepNumber);
      const stepResult = await client.query<{ id: string }>(
        `insert into change_request_approval_steps
           (organization_id,change_request_id,step_number,approver_kind,approver_worker_id,approver_position_id,
            status,eligible_worker_ids,decided_by_worker_id,decided_at,comment,activated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
        [organizationId, requestId, step.stepNumber, step.approver.kind,
          step.approver.kind === "worker" ? step.approver.workerId : null,
          step.approver.kind === "position" ? step.approver.positionId : null,
          step.status, step.eligibleWorkerIds, step.decidedByWorkerId, decision?.decidedAt ?? null,
          step.comment, activation ?? null],
      );
      if (!activation) continue;
      for (const approverId of step.eligibleWorkerIds) {
        const approver = await seedWorkerInfo(client, organizationId, approverId);
        const submitter = await seedWorkerInfo(client, organizationId, submitterId);
        const subject = await seedWorkerInfo(client, organizationId, subjectId);
        const token = randomBytes(24).toString("base64url");
        const linkPath = `/approvals/${token}`;
        await client.query(
          `insert into change_request_approval_links
             (organization_id,step_id,worker_id,token,used_at)
           values ($1,$2,$3,$4,$5)`,
          [organizationId, stepResult.rows[0].id, approverId, token, decision?.decidedAt ?? null],
        );
        const email = approvalRequestEmail({
          submitterName: submitter.name,
          subjectName: subject.name,
          approverName: approver.name,
          changeType: changeTypeLabels[seed.changeType],
          currentValue: seed.currentValue,
          requestedValue: seed.requestedValue,
          effectiveDate: seed.effectiveDate,
          reason: seed.reason,
          stepNumber: step.stepNumber,
          totalSteps: state.steps.length,
          link: absoluteUrl(linkPath),
        });
        await client.query(
          `insert into outbox_messages
             (organization_id,to_email,subject,body,link_path,related_table,related_id,created_at)
           values ($1,$2,$3,$4,$5,'change_requests',$6,$7)`,
          [organizationId, approver.email, email.subject, email.body, linkPath, requestId, activation],
        );
        eventRows.push({
          type: "email_queued",
          step: step.stepNumber,
          actor: null,
          detail: `Approval email queued for ${approver.name}.`,
          at: activation,
        });
      }
    }

    if (state.status === "approved" || state.status === "rejected") {
      const finalDecision = [...decisions.values()].at(-1);
      if (!finalDecision) throw new Error("Completed approval seed needs a final decision.");
      const submitter = await seedWorkerInfo(client, organizationId, submitterId);
      const subject = await seedWorkerInfo(client, organizationId, subjectId);
      const decider = await seedWorkerInfo(client, organizationId, finalDecision.actorWorkerId);
      const email = decisionEmail({
        submitterName: submitter.name,
        subjectName: subject.name,
        changeType: changeTypeLabels[seed.changeType],
        outcome: state.status,
        deciderName: decider.name,
        comment: finalDecision.comment,
        link: absoluteUrl(`/requests/${requestId}`),
      });
      await client.query(
        `insert into outbox_messages
           (organization_id,to_email,subject,body,link_path,related_table,related_id,created_at)
         values ($1,$2,$3,$4,$5,'change_requests',$6,$7)`,
        [organizationId, submitter.email, email.subject, email.body, `/requests/${requestId}`, requestId, completedAt],
      );
      eventRows.push({
        type: "email_queued",
        step: state.steps.length,
        actor: null,
        detail: `Decision email queued for ${submitter.name}.`,
        at: completedAt!,
      });
      if (state.status === "approved") {
        eventRows.push({
          type: "approved",
          step: state.steps.length,
          actor: finalDecision.actorWorkerId,
          detail: "All approval steps approved.",
          at: completedAt!,
        });
      }
    }

    for (const event of eventRows) {
      await client.query(
        `insert into change_request_events
           (organization_id,change_request_id,event_type,step_number,actor_worker_id,detail,occurred_at)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [organizationId, requestId, event.type, event.step, event.actor, event.detail, event.at],
      );
    }

    if (requestIndex === 0 && oldTitleRequest.id !== "cr-001") {
      throw new Error("Legacy change request seed order changed unexpectedly.");
    }
  }
}
