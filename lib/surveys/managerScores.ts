import type { SurveyInvitation, SurveyResponse } from "./types";

export const MIN_RESPONDENTS = 5;

export type LikertQuestion = { id: string; category: string };

/** A respondent's mean over answered 1–5 items (optionally limited to one category). */
function respondentMean(r: SurveyResponse, questions: LikertQuestion[], category?: string): number | null {
  const ids = new Set(questions.filter((q) => !category || q.category === category).map((q) => q.id));
  const values = r.answers
    .filter((a) => ids.has(a.questionId) && a.numericValue !== null && a.numericValue >= 1 && a.numericValue <= 5)
    .map((a) => a.numericValue!);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export type ScoreBlock = {
  respondents: number;
  /** Mean of respondent means (each respondent weighs equally). */
  overall: number | null;
  categories: { category: string; score: number | null }[];
  /** Item means; null when fewer than k respondents answered that item. */
  items: { questionId: string; score: number | null }[];
};

export function scoreBlock(responses: SurveyResponse[], questions: LikertQuestion[], k = MIN_RESPONDENTS): ScoreBlock {
  const categories = [...new Set(questions.map((q) => q.category))];
  return {
    respondents: responses.length,
    overall: mean(responses.map((r) => respondentMean(r, questions)).filter((v): v is number => v !== null)),
    categories: categories.map((category) => ({
      category,
      score: mean(responses.map((r) => respondentMean(r, questions, category)).filter((v): v is number => v !== null)),
    })),
    items: questions.map((q) => {
      const values = responses.flatMap((r) =>
        r.answers
          .filter((a) => a.questionId === q.id && a.numericValue !== null && a.numericValue >= 1 && a.numericValue <= 5)
          .map((a) => a.numericValue!),
      );
      return { questionId: q.id, score: values.length >= k ? mean(values) : null };
    }),
  };
}

export type ManagerScore = {
  managerId: string;
  scored: boolean;
  /** Competition rank (1, 2, 2, 4) among scored managers by overall rounded to 2 decimals. */
  rank: number | null;
  /** Hidden (null) unless scored. */
  direct: ScoreBlock | null;
};

export type SupOrgScore = { leaderId: string; shown: boolean; total: ScoreBlock | null };

export type ManagerSurveyInput = {
  questions: LikertQuestion[];
  invitations: SurveyInvitation[];
  responses: SurveyResponse[];
  /** Everyone who manages at least one invitee (by worker id). */
  managerIds: string[];
  k?: number;
};

export type ManagerSurveyResults = {
  k: number;
  invited: number;
  responded: number;
  responseRate: number | null;
  managers: ManagerScore[];
  supOrgs: SupOrgScore[];
};

/**
 * Manager effectiveness scoring.
 * - Direct score: responses from invitees whose direct manager (managerChain[0]) is the manager;
 *   scored only with ≥ k respondents. Scored managers are ranked by overall score.
 * - Sup-org total: responses from everyone whose chain includes the leader; shown only with ≥ k
 *   respondents and when the respondents not covered by a scored direct team ("unscored pool") is
 *   0 or ≥ k. Then, for any two shown nested sup orgs, the difference of their unscored pools must
 *   also be 0 or ≥ k, otherwise the smaller org is hidden (repeated until stable). This prevents
 *   deriving an unscored small team's average by subtraction.
 */
export function managerSurveyResults(input: ManagerSurveyInput): ManagerSurveyResults {
  const k = input.k ?? MIN_RESPONDENTS;
  const chainByInvitation = new Map(input.invitations.map((i) => [i.id, i.attributes.managerChain]));
  const responses = input.responses.filter((r) => chainByInvitation.has(r.invitationId));
  const chainOf = (r: SurveyResponse) => chainByInvitation.get(r.invitationId)!;

  const directBy = new Map<string, SurveyResponse[]>();
  for (const r of responses) {
    const m = chainOf(r)[0];
    if (m) directBy.set(m, [...(directBy.get(m) ?? []), r]);
  }
  const scoredIds = new Set(input.managerIds.filter((m) => (directBy.get(m)?.length ?? 0) >= k));

  const blocks = new Map([...scoredIds].map((m) => [m, scoreBlock(directBy.get(m)!, input.questions, k)]));
  const ordered = [...scoredIds]
    .map((m) => ({ m, v: Math.round((blocks.get(m)!.overall ?? 0) * 100) / 100 }))
    .sort((a, b) => b.v - a.v);
  const rank = new Map<string, number>();
  ordered.forEach((x, i) => rank.set(x.m, i > 0 && x.v === ordered[i - 1].v ? rank.get(ordered[i - 1].m)! : i + 1));

  const managers: ManagerScore[] = input.managerIds.map((managerId) => ({
    managerId,
    scored: scoredIds.has(managerId),
    rank: rank.get(managerId) ?? null,
    direct: blocks.get(managerId) ?? null,
  }));

  const members = new Map(input.managerIds.map((l) => [l, responses.filter((r) => chainOf(r).includes(l))]));
  const unscored = (rs: SurveyResponse[]) => new Set(rs.filter((r) => !scoredIds.has(chainOf(r)[0])).map((r) => r.id));
  const pool = new Map(input.managerIds.map((l) => [l, unscored(members.get(l)!)]));
  const risky = (n: number) => n > 0 && n < k;

  const shown = new Set(input.managerIds.filter((l) => members.get(l)!.length >= k && !risky(pool.get(l)!.size)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const outer of [...shown]) {
      for (const inner of [...shown]) {
        if (outer === inner || !shown.has(outer) || !shown.has(inner)) continue;
        const innerIds = new Set(members.get(inner)!.map((r) => r.id));
        const nested = [...innerIds].every((id) => members.get(outer)!.some((r) => r.id === id));
        if (!nested) continue;
        const diff = [...pool.get(outer)!].filter((id) => !pool.get(inner)!.has(id)).length;
        if (risky(diff)) {
          shown.delete(innerIds.size <= members.get(outer)!.length ? inner : outer);
          changed = true;
        }
      }
    }
  }

  return {
    k,
    invited: input.invitations.length,
    responded: responses.length,
    responseRate: input.invitations.length ? (responses.length / input.invitations.length) * 100 : null,
    managers,
    supOrgs: input.managerIds.map((leaderId) => ({
      leaderId,
      shown: shown.has(leaderId),
      total: shown.has(leaderId) ? scoreBlock(members.get(leaderId)!, input.questions, k) : null,
    })),
  };
}
