/** Succession model: critical-role risk × bench strength, with potential split into aspiration / ability / engagement. */

export type Readiness = "ready_now" | "ready_1_2_years" | "ready_3_plus_years";
export type Level3 = 1 | 2 | 3;

export const READINESS_LABELS: Record<Readiness, string> = {
  ready_now: "Ready now",
  ready_1_2_years: "Ready in 1–2 years",
  ready_3_plus_years: "Ready in 3+ years",
};

/** Role risk = impact of loss (1–5) × probability of loss (1–5), range 1–25. */
export function roleRiskScore(impactOfLoss: number, probabilityOfLoss: number): number {
  return impactOfLoss * probabilityOfLoss;
}

export function riskBand(score: number): "High" | "Medium" | "Low" {
  if (score >= 15) return "High";
  if (score >= 8) return "Medium";
  return "Low";
}

/** Default probability of loss from the incumbent's flight risk (users can override). */
export function suggestedProbabilityOfLoss(flightRisk: "low" | "medium" | "high", retirementWithin2Years = false): number {
  const base = flightRisk === "high" ? 5 : flightRisk === "medium" ? 3 : 2;
  return retirementWithin2Years ? Math.max(base, 4) : base;
}

export type Bench = {
  readyNow: number;
  ready1to2: number;
  ready3plus: number;
  covered: boolean;
  label: "Strong" | "Adequate" | "Thin" | "None";
};

/** Covered = ≥1 ready-now successor or ≥2 ready in 1–2 years. */
export function benchStrength(candidates: { readiness: Readiness }[]): Bench {
  const readyNow = candidates.filter((c) => c.readiness === "ready_now").length;
  const ready1to2 = candidates.filter((c) => c.readiness === "ready_1_2_years").length;
  const ready3plus = candidates.filter((c) => c.readiness === "ready_3_plus_years").length;
  const covered = readyNow >= 1 || ready1to2 >= 2;
  const label =
    readyNow >= 2 || (readyNow >= 1 && ready1to2 >= 1) ? "Strong" : covered ? "Adequate" : candidates.length ? "Thin" : "None";
  return { readyNow, ready1to2, ready3plus, covered, label };
}

export type RoleSummary = { roleId: string; riskScore: number; bench: Bench };

/** Bench coverage (%) = covered critical roles ÷ critical roles × 100; null with no roles. */
export function benchCoverage(roles: RoleSummary[]): number | null {
  return roles.length ? (roles.filter((r) => r.bench.covered).length / roles.length) * 100 : null;
}

/** High-risk roles with no coverage. */
export function singlePointsOfFailure(roles: RoleSummary[]): RoleSummary[] {
  return roles.filter((r) => riskBand(r.riskScore) === "High" && !r.bench.covered);
}

/** High potential requires high aspiration, ability and engagement; emerging = none low and sum ≥ 7. */
export function potentialSegment(p: { aspiration: Level3; ability: Level3; engagement: Level3 }): "High potential" | "Emerging" | "Developing" {
  if (p.aspiration === 3 && p.ability === 3 && p.engagement === 3) return "High potential";
  const min = Math.min(p.aspiration, p.ability, p.engagement);
  return min >= 2 && p.aspiration + p.ability + p.engagement >= 7 ? "Emerging" : "Developing";
}

/** Trend between the last two overall ratings (chronological). */
export function performanceTrend(ratings: number[]): "Rising" | "Steady" | "Declining" | "Insufficient data" {
  if (ratings.length < 2) return "Insufficient data";
  const diff = ratings[ratings.length - 1] - ratings[ratings.length - 2];
  if (diff >= 0.5) return "Rising";
  if (diff <= -0.5) return "Declining";
  return "Steady";
}
