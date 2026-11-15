import type { AttributeKey, RespondentAttributes, SurveyFilter } from "./types";

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
