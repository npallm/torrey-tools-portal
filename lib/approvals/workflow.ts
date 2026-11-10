/** Sequential approval chains (1–6 steps) for employee change requests. Pure state machine. */

export const MAX_APPROVAL_STEPS = 6;

export type ApproverRef = { kind: "worker"; workerId: string } | { kind: "position"; positionId: string };

export type StepStatus = "waiting" | "pending" | "approved" | "rejected" | "skipped";
export type RequestStatus = "pending" | "approved" | "rejected" | "withdrawn";

export type ApprovalStep = {
  stepNumber: number;
  approver: ApproverRef;
  status: StepStatus;
  /** Workers allowed to act; resolved when the step becomes pending. */
  eligibleWorkerIds: string[];
  decidedByWorkerId: string | null;
  comment: string | null;
};

export type ApprovalState = { status: RequestStatus; steps: ApprovalStep[] };

export function validateChain(approvers: ApproverRef[]): string | null {
  if (approvers.length < 1) return "Add at least one approver.";
  if (approvers.length > MAX_APPROVAL_STEPS) return `An approval chain can have at most ${MAX_APPROVAL_STEPS} steps.`;
  for (const [i, a] of approvers.entries()) {
    if ((a.kind === "worker" && !a.workerId) || (a.kind === "position" && !a.positionId)) return `Step ${i + 1} has no approver.`;
  }
  return null;
}

export type Resolver = (approver: ApproverRef) => string[];

/**
 * Eligible approvers for a step: the named worker, or current holders of the position,
 * excluding the submitter and the employee the request is about (no self-approval).
 */
export function eligibleApprovers(approver: ApproverRef, resolve: Resolver, submitterId: string, subjectId: string): string[] {
  return [...new Set(resolve(approver))].filter((id) => id !== submitterId && id !== subjectId).sort();
}

export function startChain(approvers: ApproverRef[], resolve: Resolver, submitterId: string, subjectId: string): ApprovalState {
  const error = validateChain(approvers);
  if (error) throw new Error(error);
  return {
    status: "pending",
    steps: approvers.map((approver, i) => ({
      stepNumber: i + 1,
      approver,
      status: i === 0 ? "pending" : "waiting",
      eligibleWorkerIds: i === 0 ? eligibleApprovers(approver, resolve, submitterId, subjectId) : [],
      decidedByWorkerId: null,
      comment: null,
    })),
  };
}

export const currentStep = (s: ApprovalState) => s.steps.find((x) => x.status === "pending") ?? null;

export type Decision = { actorWorkerId: string; decision: "approve" | "reject"; comment?: string };

/** Applies a decision by an eligible approver of the current step. Throws on invalid actions. */
export function decide(
  state: ApprovalState,
  d: Decision,
  resolve: Resolver,
  submitterId: string,
  subjectId: string,
): ApprovalState {
  if (state.status !== "pending") throw new Error("This request is no longer awaiting approval.");
  const step = currentStep(state);
  if (!step) throw new Error("No step is awaiting approval.");
  if (!step.eligibleWorkerIds.includes(d.actorWorkerId)) throw new Error("You are not an approver for the current step.");
  if (d.decision === "reject" && !d.comment?.trim()) throw new Error("A comment is required to reject.");

  const steps = state.steps.map((s) => ({ ...s }));
  const i = steps.findIndex((s) => s.stepNumber === step.stepNumber);
  steps[i] = {
    ...steps[i],
    status: d.decision === "approve" ? "approved" : "rejected",
    decidedByWorkerId: d.actorWorkerId,
    comment: d.comment?.trim() || null,
  };

  if (d.decision === "reject") {
    for (const s of steps) if (s.status === "waiting") s.status = "skipped";
    return { status: "rejected", steps };
  }
  const next = steps[i + 1];
  if (!next) return { status: "approved", steps };
  steps[i + 1] = { ...next, status: "pending", eligibleWorkerIds: eligibleApprovers(next.approver, resolve, submitterId, subjectId) };
  return { status: "pending", steps };
}

/** Submitter withdraws; open steps are skipped. */
export function withdraw(state: ApprovalState): ApprovalState {
  if (state.status !== "pending") throw new Error("Only pending requests can be withdrawn.");
  return {
    status: "withdrawn",
    steps: state.steps.map((s) => (s.status === "pending" || s.status === "waiting" ? { ...s, status: "skipped" } : s)),
  };
}

/** Admin fix for a pending step with no eligible approvers (e.g. vacant position). */
export function reassignCurrentStep(
  state: ApprovalState,
  approver: ApproverRef,
  resolve: Resolver,
  submitterId: string,
  subjectId: string,
): ApprovalState {
  const step = currentStep(state);
  if (state.status !== "pending" || !step) throw new Error("No step is awaiting approval.");
  return {
    ...state,
    steps: state.steps.map((s) =>
      s.stepNumber === step.stepNumber ? { ...s, approver, eligibleWorkerIds: eligibleApprovers(approver, resolve, submitterId, subjectId) } : s,
    ),
  };
}

export type ChangeRequestEmailInput = {
  submitterName: string;
  subjectName: string;
  approverName: string;
  changeType: string;
  currentValue: string | null;
  requestedValue: string;
  effectiveDate: string;
  reason: string | null;
  stepNumber: number;
  totalSteps: number;
  link: string;
};

function changeTypeRequestLabel(changeType: string): string {
  return `${changeType.toLowerCase().replace(/ change$/, "")} change request`;
}

export function approvalRequestEmail(e: ChangeRequestEmailInput): { subject: string; body: string } {
  return {
    subject: `${e.submitterName} submitted a change request for ${e.subjectName}`,
    body: [
      `Hi ${e.approverName},`,
      "",
      `${e.submitterName} submitted a ${changeTypeRequestLabel(e.changeType)} for ${e.subjectName}, and it needs your approval (step ${e.stepNumber} of ${e.totalSteps}).`,
      "",
      `Current: ${e.currentValue?.trim() || "—"}`,
      `Requested: ${e.requestedValue}`,
      `Effective: ${e.effectiveDate}`,
      ...(e.reason?.trim() ? [`Reason: ${e.reason.trim()}`] : []),
      "",
      `Review and approve or reject: ${e.link}`,
    ].join("\n"),
  };
}

export function decisionEmail(e: {
  submitterName: string;
  subjectName: string;
  changeType: string;
  outcome: "approved" | "rejected";
  deciderName: string;
  comment: string | null;
  link: string;
}): { subject: string; body: string } {
  return {
    subject: `Change request for ${e.subjectName} was ${e.outcome}`,
    body: [
      `Hi ${e.submitterName},`,
      "",
      `Your ${changeTypeRequestLabel(e.changeType)} for ${e.subjectName} was ${e.outcome} by ${e.deciderName}.`,
      ...(e.comment ? ["", `Comment: ${e.comment}`] : []),
      "",
      `View the request: ${e.link}`,
    ].join("\n"),
  };
}
