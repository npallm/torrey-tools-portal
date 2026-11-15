/** Weighted score = Σ(weight × rating) ÷ Σ weight over rated items; null if nothing rated. */
export function weightedScore(items: { weight: number; rating: number | null }[]): number | null {
  const rated = items.filter((i) => i.rating !== null && i.weight > 0);
  const w = rated.reduce((a, i) => a + i.weight, 0);
  return w > 0 ? rated.reduce((a, i) => a + i.weight * i.rating!, 0) / w : null;
}

export const GOAL_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
  done: "Done",
};

export function goalStatusLabel(status: string): string {
  return GOAL_STATUS_LABELS[status] ?? status;
}

/** Goal attainment (%) = weight-averaged progress, each goal capped to 0–100. */
export function goalAttainment(goals: { weight: number; progressPct: number }[]): number | null {
  const w = goals.reduce((a, g) => a + (g.weight > 0 ? g.weight : 0), 0);
  if (w === 0) return null;
  return goals.reduce((a, g) => a + (g.weight > 0 ? g.weight * Math.min(100, Math.max(0, g.progressPct)) : 0), 0) / w;
}

export function proposedRating(input: {
  managerItems: { weight: number; rating: number | null }[];
  goals: { weight: number; progressPct: number }[];
  includeGoals: boolean;
  goalsWeight: number;
  scaleMin: number;
  scaleMax: number;
}): number | null {
  const managerScore = weightedScore(input.managerItems);
  if (managerScore === null) return null;
  const goalWeight = input.includeGoals ? input.goalsWeight / 100 : 0;
  if (goalWeight === 0) return Math.round((managerScore + Number.EPSILON) * 100) / 100;

  const attainment = goalAttainment(input.goals);
  if (attainment === null) return null;
  const goalScore = (attainment / 100) * (input.scaleMax - input.scaleMin) + input.scaleMin;
  return Math.round(((1 - goalWeight) * managerScore + goalWeight * goalScore + Number.EPSILON) * 100) / 100;
}

/** Positive = manager rated higher than the employee's self-rating. */
export function selfManagerGap(self: number | null, manager: number | null): number | null {
  return self === null || manager === null ? null : manager - self;
}

/** Counts of final ratings at each scale point. Values are rounded to the nearest point. */
export function ratingDistribution(values: number[], points: number[]): { point: number; count: number }[] {
  return points.map((point) => ({ point, count: values.filter((v) => Math.round(v) === point).length }));
}

export function calibrationShift(outcomes: { proposed: number | null; calibrated: number | null }[]) {
  const both = outcomes.filter((o) => o.proposed !== null && o.calibrated !== null);
  const diffs = both.map((o) => o.calibrated! - o.proposed!);
  return {
    raised: diffs.filter((d) => d > 0).length,
    lowered: diffs.filter((d) => d < 0).length,
    unchanged: diffs.filter((d) => d === 0).length,
    averageShift: diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null,
  };
}
