import { randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  approvalRequestEmail,
  currentStep,
  decide,
  decisionEmail,
  reassignCurrentStep,
  startChain,
  validateChain,
  withdraw,
  type ApprovalState,
  type ApproverRef,
  type RequestStatus,
  type StepStatus,
} from "@/lib/approvals/workflow";
import { getActivePeople } from "@/lib/server/org";
import { demoOrganizationId, withFeatureDatabase } from "@/lib/server/common";
import { managerChain } from "@/lib/org/hierarchy";
import { isAdmin } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session-core";

export const CHANGE_REQUEST_TYPES = [
  { value: "title", label: "Title change" },
  { value: "compensation", label: "Compensation change" },
  { value: "department", label: "Department transfer" },
  { value: "schedule", label: "Schedule change" },
  { value: "manager", label: "Manager change" },
  { value: "status", label: "Status change" },
] as const;

export type ChangeType = (typeof CHANGE_REQUEST_TYPES)[number]["value"];

const CHANGE_TYPE_LABELS = Object.fromEntries(
  CHANGE_REQUEST_TYPES.map((item) => [item.value, item.label]),
) as Record<ChangeType, string>;
const CHANGE_TYPE_VALUES = new Set<string>(CHANGE_REQUEST_TYPES.map((item) => item.value));
const REQUEST_STATUS_VALUES = new Set<string>(["pending", "approved", "rejected", "withdrawn"]);

export type PositionOption = {
  id: string;
  positionCode: string | null;
  title: string;
  currentHolderName: string | null;
};

export type ApprovalTemplate = {
  id: string;
  name: string;
  changeType: ChangeType | null;
  isDefault: boolean;
  active: boolean;
  steps: ApproverRef[];
};

export type ChangeRequestInput = {
  subjectWorkerId: string;
  submittedByWorkerId: string;
  changeType: ChangeType;
  currentValue: string | null;
  requestedValue: string;
  effectiveDate: string;
  reason: string | null;
  approvers: ApproverRef[];
  approvalTemplateId?: string | null;
  viewerWorkerId?: string | null;
  allowAdmin?: boolean;
};

function displayName(firstName: string, lastName: string, preferredName: string | null) {
  return `${preferredName || firstName} ${lastName}`;
}

function absoluteUrl(path: string) {
  return `${(process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "")}${path}`;
}

function asIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeApprovers(value: unknown): ApproverRef[] {
  if (!Array.isArray(value)) throw new Error("Choose at least one approver.");
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || !("kind" in item)) {
      throw new Error(`Step ${index + 1} has no approver.`);
    }
    const ref = item as { kind?: unknown; workerId?: unknown; positionId?: unknown };
    if (ref.kind === "worker" && typeof ref.workerId === "string" && ref.workerId) {
      return { kind: "worker", workerId: ref.workerId };
    }
    if (ref.kind === "position" && typeof ref.positionId === "string" && ref.positionId) {
      return { kind: "position", positionId: ref.positionId };
    }
    throw new Error(`Step ${index + 1} has no approver.`);
  });
}

function validateChangeType(value: string): asserts value is ChangeType {
  if (!CHANGE_TYPE_VALUES.has(value)) throw new Error("Choose a valid change type.");
}

function validateRequestStatus(value: string | undefined): value is RequestStatus {
  return Boolean(value && REQUEST_STATUS_VALUES.has(value));
}

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const value = await work(client);
    await client.query("commit");
    return value;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function workerIdentity(
  client: PoolClient,
  organizationId: string,
  workerId: string,
) {
  const result = await client.query<{
    id: string;
    employee_number: string | null;
    first_name: string;
    last_name: string;
    preferred_name: string | null;
    work_email: string | null;
  }>(
    `select w.id, w.employee_number, w.first_name, w.last_name, w.preferred_name,
            contact.value as work_email
     from workers w
     left join lateral (
       select wc.value
       from worker_contacts wc
       where wc.organization_id = $1 and wc.worker_id = w.id
         and wc.kind = 'email' and wc.usage = 'work'
       order by wc.is_primary desc, wc.id
       limit 1
     ) contact on true
     where w.organization_id = $1 and w.id = $2`,
    [organizationId, workerId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: displayName(row.first_name, row.last_name, row.preferred_name),
    email: row.work_email || `${row.employee_number ?? row.id}@example.invalid`,
  };
}

async function positionOptions(pool: Pool, organizationId: string): Promise<PositionOption[]> {
  const result = await pool.query<{
    id: string;
    position_code: string | null;
    title: string;
    current_holder_name: string | null;
  }>(
    `select p.id, p.position_code, coalesce(jp.title, 'Unassigned position') as title,
            holder.name as current_holder_name
     from positions p
     left join job_profiles jp on jp.id = p.job_profile_id
     left join lateral (
       select coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as name
       from job_assignments ja
       join workers w on w.id = ja.worker_id
       where ja.organization_id = p.organization_id and ja.position_id = p.id
         and w.organization_id = ja.organization_id
         and ja.effective_from <= current_date
         and (ja.effective_to is null or ja.effective_to >= current_date)
       order by ja.effective_from desc, ja.id
       limit 1
     ) holder on true
     where p.organization_id = $1
     order by p.position_code nulls last, title`,
    [organizationId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    positionCode: row.position_code,
    title: row.title,
    currentHolderName: row.current_holder_name,
  }));
}

async function loadTemplates(
  pool: Pool,
  organizationId: string,
  includeInactive: boolean,
): Promise<ApprovalTemplate[]> {
  const templates = await pool.query<{
    id: string;
    name: string;
    change_type: ChangeType | null;
    is_default: boolean;
    active: boolean;
  }>(
    `select id, name, change_type, is_default, active
     from approval_chain_templates
     where organization_id = $1 and ($2::boolean or active)
     order by is_default desc, name`,
    [organizationId, includeInactive],
  );
  if (!templates.rows.length) return [];
  const steps = await pool.query<{
    template_id: string;
    approver_kind: "worker" | "position";
    approver_worker_id: string | null;
    approver_position_id: string | null;
  }>(
    `select template_id, approver_kind, approver_worker_id, approver_position_id
     from approval_chain_template_steps
     where template_id = any($1::uuid[])
     order by template_id, step_number`,
    [templates.rows.map((template) => template.id)],
  );
  const byTemplate = new Map<string, ApproverRef[]>();
  for (const step of steps.rows) {
    const ref: ApproverRef = step.approver_kind === "worker"
      ? { kind: "worker", workerId: step.approver_worker_id! }
      : { kind: "position", positionId: step.approver_position_id! };
    byTemplate.set(step.template_id, [...(byTemplate.get(step.template_id) ?? []), ref]);
  }
  return templates.rows.map((template) => ({
    id: template.id,
    name: template.name,
    changeType: template.change_type,
    isDefault: template.is_default,
    active: template.active,
    steps: byTemplate.get(template.id) ?? [],
  }));
}

export async function getChangeRequestFormData(viewer?: CurrentUser) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const [people, positions, templates] = await Promise.all([
      getActivePeople(),
      positionOptions(pool, organizationId),
      loadTemplates(pool, organizationId, false),
    ]);
    return {
      people: viewer && !isAdmin(viewer)
        ? viewer.workerId ? people.filter((person) => person.managerId === viewer.workerId) : []
        : people,
      positions,
      templates,
    };
  });
}

export async function getApprovalTemplates(includeInactive = true) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    return loadTemplates(pool, organizationId, includeInactive);
  });
}

async function resolverFor(
  client: PoolClient,
  organizationId: string,
  approvers: ApproverRef[],
) {
  const positionIds = [...new Set(
    approvers.flatMap((approver) => approver.kind === "position" ? [approver.positionId] : []),
  )];
  const holders = new Map<string, string[]>();
  if (positionIds.length) {
    const result = await client.query<{ position_id: string; worker_id: string }>(
      `select distinct on (ja.position_id, ja.worker_id) ja.position_id, ja.worker_id
       from job_assignments ja
       join positions p on p.id = ja.position_id and p.organization_id = ja.organization_id
       join workers w on w.id = ja.worker_id and w.organization_id = ja.organization_id
       where ja.organization_id = $1 and ja.position_id = any($2::uuid[])
         and ja.effective_from <= current_date
         and (ja.effective_to is null or ja.effective_to >= current_date)
       order by ja.position_id, ja.worker_id, ja.effective_from desc`,
      [organizationId, positionIds],
    );
    for (const row of result.rows) {
      holders.set(row.position_id, [...(holders.get(row.position_id) ?? []), row.worker_id]);
    }
  }
  return (approver: ApproverRef): string[] =>
    approver.kind === "worker" ? [approver.workerId] : holders.get(approver.positionId) ?? [];
}

async function ensureApproversExist(
  client: PoolClient,
  organizationId: string,
  approvers: ApproverRef[],
) {
  const workerIds = [...new Set(approvers.flatMap((approver) => approver.kind === "worker" ? [approver.workerId] : []))];
  const positionIds = [...new Set(approvers.flatMap((approver) => approver.kind === "position" ? [approver.positionId] : []))];
  const workers = workerIds.length
    ? await client.query<{ id: string }>(
      "select id from workers where organization_id = $1 and id = any($2::uuid[])",
      [organizationId, workerIds],
    )
    : { rows: [] as { id: string }[] };
  const positions = positionIds.length
    ? await client.query<{ id: string }>(
      "select id from positions where organization_id = $1 and id = any($2::uuid[])",
      [organizationId, positionIds],
    )
    : { rows: [] as { id: string }[] };
  if (workers.rows.length !== workerIds.length) throw new Error("Choose an active worker from this organization.");
  if (positions.rows.length !== positionIds.length) throw new Error("Choose a position from this organization.");
}

async function insertEvent(
  client: PoolClient,
  organizationId: string,
  requestId: string,
  type: "submitted" | "step_activated" | "approved_step" | "rejected" | "approved" | "withdrawn" | "reassigned" | "email_queued",
  stepNumber: number | null,
  actorWorkerId: string | null,
  detail: string | null,
) {
  await client.query(
    `insert into change_request_events
       (organization_id, change_request_id, event_type, step_number, actor_worker_id, detail)
     values ($1,$2,$3,$4,$5,$6)`,
    [organizationId, requestId, type, stepNumber, actorWorkerId, detail],
  );
}

type RequestEmailData = {
  requestId: string;
  subjectWorkerId: string;
  submittedByWorkerId: string;
  changeType: ChangeType;
  currentValue: string | null;
  requestedValue: string;
  effectiveDate: string;
  reason: string | null;
};

async function queueApproverMessages(
  client: PoolClient,
  organizationId: string,
  request: RequestEmailData,
  stepNumber: number,
  totalSteps: number,
  eligibleWorkerIds: string[],
) {
  const submitter = await workerIdentity(client, organizationId, request.submittedByWorkerId);
  const subject = await workerIdentity(client, organizationId, request.subjectWorkerId);
  const step = await client.query<{ id: string }>(
    `select id from change_request_approval_steps
     where organization_id = $1 and change_request_id = $2 and step_number = $3`,
    [organizationId, request.requestId, stepNumber],
  );
  if (!submitter || !subject || !step.rows[0]) throw new Error("The request approver could not be loaded.");
  for (const workerId of eligibleWorkerIds) {
    const approver = await workerIdentity(client, organizationId, workerId);
    if (!approver) continue;
    const token = randomBytes(24).toString("base64url");
    const path = `/approvals/${token}`;
    await client.query(
      `insert into change_request_approval_links (organization_id, step_id, worker_id, token)
       values ($1,$2,$3,$4)`,
      [organizationId, step.rows[0].id, workerId, token],
    );
    const email = approvalRequestEmail({
      submitterName: submitter.name,
      subjectName: subject.name,
      approverName: approver.name,
      changeType: CHANGE_TYPE_LABELS[request.changeType],
      currentValue: request.currentValue,
      requestedValue: request.requestedValue,
      effectiveDate: request.effectiveDate,
      reason: request.reason,
      stepNumber,
      totalSteps,
      link: absoluteUrl(path),
    });
    await client.query(
      `insert into outbox_messages
         (organization_id, to_email, subject, body, link_path, related_table, related_id)
       values ($1,$2,$3,$4,$5,'change_requests',$6)`,
      [organizationId, approver.email, email.subject, email.body, path, request.requestId],
    );
    await insertEvent(
      client,
      organizationId,
      request.requestId,
      "email_queued",
      stepNumber,
      null,
      `Approval email queued for ${approver.name}.`,
    );
  }
}

async function saveSteps(
  client: PoolClient,
  organizationId: string,
  requestId: string,
  state: ApprovalState,
  previousState?: ApprovalState,
) {
  for (const step of state.steps) {
    const previous = previousState?.steps.find((item) => item.stepNumber === step.stepNumber);
    const activated = step.status === "pending" && previous?.status !== "pending";
    const decided = (step.status === "approved" || step.status === "rejected") && previous?.status === "pending";
    if (!previous) {
      await client.query(
        `insert into change_request_approval_steps
           (organization_id, change_request_id, step_number, approver_kind,
            approver_worker_id, approver_position_id, status, eligible_worker_ids, activated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,case when $7 = 'pending' then now() else null end)`,
        [
          organizationId,
          requestId,
          step.stepNumber,
          step.approver.kind,
          step.approver.kind === "worker" ? step.approver.workerId : null,
          step.approver.kind === "position" ? step.approver.positionId : null,
          step.status,
          step.eligibleWorkerIds,
        ],
      );
    } else {
      await client.query(
        `update change_request_approval_steps
         set approver_kind = $1, approver_worker_id = $2, approver_position_id = $3,
             status = $4, eligible_worker_ids = $5,
             decided_by_worker_id = $6,
             comment = $7,
             decided_at = case when $8 then now() else decided_at end,
             activated_at = case when $9 then now() else activated_at end
         where organization_id = $10 and change_request_id = $11 and step_number = $12`,
        [
          step.approver.kind,
          step.approver.kind === "worker" ? step.approver.workerId : null,
          step.approver.kind === "position" ? step.approver.positionId : null,
          step.status,
          step.eligibleWorkerIds,
          step.decidedByWorkerId,
          step.comment,
          decided,
          activated,
          organizationId,
          requestId,
          step.stepNumber,
        ],
      );
    }
  }
}

export async function submitChangeRequest(input: ChangeRequestInput): Promise<string> {
  validateChangeType(input.changeType);
  const approvers = normalizeApprovers(input.approvers);
  const chainError = validateChain(approvers);
  if (chainError) throw new Error(chainError);
  const requestedValue = input.requestedValue.trim();
  if (!input.subjectWorkerId || !input.submittedByWorkerId) throw new Error("Choose an employee and submitter.");
  if (!requestedValue) throw new Error("Enter the requested change.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate) || Number.isNaN(Date.parse(`${input.effectiveDate}T00:00:00Z`))) {
    throw new Error("Choose a valid effective date.");
  }

  return withFeatureDatabase((pool) => inTransaction(pool, async (client) => {
    const organizationId = await demoOrganizationId(client);
    if (input.viewerWorkerId !== undefined) {
      if (!input.viewerWorkerId) throw new Error("This account is not linked to a worker.");
      if (input.submittedByWorkerId !== input.viewerWorkerId) {
        throw new Error("You can submit a request only for your own account.");
      }
      if (!input.allowAdmin) {
        const people = await getActivePeople();
        if (managerChain(input.subjectWorkerId, people).at(0) !== input.viewerWorkerId) {
          throw new Error("Managers can submit requests only for their direct reports.");
        }
      }
    }
    const [submitter, subject] = await Promise.all([
      workerIdentity(client, organizationId, input.submittedByWorkerId),
      workerIdentity(client, organizationId, input.subjectWorkerId),
    ]);
    if (!submitter || !subject) throw new Error("Choose an active employee from this organization.");
    await ensureApproversExist(client, organizationId, approvers);
    if (input.approvalTemplateId) {
      const template = await client.query(
        "select 1 from approval_chain_templates where organization_id=$1 and id=$2 and active",
        [organizationId, input.approvalTemplateId],
      );
      if (!template.rowCount) throw new Error("The selected approval template is not available.");
    }
    const resolver = await resolverFor(client, organizationId, approvers);
    const state = startChain(approvers, resolver, input.submittedByWorkerId, input.subjectWorkerId);
    const inserted = await client.query<{ id: string }>(
      `insert into change_requests
         (organization_id, worker_id, change_type, current_value, requested_value, effective_date,
          reason, status, submitted_by, submitted_by_worker_id, approval_template_id)
       values ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10)
       returning id`,
      [
        organizationId,
        input.subjectWorkerId,
        input.changeType,
        input.currentValue?.trim() || null,
        requestedValue,
        input.effectiveDate,
        input.reason?.trim() || null,
        submitter.name,
        input.submittedByWorkerId,
        input.approvalTemplateId || null,
      ],
    );
    const requestId = inserted.rows[0].id;
    await saveSteps(client, organizationId, requestId, state);
    await insertEvent(client, organizationId, requestId, "submitted", null, input.submittedByWorkerId, "Change request submitted.");
    const firstStep = currentStep(state);
    if (firstStep) {
      await insertEvent(client, organizationId, requestId, "step_activated", firstStep.stepNumber, null, "Approval step activated.");
      await queueApproverMessages(client, organizationId, {
        requestId,
        subjectWorkerId: input.subjectWorkerId,
        submittedByWorkerId: input.submittedByWorkerId,
        changeType: input.changeType,
        currentValue: input.currentValue?.trim() || null,
        requestedValue,
        effectiveDate: input.effectiveDate,
        reason: input.reason?.trim() || null,
      }, firstStep.stepNumber, state.steps.length, firstStep.eligibleWorkerIds);
    }
    return requestId;
  }));
}

type StoredStepRow = {
  step_number: number;
  approver_kind: "worker" | "position";
  approver_worker_id: string | null;
  approver_position_id: string | null;
  status: StepStatus;
  eligible_worker_ids: string[];
  decided_by_worker_id: string | null;
  comment: string | null;
};

async function loadApprovalState(
  client: PoolClient,
  organizationId: string,
  requestId: string,
): Promise<ApprovalState> {
  const result = await client.query<StoredStepRow>(
    `select step_number, approver_kind, approver_worker_id, approver_position_id,
            status, eligible_worker_ids, decided_by_worker_id, comment
     from change_request_approval_steps
     where organization_id = $1 and change_request_id = $2
     order by step_number
     for update`,
    [organizationId, requestId],
  );
  return {
    status: "pending",
    steps: result.rows.map((row) => ({
      stepNumber: row.step_number,
      approver: row.approver_kind === "worker"
        ? { kind: "worker", workerId: row.approver_worker_id! }
        : { kind: "position", positionId: row.approver_position_id! },
      status: row.status,
      eligibleWorkerIds: row.eligible_worker_ids ?? [],
      decidedByWorkerId: row.decided_by_worker_id,
      comment: row.comment,
    })),
  };
}

type RequestEmailRow = {
  id: string;
  organization_id: string;
  worker_id: string;
  submitted_by_worker_id: string;
  change_type: ChangeType;
  current_value: string | null;
  requested_value: string;
  effective_date: string;
  reason: string | null;
  status: RequestStatus;
};

function emailData(row: RequestEmailRow): RequestEmailData {
  return {
    requestId: row.id,
    subjectWorkerId: row.worker_id,
    submittedByWorkerId: row.submitted_by_worker_id,
    changeType: row.change_type,
    currentValue: row.current_value,
    requestedValue: row.requested_value,
    effectiveDate: row.effective_date,
    reason: row.reason,
  };
}

export async function decideChangeRequest(
  token: string,
  decision: "approve" | "reject",
  comment?: string,
): Promise<RequestStatus> {
  return withFeatureDatabase((pool) => inTransaction(pool, async (client) => {
    const result = await client.query<RequestEmailRow & {
      link_id: string;
      step_id: string;
      step_number: number;
      step_status: StepStatus;
      eligible_worker_ids: string[];
      link_used_at: string | Date | null;
      link_worker_id: string;
    }>(
      `select l.id as link_id, l.used_at as link_used_at, l.worker_id as link_worker_id,
              s.id as step_id, s.step_number, s.status as step_status, s.eligible_worker_ids,
              cr.id, cr.organization_id, cr.worker_id, cr.submitted_by_worker_id,
              cr.change_type, cr.current_value, cr.requested_value, cr.effective_date,
              cr.reason, cr.status
       from change_request_approval_links l
       join change_request_approval_steps s on s.id = l.step_id
       join change_requests cr on cr.id = s.change_request_id
       where l.token = $1
       for update of l, s, cr`,
      [token],
    );
    const row = result.rows[0];
    if (!row) throw new Error("This approval link is not valid.");
    if (row.link_used_at) throw new Error("This approval link has already been used.");
    if (row.status !== "pending" || row.step_status !== "pending") {
      throw new Error("This request no longer needs your action.");
    }
    const state = await loadApprovalState(client, row.organization_id, row.id);
    const priorStep = currentStep(state);
    if (!priorStep || priorStep.stepNumber !== row.step_number) {
      throw new Error("This request no longer needs your action.");
    }
    const resolver = await resolverFor(client, row.organization_id, state.steps.map((step) => step.approver));
    const nextState = decide(state, {
      actorWorkerId: row.link_worker_id,
      decision,
      comment,
    }, resolver, row.submitted_by_worker_id, row.worker_id);
    const actorWorkerId = row.link_worker_id;
    await saveSteps(client, row.organization_id, row.id, nextState, state);
    await client.query(
      "update change_request_approval_links set used_at = now() where id = $1",
      [row.link_id],
    );
    await insertEvent(
      client,
      row.organization_id,
      row.id,
      decision === "approve" ? "approved_step" : "rejected",
      row.step_number,
      actorWorkerId,
      decision === "reject" ? (comment?.trim() || null) : "Approval step approved.",
    );

    const nextStep = currentStep(nextState);
    if (nextStep && nextStep.stepNumber !== row.step_number) {
      await insertEvent(client, row.organization_id, row.id, "step_activated", nextStep.stepNumber, null, "Approval step activated.");
      await queueApproverMessages(
        client,
        row.organization_id,
        emailData(row),
        nextStep.stepNumber,
        nextState.steps.length,
        nextStep.eligibleWorkerIds,
      );
    } else if (nextState.status !== "pending") {
      await client.query(
        "update change_requests set status = $1, completed_at = now(), decided_at = now() where id = $2 and organization_id = $3",
        [nextState.status, row.id, row.organization_id],
      );
      if (nextState.status === "approved") {
        await insertEvent(client, row.organization_id, row.id, "approved", row.step_number, actorWorkerId, "All approval steps approved.");
      }
      const submitter = await workerIdentity(client, row.organization_id, row.submitted_by_worker_id);
      const subject = await workerIdentity(client, row.organization_id, row.worker_id);
      const decider = await workerIdentity(client, row.organization_id, actorWorkerId);
      if (submitter && subject && decider
        && (nextState.status === "approved" || nextState.status === "rejected")) {
        const path = `/requests/${row.id}`;
        const email = decisionEmail({
          submitterName: submitter.name,
          subjectName: subject.name,
          changeType: CHANGE_TYPE_LABELS[row.change_type],
          outcome: nextState.status,
          deciderName: decider.name,
          comment: decision === "reject" ? comment?.trim() || null : null,
          link: absoluteUrl(path),
        });
        await client.query(
          `insert into outbox_messages
             (organization_id, to_email, subject, body, link_path, related_table, related_id)
           values ($1,$2,$3,$4,$5,'change_requests',$6)`,
          [row.organization_id, submitter.email, email.subject, email.body, path, row.id],
        );
        await insertEvent(client, row.organization_id, row.id, "email_queued", row.step_number, null, `Decision email queued for ${submitter.name}.`);
      }
    }
    return nextState.status;
  }));
}

export async function withdrawChangeRequest(requestId: string, submitterWorkerId: string) {
  return withFeatureDatabase((pool) => inTransaction(pool, async (client) => {
    const organizationId = await demoOrganizationId(client);
    const request = await client.query<{
      status: RequestStatus;
      submitted_by_worker_id: string | null;
    }>(
      `select status, submitted_by_worker_id
       from change_requests where organization_id=$1 and id=$2 for update`,
      [organizationId, requestId],
    );
    const row = request.rows[0];
    if (!row) throw new Error("Change request not found.");
    if (!row.submitted_by_worker_id || row.submitted_by_worker_id !== submitterWorkerId) {
      throw new Error("Only the submitter can withdraw this request.");
    }
    if (row.status !== "pending") throw new Error("Only pending requests can be withdrawn.");
    const state = await loadApprovalState(client, organizationId, requestId);
    const nextState = withdraw(state);
    await saveSteps(client, organizationId, requestId, nextState, state);
    await client.query(
      "update change_requests set status='withdrawn', completed_at=now() where id=$1 and organization_id=$2",
      [requestId, organizationId],
    );
    await insertEvent(client, organizationId, requestId, "withdrawn", null, submitterWorkerId, "Request withdrawn by submitter.");
    return nextState.status;
  }));
}

export async function reassignChangeRequestStep(requestId: string, approver: ApproverRef) {
  const [normalized] = normalizeApprovers([approver]);
  return withFeatureDatabase((pool) => inTransaction(pool, async (client) => {
    const organizationId = await demoOrganizationId(client);
    const requestResult = await client.query<{
      status: RequestStatus;
      worker_id: string;
      submitted_by_worker_id: string | null;
      change_type: ChangeType;
      current_value: string | null;
      requested_value: string;
      effective_date: string;
      reason: string | null;
    }>(
      `select status, worker_id, submitted_by_worker_id, change_type, current_value,
              requested_value, effective_date, reason
       from change_requests where organization_id=$1 and id=$2 for update`,
      [organizationId, requestId],
    );
    const request = requestResult.rows[0];
    if (!request) throw new Error("Change request not found.");
    if (request.status !== "pending" || !request.submitted_by_worker_id) {
      throw new Error("No step is awaiting approval.");
    }
    const state = await loadApprovalState(client, organizationId, requestId);
    const activeStep = currentStep(state);
    if (!activeStep) throw new Error("No step is awaiting approval.");
    if (activeStep.eligibleWorkerIds.length) throw new Error("This step already has eligible approvers.");
    await ensureApproversExist(client, organizationId, [normalized]);
    const resolver = await resolverFor(client, organizationId, [...state.steps.map((step) => step.approver), normalized]);
    const nextState = reassignCurrentStep(
      state,
      normalized,
      resolver,
      request.submitted_by_worker_id,
      request.worker_id,
    );
    await saveSteps(client, organizationId, requestId, nextState, state);
    const approverName = normalized.kind === "worker"
      ? (await workerIdentity(client, organizationId, normalized.workerId))?.name ?? "worker"
      : (await positionOptions(pool, organizationId)).find((position) => position.id === normalized.positionId)?.title ?? "position";
    await insertEvent(client, organizationId, requestId, "reassigned", activeStep.stepNumber, null, `Step reassigned to ${approverName}.`);
    const nextStep = currentStep(nextState);
    if (nextStep) {
      await insertEvent(client, organizationId, requestId, "step_activated", nextStep.stepNumber, null, "Approval step reassigned and activated.");
      await queueApproverMessages(client, organizationId, {
        requestId,
        subjectWorkerId: request.worker_id,
        submittedByWorkerId: request.submitted_by_worker_id,
        changeType: request.change_type,
        currentValue: request.current_value,
        requestedValue: request.requested_value,
        effectiveDate: request.effective_date,
        reason: request.reason,
      }, nextStep.stepNumber, nextState.steps.length, nextStep.eligibleWorkerIds);
    }
    return requestId;
  }));
}

export async function getChangeRequests(filters: {
  status?: string;
  changeType?: string;
  viewer?: CurrentUser;
} = {}) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const status = validateRequestStatus(filters.status) ? filters.status : null;
    const changeType = filters.changeType && CHANGE_TYPE_VALUES.has(filters.changeType) ? filters.changeType : null;
    const requests = await pool.query<{
      id: string;
      worker_id: string;
      subject_name: string;
      change_type: ChangeType;
      current_value: string | null;
      requested_value: string;
      effective_date: string;
      status: RequestStatus;
      submitter_id: string | null;
      submitter_name: string | null;
      submitted_by: string | null;
      created_at: Date | string;
    }>(
      `select cr.id, cr.worker_id, coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as subject_name,
              cr.change_type, cr.current_value, cr.requested_value, cr.effective_date,
              cr.status, cr.submitted_by_worker_id as submitter_id,
              coalesce(sw.preferred_name, sw.first_name) || ' ' || sw.last_name as submitter_name,
              cr.submitted_by, cr.created_at
       from change_requests cr
       join workers w on w.id = cr.worker_id and w.organization_id=cr.organization_id
       left join workers sw on sw.id = cr.submitted_by_worker_id and sw.organization_id=cr.organization_id
       where cr.organization_id=$1 and ($2::text is null or cr.status=$2)
         and ($3::text is null or cr.change_type=$3)
         and (
           not $6 or $5
           or ($4::uuid is not null and (
             cr.submitted_by_worker_id=$4 or cr.worker_id=$4
             or exists (
             select 1 from job_assignments ja
             where ja.organization_id=cr.organization_id and ja.worker_id=cr.worker_id
               and ja.manager_worker_id=$4 and ja.effective_from<=current_date
               and (ja.effective_to is null or ja.effective_to>=current_date)
             )
           ))
         )
       order by cr.created_at desc`,
      [
        organizationId,
        status,
        changeType,
        filters.viewer?.workerId,
        filters.viewer ? isAdmin(filters.viewer) : false,
        filters.viewer !== undefined,
      ],
    );
    if (!requests.rows.length) return [];
    const ids = requests.rows.map((row) => row.id);
    const steps = await pool.query<{
      change_request_id: string;
      step_number: number;
      total_steps: number;
      eligible_worker_ids: string[];
    }>(
      `select pending.change_request_id, pending.step_number, pending.eligible_worker_ids,
              (select count(*) from change_request_approval_steps all_steps
               where all_steps.change_request_id = pending.change_request_id) as total_steps
       from change_request_approval_steps pending
       where pending.change_request_id = any($1::uuid[]) and pending.status='pending'
       order by pending.change_request_id`,
      [ids],
    );
    const approverIds = [...new Set(steps.rows.flatMap((step) => step.eligible_worker_ids ?? []))];
    const approverRows = approverIds.length
      ? await pool.query<{ id: string; name: string; title: string | null }>(
        `select w.id, coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as name, jp.title
         from workers w
         left join lateral (
           select ja.job_profile_id from job_assignments ja
           where ja.organization_id=w.organization_id and ja.worker_id=w.id and ja.effective_from <= current_date
             and (ja.effective_to is null or ja.effective_to >= current_date)
           order by ja.effective_from desc limit 1
         ) current_assignment on true
         left join job_profiles jp on jp.id=current_assignment.job_profile_id
         where w.organization_id=$2 and w.id=any($1::uuid[])`,
        [approverIds, organizationId],
      )
      : { rows: [] as { id: string; name: string; title: string | null }[] };
    const approverNames = new Map(approverRows.rows.map((row) => [row.id, row.title ? `${row.name} (${row.title})` : row.name]));
    const progressByRequest = new Map(steps.rows.map((step) => {
      const names = (step.eligible_worker_ids ?? []).map((id) => approverNames.get(id)).filter((name): name is string => Boolean(name));
      return [step.change_request_id, {
        stepNumber: step.step_number,
        totalSteps: Number(step.total_steps),
        progress: names.length
          ? `Step ${step.step_number} of ${Number(step.total_steps)} · awaiting ${names.join(", ")}`
          : `Step ${step.step_number} of ${Number(step.total_steps)} · No eligible approver — reassign`,
      }];
    }));
    return requests.rows.map((row) => ({
      id: row.id,
      subjectWorkerId: row.worker_id,
      subjectName: row.subject_name,
      changeType: row.change_type,
      changeTypeLabel: CHANGE_TYPE_LABELS[row.change_type],
      currentValue: row.current_value,
      requestedValue: row.requested_value,
      effectiveDate: row.effective_date,
      status: row.status,
      submittedByWorkerId: row.submitter_id,
      submittedBy: row.submitter_name ?? row.submitted_by ?? "Unknown",
      submittedAt: asIso(row.created_at),
      progress: progressByRequest.get(row.id)?.progress ?? null,
    }));
  });
}

async function loadRequestDetail(pool: Pool, organizationId: string, requestId: string) {
  const requestResult = await pool.query<{
    id: string;
    worker_id: string;
    subject_name: string;
    change_type: ChangeType;
    current_value: string | null;
    requested_value: string;
    effective_date: string;
    reason: string | null;
    status: RequestStatus;
    submitted_by_worker_id: string | null;
    submitter_name: string | null;
    submitted_by: string | null;
    created_at: Date | string;
    completed_at: Date | string | null;
  }>(
    `select cr.id, cr.worker_id, coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as subject_name,
            cr.change_type, cr.current_value, cr.requested_value, cr.effective_date, cr.reason,
            cr.status, cr.submitted_by_worker_id,
            coalesce(sw.preferred_name, sw.first_name) || ' ' || sw.last_name as submitter_name,
            cr.submitted_by, cr.created_at, cr.completed_at
     from change_requests cr
     join workers w on w.id=cr.worker_id and w.organization_id=cr.organization_id
     left join workers sw on sw.id=cr.submitted_by_worker_id and sw.organization_id=cr.organization_id
     where cr.organization_id=$1 and cr.id=$2`,
    [organizationId, requestId],
  );
  const row = requestResult.rows[0];
  if (!row) return null;
  const stepResult = await pool.query<{
    id: string;
    step_number: number;
    approver_kind: "worker" | "position";
    approver_worker_id: string | null;
    approver_position_id: string | null;
    approver_name: string | null;
    position_code: string | null;
    position_title: string | null;
    current_holder_name: string | null;
    status: StepStatus;
    eligible_worker_ids: string[];
    decided_by_name: string | null;
    comment: string | null;
    activated_at: Date | string | null;
    decided_at: Date | string | null;
  }>(
    `select s.id, s.step_number, s.approver_kind, s.approver_worker_id, s.approver_position_id,
            coalesce(aw.preferred_name, aw.first_name) || ' ' || aw.last_name as approver_name,
            p.position_code, jp.title as position_title, position_holder.name as current_holder_name,
            s.status, s.eligible_worker_ids,
            coalesce(dw.preferred_name, dw.first_name) || ' ' || dw.last_name as decided_by_name,
            s.comment, s.activated_at, s.decided_at
     from change_request_approval_steps s
     left join workers aw on aw.id=s.approver_worker_id and aw.organization_id=s.organization_id
     left join positions p on p.id=s.approver_position_id
     left join job_profiles jp on jp.id=p.job_profile_id
     left join lateral (
       select coalesce(holder.preferred_name, holder.first_name) || ' ' || holder.last_name as name
       from job_assignments ja
       join workers holder on holder.id=ja.worker_id
       where ja.position_id=p.id and ja.organization_id=$1
         and ja.effective_from <= current_date
         and (ja.effective_to is null or ja.effective_to >= current_date)
         and holder.organization_id=$1
       order by ja.effective_from desc limit 1
     ) position_holder on true
     left join workers dw on dw.id=s.decided_by_worker_id and dw.organization_id=s.organization_id
     where s.organization_id=$1 and s.change_request_id=$2
     order by s.step_number`,
    [organizationId, requestId],
  );
  const eligibleIds = [...new Set(stepResult.rows.flatMap((step) => step.eligible_worker_ids ?? []))];
  const eligibleRows = eligibleIds.length
    ? await pool.query<{ id: string; name: string; title: string | null }>(
      `select w.id, coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as name, jp.title
       from workers w
       left join lateral (
         select ja.job_profile_id from job_assignments ja
         where ja.organization_id=w.organization_id and ja.worker_id=w.id and ja.effective_from <= current_date
           and (ja.effective_to is null or ja.effective_to >= current_date)
         order by ja.effective_from desc limit 1
       ) current_assignment on true
       left join job_profiles jp on jp.id=current_assignment.job_profile_id
       where w.organization_id=$2 and w.id=any($1::uuid[])`,
      [eligibleIds, organizationId],
    )
    : { rows: [] as { id: string; name: string; title: string | null }[] };
  const eligibleNames = new Map(eligibleRows.rows.map((worker) => [worker.id, worker.title ? `${worker.name} (${worker.title})` : worker.name]));
  const events = await pool.query<{
    id: string;
    event_type: string;
    step_number: number | null;
    actor_name: string | null;
    detail: string | null;
    occurred_at: Date | string;
  }>(
    `select e.id, e.event_type, e.step_number,
            coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as actor_name,
            e.detail, e.occurred_at
     from change_request_events e
     left join workers w on w.id=e.actor_worker_id
     where e.organization_id=$1 and e.change_request_id=$2
     order by e.occurred_at, e.id`,
    [organizationId, requestId],
  );
  const steps = stepResult.rows.map((step) => ({
    id: step.id,
    stepNumber: step.step_number,
    approverKind: step.approver_kind,
    approverWorkerId: step.approver_worker_id,
    approverPositionId: step.approver_position_id,
    approverLabel: step.approver_kind === "worker"
      ? step.approver_name ?? "Unknown worker"
      : `${step.position_code ?? "Position"} · ${step.position_title ?? "Untitled"} · ${step.current_holder_name ?? "Vacant"}`,
    status: step.status,
    eligibleWorkerIds: step.eligible_worker_ids ?? [],
    eligibleApproverNames: (step.eligible_worker_ids ?? []).map((id) => eligibleNames.get(id)).filter((name): name is string => Boolean(name)),
    decidedByName: step.decided_by_name,
    comment: step.comment,
    activatedAt: asIso(step.activated_at),
    decidedAt: asIso(step.decided_at),
  }));
  const pending = steps.find((step) => step.status === "pending");
  return {
    id: row.id,
    subjectWorkerId: row.worker_id,
    subjectName: row.subject_name,
    changeType: row.change_type,
    changeTypeLabel: CHANGE_TYPE_LABELS[row.change_type],
    currentValue: row.current_value,
    requestedValue: row.requested_value,
    effectiveDate: row.effective_date,
    reason: row.reason,
    status: row.status,
    submittedByWorkerId: row.submitted_by_worker_id,
    submittedBy: row.submitter_name ?? row.submitted_by ?? "Unknown",
    submittedAt: asIso(row.created_at),
    completedAt: asIso(row.completed_at),
    progress: pending
      ? `Step ${pending.stepNumber} of ${steps.length} · ${pending.eligibleApproverNames.length ? `awaiting ${pending.eligibleApproverNames.join(", ")}` : "No eligible approver — reassign"}`
      : null,
    steps,
    events: events.rows.map((event) => ({
      id: event.id,
      type: event.event_type,
      stepNumber: event.step_number,
      actorName: event.actor_name,
      detail: event.detail,
      occurredAt: asIso(event.occurred_at),
    })),
  };
}

export async function getChangeRequestDetail(requestId: string, viewer?: CurrentUser) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    if (viewer && !isAdmin(viewer)) {
      const allowed = await pool.query(
        `select 1 from change_requests cr
         where cr.id=$1 and cr.organization_id=$2
           and ($3::uuid is not null and (
             cr.submitted_by_worker_id=$3 or cr.worker_id=$3
             or exists (
               select 1 from job_assignments ja
               where ja.organization_id=cr.organization_id and ja.worker_id=cr.worker_id
                 and ja.manager_worker_id=$3 and ja.effective_from<=current_date
                 and (ja.effective_to is null or ja.effective_to>=current_date)
             )
           ))`,
        [requestId, organizationId, viewer.workerId],
      );
      if (!allowed.rowCount) return null;
    }
    return loadRequestDetail(pool, organizationId, requestId);
  });
}

export async function getApprovalByToken(token: string) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const linkResult = await pool.query<{
      request_id: string;
      step_id: string;
      worker_id: string;
      used_at: Date | string | null;
    }>(
      `select cr.id as request_id, s.id as step_id, l.worker_id, l.used_at
       from change_request_approval_links l
       join change_request_approval_steps s on s.id=l.step_id
       join change_requests cr on cr.id=s.change_request_id
       where l.token=$1 and l.organization_id=$2`,
      [token, organizationId],
    );
    const link = linkResult.rows[0];
    if (!link) return null;
    const [request, approver] = await Promise.all([
      loadRequestDetail(pool, organizationId, link.request_id),
      pool.query<{ name: string }>(
        `select coalesce(preferred_name, first_name) || ' ' || last_name as name
         from workers where organization_id=$1 and id=$2`,
        [organizationId, link.worker_id],
      ),
    ]);
    if (!request) return null;
    const step = request.steps.find((item) => item.id === link.step_id);
    return {
      request,
      token,
      approverName: approver.rows[0]?.name ?? "Approver",
      approverWorkerId: link.worker_id,
      used: Boolean(link.used_at),
      actionable: Boolean(
        request.status === "pending"
        && step?.status === "pending"
        && !link.used_at
        && step.eligibleWorkerIds.includes(link.worker_id),
      ),
    };
  });
}

export async function saveApprovalTemplate(input: {
  id?: string;
  name: string;
  changeType: ChangeType | null;
  isDefault: boolean;
  steps: ApproverRef[];
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Enter a template name.");
  const approvers = normalizeApprovers(input.steps);
  const chainError = validateChain(approvers);
  if (chainError) throw new Error(chainError);
  if (input.changeType !== null) validateChangeType(input.changeType);

  return withFeatureDatabase((pool) => inTransaction(pool, async (client) => {
    const organizationId = await demoOrganizationId(client);
    await ensureApproversExist(client, organizationId, approvers);
    if (input.id) {
      const existing = await client.query(
        "select 1 from approval_chain_templates where organization_id=$1 and id=$2",
        [organizationId, input.id],
      );
      if (!existing.rowCount) throw new Error("Approval template not found.");
    }
    if (input.isDefault) {
      await client.query(
        `update approval_chain_templates set is_default=false
         where organization_id=$1 and (change_type is not distinct from $2 or id=$3)`,
        [organizationId, input.changeType, input.id ?? null],
      );
    }
    const template = input.id
      ? await client.query<{ id: string }>(
        `update approval_chain_templates
         set name=$1, change_type=$2, is_default=$3, active=true
         where organization_id=$4 and id=$5 returning id`,
        [name, input.changeType, input.isDefault, organizationId, input.id],
      )
      : await client.query<{ id: string }>(
        `insert into approval_chain_templates (organization_id, name, change_type, is_default)
         values ($1,$2,$3,$4) returning id`,
        [organizationId, name, input.changeType, input.isDefault],
      );
    const id = template.rows[0].id;
    await client.query("delete from approval_chain_template_steps where template_id=$1", [id]);
    for (const [index, approver] of approvers.entries()) {
      await client.query(
        `insert into approval_chain_template_steps
           (template_id, step_number, approver_kind, approver_worker_id, approver_position_id)
         values ($1,$2,$3,$4,$5)`,
        [
          id,
          index + 1,
          approver.kind,
          approver.kind === "worker" ? approver.workerId : null,
          approver.kind === "position" ? approver.positionId : null,
        ],
      );
    }
    return id;
  }));
}

export async function archiveApprovalTemplate(templateId: string) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query(
      `update approval_chain_templates set active=false, is_default=false
       where organization_id=$1 and id=$2`,
      [organizationId, templateId],
    );
    if (!result.rowCount) throw new Error("Approval template not found.");
  });
}
