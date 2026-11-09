import type {
  AbsenceRecord,
  JobEvent,
  JobEventType,
  MetricResult,
  PayStatementRecord,
  Period,
  PositionRecord,
  SeparationCategory,
  WorkforcePerson,
} from "./types";

const DAY_MS = 86_400_000;

export const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => toIso(toTime(iso) + n * DAY_MS);
export const daysInclusive = (p: Period) => Math.round((toTime(p.end) - toTime(p.start)) / DAY_MS) + 1;

export function lastDayOfMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return toIso(Date.UTC(y, m, 0));
}

export function ratio(numerator: number, denominator: number, scale = 1): MetricResult {
  return { value: denominator > 0 ? (numerator / denominator) * scale : null, numerator, denominator };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export type PopulationFilter = { department?: string; includeContingent?: boolean };

export function inPopulation(p: WorkforcePerson, f: PopulationFilter = {}): boolean {
  if (!f.includeContingent && p.workerType !== "Employee") return false;
  if (f.department && p.department !== f.department) return false;
  return true;
}

/** On payroll on `date`: hired on/before it and not yet past the last day. */
export function isEmployedOn(p: WorkforcePerson, date: string): boolean {
  return p.hireDate <= date && (p.terminationDate === null || p.terminationDate >= date);
}

export function headcountOn(people: WorkforcePerson[], date: string, f?: PopulationFilter): number {
  return people.filter((p) => inPopulation(p, f) && isEmployedOn(p, date)).length;
}

/** Splits a period into calendar-month segments clipped to the period. */
export function monthSegments(period: Period): Period[] {
  const out: Period[] = [];
  let start = period.start;
  while (start <= period.end) {
    const monthEnd = lastDayOfMonth(start);
    const end = monthEnd < period.end ? monthEnd : period.end;
    out.push({ start, end });
    start = addDays(end, 1);
  }
  return out;
}

/**
 * Average headcount = mean of monthly averages, where each month's average is
 * (headcount at month start + headcount at month end) / 2.
 */
export function averageHeadcount(people: WorkforcePerson[], period: Period, f?: PopulationFilter): number {
  const monthly = monthSegments(period).map(
    (s) => (headcountOn(people, s.start, f) + headcountOn(people, s.end, f)) / 2,
  );
  return monthly.length ? sum(monthly) / monthly.length : 0;
}

export function separationsIn(
  people: WorkforcePerson[],
  period: Period,
  f?: PopulationFilter,
  category?: SeparationCategory,
): WorkforcePerson[] {
  return people.filter(
    (p) =>
      inPopulation(p, f) &&
      p.terminationDate !== null &&
      p.terminationDate >= period.start &&
      p.terminationDate <= period.end &&
      (!category || p.separationCategory === category),
  );
}

/** Turnover rate (%) = separations in period / average headcount × 100. */
export function turnoverRate(
  people: WorkforcePerson[],
  period: Period,
  opts: PopulationFilter & { category?: SeparationCategory } = {},
): MetricResult {
  return ratio(separationsIn(people, period, opts, opts.category).length, averageHeadcount(people, period, opts), 100);
}

/** Scales a period rate to a 365-day year. */
export function annualize(r: MetricResult, period: Period): MetricResult {
  if (r.value === null) return r;
  return { ...r, value: (r.value * 365) / daysInclusive(period) };
}

/** Retention rate (%) = employees on payroll at period start still on payroll at period end / start headcount × 100. */
export function retentionRate(people: WorkforcePerson[], period: Period, f?: PopulationFilter): MetricResult {
  const cohort = people.filter((p) => inPopulation(p, f) && isEmployedOn(p, period.start));
  return ratio(cohort.filter((p) => isEmployedOn(p, period.end)).length, cohort.length, 100);
}

/** New-hire (early) turnover (%) = hires in period who also separated in period / hires in period × 100. */
export function newHireTurnoverRate(people: WorkforcePerson[], period: Period, f?: PopulationFilter): MetricResult {
  const hires = people.filter((p) => inPopulation(p, f) && p.hireDate >= period.start && p.hireDate <= period.end);
  const left = hires.filter((p) => p.terminationDate !== null && p.terminationDate <= period.end);
  return ratio(left.length, hires.length, 100);
}

/** Compa-ratio = salary / pay-range midpoint. */
export function compaRatio(salary: number | null, midpoint: number | null): number | null {
  return salary !== null && midpoint !== null && midpoint > 0 ? salary / midpoint : null;
}

const hasPay = (p: WorkforcePerson) => p.annualSalary !== null && p.payRangeMid !== null && p.payRangeMid > 0;

/** Group compa-ratio = Σ salaries / Σ midpoints. */
export function groupCompaRatio(people: WorkforcePerson[]): MetricResult {
  const xs = people.filter(hasPay);
  return ratio(sum(xs.map((p) => p.annualSalary!)), sum(xs.map((p) => p.payRangeMid!)));
}

/** Average compa-ratio = mean of individual compa-ratios. */
export function averageCompaRatio(people: WorkforcePerson[]): MetricResult {
  const xs = people.filter(hasPay);
  return ratio(sum(xs.map((p) => p.annualSalary! / p.payRangeMid!)), xs.length);
}

/** Range penetration = (salary − range min) / (range max − range min). */
export function rangePenetration(salary: number | null, min: number | null, max: number | null): number | null {
  return salary !== null && min !== null && max !== null && max > min ? (salary - min) / (max - min) : null;
}

export function weekdaysBetween(start: string, end: string): number {
  const startTime = toTime(start);
  const totalDays = Math.floor((toTime(end) - startTime) / DAY_MS) + 1;
  if (totalDays <= 0) return 0;

  const fullWeeks = Math.floor(totalDays / 7);
  const remainder = totalDays % 7;
  const firstDay = new Date(startTime).getUTCDay();
  let weekdays = fullWeeks * 5;
  for (let offset = 0; offset < remainder; offset++) {
    const day = (firstDay + offset) % 7;
    if (day !== 0 && day !== 6) weekdays++;
  }
  return weekdays;
}

/** Scheduled workdays = Σ over the population of weekdays employed within the period × FTE. */
export function scheduledWorkdays(people: WorkforcePerson[], period: Period, f?: PopulationFilter): number {
  return sum(
    people
      .filter((p) => inPopulation(p, f))
      .map((p) => {
        const start = p.hireDate > period.start ? p.hireDate : period.start;
        const lastDay = p.terminationDate ?? period.end;
        const end = lastDay < period.end ? lastDay : period.end;
        return start <= end ? weekdaysBetween(start, end) * p.fte : 0;
      }),
  );
}

/** Absence rate (%) = unplanned absence days / scheduled workdays × 100. */
export function absenceRate(
  people: WorkforcePerson[],
  absences: AbsenceRecord[],
  period: Period,
  f?: PopulationFilter,
): MetricResult {
  const ids = new Set(people.filter((p) => inPopulation(p, f)).map((p) => p.id));
  const days = sum(
    absences
      .filter((a) => !a.planned && ids.has(a.personId) && a.startDate >= period.start && a.startDate <= period.end)
      .map((a) => a.days),
  );
  return ratio(days, scheduledWorkdays(people, period, f), 100);
}

/** Span of control = direct reports of active managers / number of active managers (all worker types). */
export function spanOfControl(
  people: WorkforcePerson[],
  date: string,
): MetricResult & { byManager: { managerId: string; directs: number }[] } {
  const active = people.filter((p) => isEmployedOn(p, date));
  const activeIds = new Set(active.map((p) => p.id));
  const counts = new Map<string, number>();
  for (const p of active) {
    if (p.managerId && activeIds.has(p.managerId)) counts.set(p.managerId, (counts.get(p.managerId) ?? 0) + 1);
  }
  const byManager = [...counts].map(([managerId, directs]) => ({ managerId, directs }));
  return { ...ratio(sum(byManager.map((m) => m.directs)), byManager.length), byManager };
}

/** Average tenure (years) of the population on payroll on `date`. */
export function averageTenureYears(people: WorkforcePerson[], date: string, f?: PopulationFilter): MetricResult {
  const active = people.filter((p) => inPopulation(p, f) && isEmployedOn(p, date));
  const years = active.map((p) => (toTime(date) - toTime(p.hireDate)) / DAY_MS / 365.25);
  return ratio(sum(years), active.length);
}

/** Total FTE of the population on payroll on `date`. */
export function totalFte(people: WorkforcePerson[], date: string, f?: PopulationFilter): number {
  return sum(people.filter((p) => inPopulation(p, f) && isEmployedOn(p, date)).map((p) => p.fte));
}

/** Vacancy rate (%) = open budgeted positions / total budgeted positions × 100. */
export function vacancyRate(positions: PositionRecord[], department?: string): MetricResult {
  const xs = positions.filter((p) => !department || p.department === department);
  return ratio(xs.filter((p) => p.status === "Open").length, xs.length, 100);
}

/** Movement rate (%) = qualifying job events in period / average headcount × 100. */
export function movementRate(
  people: WorkforcePerson[],
  events: JobEvent[],
  period: Period,
  types: JobEventType[],
  f?: PopulationFilter,
): MetricResult {
  const ids = new Set(people.filter((p) => inPopulation(p, f)).map((p) => p.id));
  const n = events.filter(
    (e) => types.includes(e.type) && ids.has(e.personId) && e.effectiveDate >= period.start && e.effectiveDate <= period.end,
  ).length;
  return ratio(n, averageHeadcount(people, period, f), 100);
}

/** HR staffing ratio = HR FTE per 100 employee FTE. */
export function hrStaffingRatio(people: WorkforcePerson[], date: string, hrDepartment: string): MetricResult {
  return ratio(totalFte(people, date, { department: hrDepartment }), totalFte(people, date), 100);
}

export type LaborCost = { wages: number; employerTaxes: number; employerContributions: number; total: number };

/**
 * Labor cost for statements paid in the period (cash basis, by pay date):
 * earnings excluding reimbursements + employer taxes + employer contributions.
 */
export function laborCostIn(statements: PayStatementRecord[], period: Period, personIds?: Set<string>): LaborCost {
  const xs = statements.filter(
    (s) => s.payDate >= period.start && s.payDate <= period.end && (!personIds || personIds.has(s.personId)),
  );
  const wages = sum(xs.flatMap((s) => s.earnings.filter((e) => e.type !== "reimbursement").map((e) => e.amount)));
  const employerTaxes = sum(xs.map((s) => s.employerTaxes));
  const employerContributions = sum(xs.map((s) => s.employerContributions));
  return { wages, employerTaxes, employerContributions, total: wages + employerTaxes + employerContributions };
}

export function populationIds(people: WorkforcePerson[], f?: PopulationFilter): Set<string> {
  return new Set(people.filter((p) => inPopulation(p, f)).map((p) => p.id));
}

/** Annualized labor cost per employee = labor cost ÷ average headcount × 365 ÷ days in period. */
export function laborCostPerEmployee(
  people: WorkforcePerson[],
  statements: PayStatementRecord[],
  period: Period,
  f?: PopulationFilter,
): MetricResult {
  const lc = laborCostIn(statements, period, populationIds(people, f));
  return annualize(ratio(lc.total, averageHeadcount(people, period, f)), period);
}

/** Overtime share (%) = (overtime + double overtime earnings) ÷ earnings excluding reimbursements × 100. */
export function overtimeShare(statements: PayStatementRecord[], period: Period, personIds?: Set<string>): MetricResult {
  const xs = statements.filter(
    (s) => s.payDate >= period.start && s.payDate <= period.end && (!personIds || personIds.has(s.personId)),
  );
  const earnings = xs.flatMap((s) => s.earnings.filter((e) => e.type !== "reimbursement"));
  const ot = sum(earnings.filter((e) => e.type === "overtime" || e.type === "double_overtime").map((e) => e.amount));
  return ratio(ot, sum(earnings.map((e) => e.amount)), 100);
}

/** Employer burden rate (%) = (employer taxes + employer contributions) ÷ wages × 100. */
export function burdenRate(lc: LaborCost): MetricResult {
  return ratio(lc.employerTaxes + lc.employerContributions, lc.wages, 100);
}

/** Labor cost to revenue (%) = annualized labor cost ÷ annual revenue × 100. */
export function laborCostToRevenue(lc: LaborCost, period: Period, annualRevenue: number | null): MetricResult {
  return ratio((lc.total * 365) / daysInclusive(period), annualRevenue ?? 0, 100);
}

/** Revenue per employee = annual revenue ÷ average headcount. */
export function revenuePerEmployee(
  people: WorkforcePerson[],
  period: Period,
  annualRevenue: number | null,
  f?: PopulationFilter,
): MetricResult {
  return annualRevenue === null ? ratio(0, 0) : ratio(annualRevenue, averageHeadcount(people, period, f));
}
