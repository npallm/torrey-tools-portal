import type {
  AttributeKey,
  RespondentAttributes,
  SurveyFilter,
  SurveyInvitation,
  SurveyQuestion,
  SurveyResponse,
} from "./types";

export const DEFAULT_ANONYMITY_THRESHOLD = 5;
export const TENURE_BANDS = ["< 1 yr", "1–2 yrs", "3–5 yrs", "6+ yrs"] as const;

export function tenureBand(hireDate: string, asOf: string): (typeof TENURE_BANDS)[number] {
  const years = (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${hireDate}T00:00:00Z`)) / 86_400_000 / 365.25;
  if (years < 1) return "< 1 yr";
  if (years < 3) return "1–2 yrs";
  if (years < 6) return "3–5 yrs";
  return "6+ yrs";
}

export function matchesFilter(a: RespondentAttributes, f: SurveyFilter = {}): boolean {
  for (const key of ["division", "department", "location", "workerType", "tenureBand"] as AttributeKey[]) {
    if (f[key] !== undefined && a[key] !== f[key]) return false;
  }
  return !f.supOrgLeaderId || a.managerChain.includes(f.supOrgLeaderId);
}

/**
 * Small-cell suppression. A cut is hidden when it has fewer than k respondents, or when the
 * rest of the viewer's scope has 1..k−1 respondents (otherwise the small remainder could be
 * derived by subtracting the cut from the scope total).
 */
export function isSuppressed(n: number, scopeN: number, k: number): boolean {
  const rest = scopeN - n;
  return n < k || (rest > 0 && rest < k);
}

export const scoreLikert = (value: number, reverse: boolean) => (reverse ? 6 - value : value);

export type Favorability = { n: number; favorable: number; neutral: number; unfavorable: number; mean: number };

/** % favorable (4–5), neutral (3), unfavorable (1–2) and mean of already-scored 1–5 values. */
export function favorability(values: number[]): Favorability | null {
  if (!values.length) return null;
  const n = values.length;
  const pct = (c: number) => (c / n) * 100;
  return {
    n,
    favorable: pct(values.filter((v) => v >= 4).length),
    neutral: pct(values.filter((v) => v === 3).length),
    unfavorable: pct(values.filter((v) => v <= 2).length),
    mean: values.reduce((a, b) => a + b, 0) / n,
  };
}

export type Enps = { n: number; promoters: number; passives: number; detractors: number; score: number };

/** eNPS = % promoters (9–10) − % detractors (0–6), range −100..100. */
export function enps(values: number[]): Enps | null {
  if (!values.length) return null;
  const n = values.length;
  const promoters = (values.filter((v) => v >= 9).length / n) * 100;
  const detractors = (values.filter((v) => v <= 6).length / n) * 100;
  return { n, promoters, passives: 100 - promoters - detractors, detractors, score: promoters - detractors };
}

export type QuestionResult =
  | { questionId: string; type: "likert5"; suppressed: boolean; favorability: Favorability | null }
  | { questionId: string; type: "enps"; suppressed: boolean; enps: Enps | null }
  | {
      questionId: string;
      type: "single_choice" | "multi_choice";
      suppressed: boolean;
      n: number;
      counts: { option: string; count: number; percent: number }[];
    }
  | { questionId: string; type: "text"; suppressed: boolean; comments: string[] };

export type SurveyResults =
  | { suppressed: true; threshold: number }
  | {
      suppressed: false;
      threshold: number;
      invited: number;
      responded: number;
      responseRate: number | null;
      overall: Favorability | null;
      dimensions: { dimension: string; favorability: Favorability }[];
      questions: QuestionResult[];
      /** Cumulative responses by submission date. */
      timeline: { date: string; cumulative: number }[];
    };

export type ResultsInput = {
  questions: SurveyQuestion[];
  invitations: SurveyInvitation[];
  responses: SurveyResponse[];
  /** Viewer's scope (e.g. a manager's sup org from a share link); {} = whole organization. */
  scope?: SurveyFilter;
  filter?: SurveyFilter;
  threshold?: number;
};

function cut(input: ResultsInput, filter: SurveyFilter) {
  const scope = input.scope ?? {};
  const scopeIds = new Set(input.invitations.filter((i) => matchesFilter(i.attributes, scope)).map((i) => i.id));
  const cutInvitations = input.invitations.filter((i) => scopeIds.has(i.id) && matchesFilter(i.attributes, filter));
  const cutIds = new Set(cutInvitations.map((i) => i.id));
  return {
    scopeN: input.responses.filter((r) => scopeIds.has(r.invitationId)).length,
    invited: cutInvitations.length,
    responses: input.responses.filter((r) => cutIds.has(r.invitationId)),
  };
}

function scoredLikert(q: SurveyQuestion, responses: SurveyResponse[]): number[] {
  return responses.flatMap((r) =>
    r.answers
      .filter((a) => a.questionId === q.id && a.numericValue !== null && a.numericValue >= 1 && a.numericValue <= 5)
      .map((a) => scoreLikert(a.numericValue!, q.reverseScored)),
  );
}

function enpsValues(q: SurveyQuestion, responses: SurveyResponse[]): number[] {
  return responses.flatMap((r) =>
    r.answers
      .filter((a) => a.questionId === q.id && a.numericValue !== null && a.numericValue >= 0 && a.numericValue <= 10)
      .map((a) => a.numericValue!),
  );
}

function questionResult(q: SurveyQuestion, responses: SurveyResponse[], k: number): QuestionResult {
  if (q.type === "likert5") {
    const values = scoredLikert(q, responses);
    const suppressed = values.length < k;
    return { questionId: q.id, type: q.type, suppressed, favorability: suppressed ? null : favorability(values) };
  }
  if (q.type === "enps") {
    const values = enpsValues(q, responses);
    const suppressed = values.length < k;
    return { questionId: q.id, type: q.type, suppressed, enps: suppressed ? null : enps(values) };
  }
  if (q.type === "text") {
    const comments = responses
      .flatMap((r) => r.answers.filter((a) => a.questionId === q.id).map((a) => a.textValue?.trim() ?? ""))
      .filter((t) => t.length > 0)
      .sort((a, b) => a.localeCompare(b));
    const suppressed = comments.length < k;
    return { questionId: q.id, type: q.type, suppressed, comments: suppressed ? [] : comments };
  }
  const answered = responses.filter((r) => r.answers.some((a) => a.questionId === q.id && a.choiceValues.length > 0));
  const suppressed = answered.length < k;
  const counts = q.options.map((option) => {
    const count = answered.filter((r) => r.answers.some((a) => a.questionId === q.id && a.choiceValues.includes(option))).length;
    return { option, count, percent: answered.length ? (count / answered.length) * 100 : 0 };
  });
  return { questionId: q.id, type: q.type, suppressed, n: suppressed ? 0 : answered.length, counts: suppressed ? [] : counts };
}

export function surveyResults(input: ResultsInput): SurveyResults {
  const k = input.threshold ?? DEFAULT_ANONYMITY_THRESHOLD;
  const c = cut(input, input.filter ?? {});
  if (isSuppressed(c.responses.length, c.scopeN, k)) return { suppressed: true, threshold: k };

  const likert = input.questions.filter((q) => q.type === "likert5");
  const dims = [...new Set(likert.map((q) => q.dimension).filter((d): d is string => d !== null))].sort();
  const dimensions = dims
    .map((dimension) => ({
      dimension,
      favorability: favorability(likert.filter((q) => q.dimension === dimension).flatMap((q) => scoredLikert(q, c.responses))),
    }))
    .filter((d): d is { dimension: string; favorability: Favorability } => d.favorability !== null);

  const byDate = new Map<string, number>();
  for (const r of c.responses) byDate.set(r.submittedAt.slice(0, 10), (byDate.get(r.submittedAt.slice(0, 10)) ?? 0) + 1);
  let running = 0;
  const timeline = [...byDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, cumulative: (running += count) }));

  return {
    suppressed: false,
    threshold: k,
    invited: c.invited,
    responded: c.responses.length,
    responseRate: c.invited > 0 ? (c.responses.length / c.invited) * 100 : null,
    overall: favorability(likert.flatMap((q) => scoredLikert(q, c.responses))),
    dimensions,
    questions: [...input.questions].sort((a, b) => a.position - b.position).map((q) => questionResult(q, c.responses, k)),
    timeline,
  };
}

export type BreakdownMetric =
  | { kind: "overall" }
  | { kind: "dimension"; dimension: string }
  | { kind: "question"; questionId: string };

export type BreakdownRow = { group: string; suppressed: boolean; n: number | null; value: number | null };

/**
 * Favorability (or eNPS score for eNPS questions) for each value of an attribute within the
 * current scope + filter. Every row applies small-cell suppression against the filtered total.
 */
export function breakdown(input: ResultsInput, attribute: AttributeKey, metric: BreakdownMetric): BreakdownRow[] {
  const k = input.threshold ?? DEFAULT_ANONYMITY_THRESHOLD;
  const base = { ...input, scope: { ...(input.scope ?? {}), ...(input.filter ?? {}) } };
  const groups = [
    ...new Set(
      input.invitations
        .filter((i) => matchesFilter(i.attributes, base.scope))
        .map((i) => i.attributes[attribute])
        .filter((g): g is string => g !== null),
    ),
  ].sort();
  const question = metric.kind === "question" ? input.questions.find((q) => q.id === metric.questionId) : undefined;
  const likert = input.questions.filter(
    (q) => q.type === "likert5" && (metric.kind === "overall" || (metric.kind === "dimension" && q.dimension === metric.dimension)),
  );

  return groups.map((group) => {
    const c = cut(base, { [attribute]: group });
    if (isSuppressed(c.responses.length, c.scopeN, k)) return { group, suppressed: true, n: null, value: null };
    if (question?.type === "enps") {
      const e = enps(enpsValues(question, c.responses));
      return e && e.n >= k ? { group, suppressed: false, n: e.n, value: e.score } : { group, suppressed: true, n: null, value: null };
    }
    const values = question ? (question.type === "likert5" ? scoredLikert(question, c.responses) : []) : likert.flatMap((q) => scoredLikert(q, c.responses));
    const f = favorability(values);
    return f && c.responses.length >= k
      ? { group, suppressed: false, n: c.responses.length, value: f.favorable }
      : { group, suppressed: true, n: null, value: null };
  });
}
