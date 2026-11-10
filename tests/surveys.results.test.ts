import { describe, expect, it } from "vitest";
import { breakdown, enps, favorability, isSuppressed, matchesFilter, surveyResults, tenureBand } from "@/lib/surveys/results";
import type { RespondentAttributes, SurveyInvitation, SurveyQuestion, SurveyResponse } from "@/lib/surveys/types";
import { managerChain, supOrgMembers, supOrgs } from "@/lib/org/hierarchy";

const attrs = (over: Partial<RespondentAttributes> = {}): RespondentAttributes => ({
  division: "Ops",
  department: "Ops A",
  location: "HQ",
  workerType: "Employee",
  tenureBand: "1–2 yrs",
  managerChain: ["m1", "ceo"],
  ...over,
});
const q = (over: Partial<SurveyQuestion>): SurveyQuestion => ({
  id: "q",
  position: 0,
  type: "likert5",
  prompt: "",
  dimension: "Engagement",
  options: [],
  reverseScored: false,
  required: true,
  ...over,
});

function build(groups: { n: number; invited?: number; attrs: Partial<RespondentAttributes>; values: number[]; enpsValue?: number }[]) {
  const invitations: SurveyInvitation[] = [];
  const responses: SurveyResponse[] = [];
  let i = 0;
  for (const g of groups) {
    const invited = g.invited ?? g.n;
    for (let j = 0; j < invited; j++) {
      const id = `i${i++}`;
      invitations.push({ id, attributes: attrs(g.attrs) });
      if (j < g.n)
        responses.push({
          id: `r${id}`,
          invitationId: id,
          submittedAt: `2026-11-0${(j % 3) + 1}T10:00:00Z`,
          answers: [
            { questionId: "q1", numericValue: g.values[j % g.values.length], choiceValues: [], textValue: null },
            { questionId: "q2", numericValue: g.values[j % g.values.length], choiceValues: [], textValue: null },
            { questionId: "e", numericValue: g.enpsValue ?? 9, choiceValues: [], textValue: null },
            { questionId: "c", numericValue: null, choiceValues: j % 2 ? ["A", "B"] : ["A"], textValue: null },
            { questionId: "t", numericValue: null, choiceValues: [], textValue: j === 0 ? "  zebra " : j === 1 ? "apple" : "" },
          ],
        });
    }
  }
  return { invitations, responses };
}

const questions: SurveyQuestion[] = [
  q({ id: "q1", position: 1 }),
  q({ id: "q2", position: 2, dimension: "Manager", reverseScored: true }),
  q({ id: "e", position: 3, type: "enps", dimension: null }),
  q({ id: "c", position: 4, type: "multi_choice", dimension: null, options: ["A", "B", "C"] }),
  q({ id: "t", position: 5, type: "text", dimension: null }),
];

describe("scoring primitives", () => {
  it("computes favorability and eNPS", () => {
    expect(favorability([5, 4, 3, 2, 1])).toEqual({ n: 5, favorable: 40, neutral: 20, unfavorable: 40, mean: 3 });
    expect(favorability([])).toBeNull();
    const e = enps([10, 9, 8, 7, 6, 0]);
    expect(e!.promoters).toBeCloseTo(100 / 3, 10);
    expect(e!.detractors).toBeCloseTo(100 / 3, 10);
    expect(e!.score).toBeCloseTo(0, 10);
    expect(enps([10, 10, 10, 10])!.score).toBe(100);
  });

  it("bands tenure and suppresses small or derivable cells", () => {
    expect(tenureBand("2026-01-01", "2026-11-08")).toBe("< 1 yr");
    expect(tenureBand("2024-01-01", "2026-11-08")).toBe("1–2 yrs");
    expect(tenureBand("2021-01-01", "2026-11-08")).toBe("3–5 yrs");
    expect(tenureBand("2015-01-01", "2026-11-08")).toBe("6+ yrs");
    expect(isSuppressed(4, 4, 5)).toBe(true);
    expect(isSuppressed(5, 5, 5)).toBe(false);
    expect(isSuppressed(17, 20, 5)).toBe(true);
    expect(isSuppressed(15, 20, 5)).toBe(false);
  });

  it("filters by attributes and supervisory org", () => {
    expect(matchesFilter(attrs(), { supOrgLeaderId: "ceo", department: "Ops A" })).toBe(true);
    expect(matchesFilter(attrs(), { supOrgLeaderId: "m2" })).toBe(false);
    expect(matchesFilter(attrs(), { location: "Remote" })).toBe(false);
  });
});

describe("surveyResults", () => {
  it("scores questions, dimensions, reverse items, choices, comments and timeline", () => {
    const { invitations, responses } = build([{ n: 6, invited: 8, attrs: {}, values: [5, 4, 2] }]);
    const r = surveyResults({ questions, invitations, responses });
    if (r.suppressed) throw new Error("unexpected suppression");
    expect(r.invited).toBe(8);
    expect(r.responded).toBe(6);
    expect(r.responseRate).toBe(75);
    const q1 = r.questions[0];
    const q2 = r.questions[1];
    if (q1.type !== "likert5" || q2.type !== "likert5") throw new Error();
    expect(q1.favorability!.favorable).toBeCloseTo((4 / 6) * 100, 10);
    // reverse-scored: 5→1, 4→2, 2→4
    expect(q2.favorability!.favorable).toBeCloseTo((2 / 6) * 100, 10);
    expect(r.overall!.n).toBe(12);
    expect(r.dimensions.map((d) => d.dimension)).toEqual(["Engagement", "Manager"]);
    const c = r.questions[3];
    if (c.type !== "multi_choice") throw new Error();
    expect(c.counts).toEqual([
      { option: "A", count: 6, percent: 100 },
      { option: "B", count: 3, percent: 50 },
      { option: "C", count: 0, percent: 0 },
    ]);
    const t = r.questions[4];
    if (t.type !== "text") throw new Error();
    expect(t.suppressed).toBe(true); // only 2 comments < 5
    expect(r.timeline).toEqual([
      { date: "2026-11-01", cumulative: 2 },
      { date: "2026-11-02", cumulative: 4 },
      { date: "2026-11-03", cumulative: 6 },
    ]);
  });

  it("suppresses small cuts and complements, within a viewer scope", () => {
    const { invitations, responses } = build([
      { n: 6, attrs: { department: "Ops A" }, values: [5] },
      { n: 3, attrs: { department: "Ops B" }, values: [1] },
      { n: 10, attrs: { department: "Sales", managerChain: ["m2", "ceo"] }, values: [4] },
    ]);
    expect(surveyResults({ questions, invitations, responses, filter: { department: "Ops B" } }).suppressed).toBe(true);
    // Ops A (6) inside m1's org (9): remainder 3 would be derivable → suppressed
    expect(surveyResults({ questions, invitations, responses, scope: { supOrgLeaderId: "m1" }, filter: { department: "Ops A" } }).suppressed).toBe(true);
    expect(surveyResults({ questions, invitations, responses, scope: { supOrgLeaderId: "m1" } }).suppressed).toBe(false);
    expect(surveyResults({ questions, invitations, responses, filter: { department: "Ops A" } }).suppressed).toBe(false);

    const rows = breakdown({ questions, invitations, responses }, "department", { kind: "question", questionId: "q1" });
    expect(rows).toEqual([
      { group: "Ops A", suppressed: false, n: 6, value: 100 },
      { group: "Ops B", suppressed: true, n: null, value: null },
      { group: "Sales", suppressed: false, n: 10, value: 100 },
    ]);
    const e = breakdown({ questions, invitations, responses }, "department", { kind: "question", questionId: "e" });
    expect(e[2]).toEqual({ group: "Sales", suppressed: false, n: 10, value: 100 });
  });
});

describe("hierarchy", () => {
  const people = [
    { id: "ceo", name: "Ceo", managerId: null },
    { id: "m1", name: "Mia", managerId: "ceo" },
    { id: "a", name: "A", managerId: "m1" },
    { id: "b", name: "B", managerId: "a" },
    { id: "x", name: "X", managerId: "y" },
    { id: "y", name: "Y", managerId: "x" },
  ];
  it("walks chains, handles cycles, and lists sup orgs", () => {
    expect(managerChain("b", people)).toEqual(["a", "m1", "ceo"]);
    expect(managerChain("x", people)).toEqual(["y"]);
    expect(supOrgMembers("m1", people).sort()).toEqual(["a", "b"]);
    expect(supOrgs(people).map((o) => [o.leaderId, o.size])).toEqual([
      ["ceo", 3],
      ["m1", 2],
      ["a", 1],
      ["x", 1],
      ["y", 1],
    ]);
  });
});
