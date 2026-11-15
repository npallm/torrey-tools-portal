import { describe, expect, it } from "vitest";
import { managerSurveyResults, scoreBlock } from "@/lib/surveys/managerScores";
import { MANAGER_CATEGORIES, MANAGER_QUESTION_BANK } from "@/lib/surveys/managerQuestions";
import type { SurveyInvitation, SurveyResponse } from "@/lib/surveys/types";

const questions = [
  { id: "a1", category: "A" },
  { id: "a2", category: "A" },
  { id: "b1", category: "B" },
];

let seq = 0;
function team(chain: string[], n: number, values: [number, number, number], invited = n) {
  const invitations: SurveyInvitation[] = [];
  const responses: SurveyResponse[] = [];
  for (let i = 0; i < invited; i++) {
    const id = `inv${seq++}`;
    invitations.push({
      id,
      attributes: { division: null, department: null, location: null, workerType: null, tenureBand: null, managerChain: chain },
    });
    if (i < n)
      responses.push({
        id: `r${id}`,
        invitationId: id,
        submittedAt: "2026-11-05T00:00:00Z",
        answers: [
          { questionId: "a1", numericValue: values[0], choiceValues: [], textValue: null },
          { questionId: "a2", numericValue: values[1], choiceValues: [], textValue: null },
          { questionId: "b1", numericValue: values[2], choiceValues: [], textValue: null },
        ],
      });
  }
  return { invitations, responses };
}
const merge = (...ts: ReturnType<typeof team>[]) => ({
  invitations: ts.flatMap((t) => t.invitations),
  responses: ts.flatMap((t) => t.responses),
});

describe("question bank", () => {
  it("has 20 unique items, 5 per category", () => {
    expect(MANAGER_QUESTION_BANK).toHaveLength(20);
    expect(new Set(MANAGER_QUESTION_BANK.map((q) => q.prompt)).size).toBe(20);
    for (const c of MANAGER_CATEGORIES) expect(MANAGER_QUESTION_BANK.filter((q) => q.category === c)).toHaveLength(5);
  });
});

describe("scoreBlock", () => {
  it("averages respondent means and category means; hides thin items", () => {
    const { responses } = team(["m"], 2, [5, 3, 1]);
    responses[1].answers[2].numericValue = null; // second respondent skipped b1
    const s = scoreBlock(responses, questions, 2);
    // respondent 1: (5+3+1)/3 = 3; respondent 2: (5+3)/2 = 4 → 3.5
    expect(s.overall).toBe(3.5);
    expect(s.categories).toEqual([
      { category: "A", score: 4 },
      { category: "B", score: 1 },
    ]);
    expect(s.items).toEqual([
      { questionId: "a1", score: 5 },
      { questionId: "a2", score: 3 },
      { questionId: "b1", score: null },
    ]);
  });
});

describe("managerSurveyResults", () => {
  it("scores managers with ≥5 respondents and ranks them with ties", () => {
    const data = merge(
      team(["m1", "ceo"], 5, [5, 5, 5], 6),
      team(["m2", "ceo"], 6, [5, 5, 5]),
      team(["m3", "ceo"], 5, [3, 3, 3]),
      team(["m4", "ceo"], 4, [1, 1, 1]),
      team(["ceo"], 5, [4, 4, 4]),
    );
    const r = managerSurveyResults({ questions, ...data, managerIds: ["m1", "m2", "m3", "m4", "ceo"] });
    expect(r.invited).toBe(26);
    expect(r.responded).toBe(25);
    const by = Object.fromEntries(r.managers.map((m) => [m.managerId, m]));
    expect(by.m1).toMatchObject({ scored: true, rank: 1 });
    expect(by.m2).toMatchObject({ scored: true, rank: 1 });
    expect(by.ceo).toMatchObject({ scored: true, rank: 3 });
    expect(by.m3).toMatchObject({ scored: true, rank: 4 });
    expect(by.m4).toEqual({ managerId: "m4", scored: false, rank: null, direct: null });
    // ceo sup org: 25 respondents, unscored pool = m4's 4 → hidden
    expect(r.supOrgs.find((s) => s.leaderId === "ceo")).toEqual({ leaderId: "ceo", shown: false, total: null });
    expect(r.supOrgs.find((s) => s.leaderId === "m1")!.total!.overall).toBe(5);
  });

  it("shows sup-org totals when unscored pool is 0 or ≥ k, and blocks nested differencing", () => {
    const data = merge(
      team(["d1", "vp"], 5, [4, 4, 4]),
      team(["s1", "d1", "vp"], 3, [2, 2, 2]),
      team(["s2", "d1", "vp"], 3, [2, 2, 2]),
      team(["s3", "vp"], 2, [1, 1, 1]),
      team(["vp"], 5, [5, 5, 5]),
    );
    const r = managerSurveyResults({ questions, ...data, managerIds: ["vp", "d1", "s1", "s2", "s3"] });
    const shown = Object.fromEntries(r.supOrgs.map((s) => [s.leaderId, s.shown]));
    // d1 org: 11 respondents, unscored pool 6 (s1+s2) → ok. vp org: pool 8 (s1+s2+s3) → ok on its own,
    // but vp pool − d1 pool = 2 (s3's team) → smaller org (d1) hidden.
    expect(shown).toEqual({ vp: true, d1: false, s1: false, s2: false, s3: false });
    const vp = r.supOrgs.find((s) => s.leaderId === "vp")!.total!;
    expect(vp.respondents).toBe(18);
    expect(vp.overall).toBeCloseTo((5 * 4 + 6 * 2 + 2 * 1 + 5 * 5) / 18, 10);
  });

  it("hides a parent total when multiple shown sibling pools isolate a risky residual", () => {
    const data = merge(
      team(["P"], 1, [2, 2, 2]),
      team(["A", "P"], 5, [4, 4, 4]),
      team(["a1", "A", "P"], 3, [2, 2, 2]),
      team(["a2", "A", "P"], 3, [3, 3, 3]),
      team(["B", "P"], 5, [4, 4, 4]),
      team(["b1", "B", "P"], 3, [2, 2, 2]),
      team(["b2", "B", "P"], 3, [3, 3, 3]),
    );
    const result = managerSurveyResults({
      questions,
      ...data,
      k: 5,
      managerIds: ["P", "A", "B", "a1", "a2", "b1", "b2"],
    });
    const shown = Object.fromEntries(result.supOrgs.map((row) => [row.leaderId, row.shown]));
    expect(shown.P).toBe(false);
    expect(shown.A).toBe(true);
    expect(shown.B).toBe(true);
  });
});
