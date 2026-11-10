import { describe, expect, it } from "vitest";
import {
  approvalRequestEmail,
  currentStep,
  decide,
  decisionEmail,
  eligibleApprovers,
  reassignCurrentStep,
  startChain,
  validateChain,
  withdraw,
  type ApproverRef,
} from "@/lib/approvals/workflow";

const holders: Record<string, string[]> = { "pos-hrbp": ["hr1", "hr2"], "pos-vacant": [], "pos-self": ["sub"] };
const resolve = (a: ApproverRef) => (a.kind === "worker" ? [a.workerId] : holders[a.positionId] ?? []);
const W = (workerId: string): ApproverRef => ({ kind: "worker", workerId });
const P = (positionId: string): ApproverRef => ({ kind: "position", positionId });

describe("approval chains", () => {
  it("validates 1–6 steps", () => {
    expect(validateChain([])).toMatch(/at least one/);
    expect(validateChain(Array.from({ length: 7 }, () => W("m")))).toMatch(/at most 6/);
    expect(validateChain(Array.from({ length: 6 }, () => W("m")))).toBeNull();
    expect(validateChain([{ kind: "position", positionId: "" }])).toMatch(/Step 1/);
  });

  it("resolves positions and blocks self-approval", () => {
    expect(eligibleApprovers(P("pos-hrbp"), resolve, "s", "sub")).toEqual(["hr1", "hr2"]);
    expect(eligibleApprovers(P("pos-self"), resolve, "s", "sub")).toEqual([]);
    expect(eligibleApprovers(W("s"), resolve, "s", "sub")).toEqual([]);
  });

  it("advances step by step to approval", () => {
    let st = startChain([W("mgr"), P("pos-hrbp"), W("vp")], resolve, "s", "sub");
    expect(currentStep(st)).toMatchObject({ stepNumber: 1, eligibleWorkerIds: ["mgr"] });
    expect(st.steps.map((x) => x.status)).toEqual(["pending", "waiting", "waiting"]);
    expect(() => decide(st, { actorWorkerId: "hr1", decision: "approve" }, resolve, "s", "sub")).toThrow(/not an approver/);
    st = decide(st, { actorWorkerId: "mgr", decision: "approve" }, resolve, "s", "sub");
    expect(currentStep(st)).toMatchObject({ stepNumber: 2, eligibleWorkerIds: ["hr1", "hr2"] });
    st = decide(st, { actorWorkerId: "hr2", decision: "approve", comment: " ok " }, resolve, "s", "sub");
    expect(st.steps[1]).toMatchObject({ status: "approved", decidedByWorkerId: "hr2", comment: "ok" });
    st = decide(st, { actorWorkerId: "vp", decision: "approve" }, resolve, "s", "sub");
    expect(st.status).toBe("approved");
    expect(() => decide(st, { actorWorkerId: "vp", decision: "approve" }, resolve, "s", "sub")).toThrow(/no longer/);
  });

  it("rejects with a comment and skips the rest; supports withdraw and reassign", () => {
    const st = startChain([W("mgr"), W("vp")], resolve, "s", "sub");
    expect(() => decide(st, { actorWorkerId: "mgr", decision: "reject" }, resolve, "s", "sub")).toThrow(/comment/);
    const rej = decide(st, { actorWorkerId: "mgr", decision: "reject", comment: "Budget" }, resolve, "s", "sub");
    expect(rej.status).toBe("rejected");
    expect(rej.steps.map((x) => x.status)).toEqual(["rejected", "skipped"]);
    expect(withdraw(st).steps.map((x) => x.status)).toEqual(["skipped", "skipped"]);

    const vacant = startChain([P("pos-vacant")], resolve, "s", "sub");
    expect(currentStep(vacant)!.eligibleWorkerIds).toEqual([]);
    const fixed = reassignCurrentStep(vacant, W("vp"), resolve, "s", "sub");
    expect(currentStep(fixed)).toMatchObject({ approver: W("vp"), eligibleWorkerIds: ["vp"] });
  });

  it("formats emails", () => {
    const e = approvalRequestEmail({
      submitterName: "Maya Chen",
      subjectName: "Jordan Reyes",
      approverName: "Victor Huang",
      changeType: "Compensation",
      currentValue: "$62,000",
      requestedValue: "$68,000",
      effectiveDate: "2026-12-01",
      reason: "Market adjustment",
      stepNumber: 2,
      totalSteps: 3,
      link: "http://localhost:3000/approvals/tok",
    });
    expect(e.subject).toBe("Maya Chen submitted a change request for Jordan Reyes");
    expect(e.body).toContain("compensation change request for Jordan Reyes");
    expect(e.body).toContain("(step 2 of 3)");
    expect(e.body).toContain("Current: $62,000\nRequested: $68,000\nEffective: 2026-12-01\nReason: Market adjustment");
    expect(e.body).toContain("http://localhost:3000/approvals/tok");
    const decision = decisionEmail({ submitterName: "Maya", subjectName: "Jordan", changeType: "Title change", outcome: "rejected", deciderName: "Vic", comment: "No", link: "x" });
    expect(decision.subject).toBe(
      "Change request for Jordan was rejected",
    );
    expect(decision.body).toContain("Your title change request for Jordan was rejected by Vic.");
  });
});
