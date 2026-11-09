import {
  absenceRate,
  addDays,
  annualize,
  averageCompaRatio,
  averageHeadcount,
  averageTenureYears,
  burdenRate,
  compaRatio,
  daysInclusive,
  groupCompaRatio,
  headcountOn,
  hrStaffingRatio,
  isEmployedOn,
  laborCostIn,
  laborCostPerEmployee,
  laborCostToRevenue,
  monthSegments,
  movementRate,
  newHireTurnoverRate,
  overtimeShare,
  populationIds,
  rangePenetration,
  ratio,
  retentionRate,
  revenuePerEmployee,
  spanOfControl,
  toIso,
  totalFte,
  turnoverRate,
  vacancyRate,
} from "./calc";
import type { EarningType, MetricResult, Period, SeparationCategory, WorkforceDataset } from "./types";

export type ChartFormat = "column" | "bar" | "line" | "pie" | "table";
export type Unit = "count" | "percent" | "ratio" | "years" | "days" | "currency" | "fte";
export type DataRequirement =
  | "payRanges"
  | "payroll"
  | "absences"
  | "positions"
  | "reviews"
  | "jobEvents"
  | "revenue"
  | "managers"
  | "pto";
export type Datum = { label: string; value: number; hint?: string };
export type Kpi = { label: string; value: number | null; unit: Unit; detail?: string };
export type ViewResult = {
  series: Datum[];
  unit: Unit;
  kpis: Kpi[];
  referenceLines?: { value: number; label: string }[];
};
export type ViewDefinition = {
  id: string;
  title: string;
  description: string;
  metricId: string;
  formats: ChartFormat[];
  requires?: DataRequirement[];
  build: (ds: WorkforceDataset, period: Period) => ViewResult;
};
export type DashboardDefinition = { id: string; title: string; description: string; views: ViewDefinition[] };

export function dataCoverage(ds: WorkforceDataset): Record<DataRequirement, boolean> {
  return {
    payRanges: ds.people.some((person) => person.payRangeMid !== null),
    payroll: ds.payStatements.length > 0,
    absences: ds.absences.length > 0,
    positions: ds.positions.length > 0,
    reviews: ds.reviews.length > 0,
    jobEvents: ds.jobEvents.length > 0,
    revenue: ds.organization.annualRevenue !== null,
    managers: ds.people.some((person) => person.managerId !== null),
    pto: ds.pto.length > 0,
  };
}

// Format rules: trends → line first; categories → sorted bars; pie only for part-to-whole totals.
const TREND: ChartFormat[] = ["line", "column", "table"];
const CATEGORY: ChartFormat[] = ["bar", "column", "table"];
const PART: ChartFormat[] = ["column", "bar", "pie", "table"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;

const fmt = (n: number, d = 1) => n.toFixed(d);
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const departments = (ds: WorkforceDataset) => [...new Set(ds.people.map((p) => p.department))].sort();
const nonNull = (d: { label: string; r: MetricResult; hint?: string }[]): Datum[] =>
  d.filter((x) => x.r.value !== null).map((x) => ({ label: x.label, value: x.r.value!, hint: x.hint }));
const byValueDesc = (xs: Datum[]) => [...xs].sort((a, b) => b.value - a.value);
const kpi = (label: string, r: MetricResult, unit: Unit, detail?: string): Kpi => ({ label, value: r.value, unit, detail });

function activePaid(ds: WorkforceDataset, date: string) {
  return ds.people.filter((p) => p.workerType === "Employee" && isEmployedOn(p, date));
}

function turnoverKpis(ds: WorkforceDataset, period: Period, opts: { category?: SeparationCategory } = {}): Kpi[] {
  const r = turnoverRate(ds.people, period, opts);
  const out = [kpi("Turnover rate", r, "percent", `${r.numerator} separations ÷ ${fmt(r.denominator)} avg headcount`)];
  if (daysInclusive(period) < 365) out.push(kpi("Annualized", annualize(r, period), "percent", "× 365 ÷ days in period"));
  return out;
}

const SEPARATION_CATEGORIES: SeparationCategory[] = ["Quit", "Layoff/Discharge", "Other"];
const EARNING_LABELS: Record<EarningType, string> = {
  salary: "Salary",
  wage: "Hourly wages",
  reimbursement: "Reimbursement",
  overtime: "Overtime",
  severance: "Severance",
  double_overtime: "Double overtime",
  pto: "PTO",
  sick: "Sick",
  bonus: "Bonus",
  commission: "Commission",
  tips: "Tips",
  other: "Other",
};

export const DASHBOARDS: DashboardDefinition[] = [
  {
    id: "workforce",
    title: "Workforce",
    description: "Size, shape and structure of the organization.",
    views: [
      {
        id: "headcount-by-dept",
        title: "Headcount by department",
        description: "Employees on payroll at period end.",
        metricId: "headcount",
        formats: PART,
        build: (ds, p) => {
          const series = byValueDesc(
            departments(ds).map((d) => ({ label: d, value: headcountOn(ds.people, p.end, { department: d }) })),
          ).filter((d) => d.value > 0);
          const hc = headcountOn(ds.people, p.end);
          return {
            series,
            unit: "count",
            kpis: [
              { label: "Headcount", value: hc, unit: "count" },
              { label: "Contingent workers", value: headcountOn(ds.people, p.end, { includeContingent: true }) - hc, unit: "count" },
              { label: "Total FTE", value: totalFte(ds.people, p.end), unit: "fte" },
            ],
          };
        },
      },
      {
        id: "headcount-trend",
        title: "Headcount trend",
        description: "Month-end headcount across the period.",
        metricId: "averageHeadcount",
        formats: TREND,
        build: (ds, p) => ({
          series: monthSegments(p).map((s) => ({ label: monthLabel(s.start), value: headcountOn(ds.people, s.end) })),
          unit: "count",
          kpis: [{ label: "Average headcount", value: averageHeadcount(ds.people, p), unit: "count" }],
        }),
      },
      {
        id: "worker-mix",
        title: "Worker type mix",
        description: "Full-time, part-time and contingent workers at period end.",
        metricId: "headcount",
        formats: PART,
        build: (ds, p) => {
          const active = ds.people.filter((x) => isEmployedOn(x, p.end));
          const series = [
            { label: "Full-time employees", value: active.filter((x) => x.workerType === "Employee" && x.fte >= 1).length },
            { label: "Part-time employees", value: active.filter((x) => x.workerType === "Employee" && x.fte < 1).length },
            { label: "Contingent", value: active.filter((x) => x.workerType === "Contingent").length },
          ].filter((d) => d.value > 0);
          return { series, unit: "count", kpis: [{ label: "Total workers", value: active.length, unit: "count" }] };
        },
      },
      {
        id: "span-of-control",
        title: "Span of control",
        description: "Direct reports per active manager at period end.",
        metricId: "spanOfControl",
        formats: CATEGORY,
        requires: ["managers"],
        build: (ds, p) => {
          const r = spanOfControl(ds.people, p.end);
          const name = (id: string) => ds.people.find((x) => x.id === id)?.name ?? id;
          return {
            series: byValueDesc(r.byManager.map((m) => ({ label: name(m.managerId), value: m.directs }))),
            unit: "count",
            kpis: [kpi("Average span", r, "ratio", `${r.numerator} reports ÷ ${r.denominator} managers`)],
          };
        },
      },
      {
        id: "tenure-by-dept",
        title: "Average tenure by department",
        description: "Years of service for employees on payroll at period end.",
        metricId: "averageTenure",
        formats: CATEGORY,
        build: (ds, p) => ({
          series: byValueDesc(
            nonNull(departments(ds).map((d) => ({ label: d, r: averageTenureYears(ds.people, p.end, { department: d }) }))),
          ),
          unit: "years",
          kpis: [kpi("Average tenure", averageTenureYears(ds.people, p.end), "years")],
        }),
      },
    ],
  },
  {
    id: "turnover",
    title: "Turnover & retention",
    description: "Who is leaving, why, and who stays.",
    views: [
      {
        id: "turnover-trend",
        title: "Monthly turnover rate",
        description: "Separations ÷ average headcount for each month.",
        metricId: "turnoverRate",
        formats: TREND,
        build: (ds, p) => ({
          series: monthSegments(p).map((s) => ({
            label: monthLabel(s.start),
            value: turnoverRate(ds.people, s).value ?? 0,
          })),
          unit: "percent",
          kpis: [...turnoverKpis(ds, p), kpi("Retention rate", retentionRate(ds.people, p), "percent")],
        }),
      },
      {
        id: "turnover-by-category",
        title: "Turnover by separation type",
        description: "JOLTS categories: quits, layoffs/discharges, other.",
        metricId: "turnoverRate",
        formats: PART,
        build: (ds, p) => ({
          series: nonNull(
            SEPARATION_CATEGORIES.map((c) => ({ label: c, r: turnoverRate(ds.people, p, { category: c }) })),
          ).filter((d) => d.value > 0),
          unit: "percent",
          kpis: [
            kpi("Voluntary (quit) rate", turnoverRate(ds.people, p, { category: "Quit" }), "percent"),
            kpi("Involuntary rate", turnoverRate(ds.people, p, { category: "Layoff/Discharge" }), "percent"),
          ],
        }),
      },
      {
        id: "turnover-by-dept",
        title: "Turnover by department",
        description: "Department separations ÷ department average headcount.",
        metricId: "turnoverRate",
        formats: CATEGORY,
        build: (ds, p) => ({
          series: byValueDesc(
            nonNull(
              departments(ds).map((d) => {
                const r = turnoverRate(ds.people, p, { department: d });
                return { label: d, r, hint: `${r.numerator} of ${fmt(r.denominator)}` };
              }),
            ),
          ),
          unit: "percent",
          kpis: turnoverKpis(ds, p),
        }),
      },
      {
        id: "retention-by-dept",
        title: "Retention by department",
        description: "Share of each department's start-of-period team still employed at period end.",
        metricId: "retentionRate",
        formats: CATEGORY,
        build: (ds, p) => ({
          series: byValueDesc(
            nonNull(
              departments(ds).map((d) => {
                const r = retentionRate(ds.people, p, { department: d });
                return { label: d, r, hint: `${r.numerator} of ${r.denominator} employees` };
              }),
            ),
          ),
          unit: "percent",
          kpis: [kpi("Retention rate", retentionRate(ds.people, p), "percent")],
        }),
      },
      {
        id: "new-hire-turnover",
        title: "New-hire turnover",
        description: "Hires in the period who also left in the period.",
        metricId: "newHireTurnover",
        formats: CATEGORY,
        build: (ds, p) => {
          const r = newHireTurnoverRate(ds.people, p);
          return {
            series: byValueDesc(
              nonNull(
                departments(ds).map((d) => {
                  const departmentResult = newHireTurnoverRate(ds.people, p, { department: d });
                  return {
                    label: d,
                    r: departmentResult,
                    hint: `${departmentResult.numerator} of ${departmentResult.denominator} hires`,
                  };
                }),
              ),
            ),
            unit: "percent",
            kpis: [kpi("New-hire turnover", r, "percent", `${r.numerator} of ${r.denominator} hires`)],
          };
        },
      },
    ],
  },
  {
    id: "compensation",
    title: "Compensation",
    description: "Pay positioning against ranges.",
    views: [
      {
        id: "compa-distribution",
        title: "Compa-ratio distribution",
        description: "Employees grouped into compa-ratio bands.",
        metricId: "compaRatio",
        formats: PART,
        requires: ["payRanges"],
        build: (ds, p) => {
          const people = activePaid(ds, p.end);
          const ratios = people
            .map((person) => compaRatio(person.annualSalary, person.payRangeMid))
            .filter((value): value is number => value !== null);
          const buckets = [
            { label: "< 0.80", includes: (value: number) => value < 0.8 },
            { label: "0.80–0.89", includes: (value: number) => value >= 0.8 && value < 0.9 },
            { label: "0.90–0.99", includes: (value: number) => value >= 0.9 && value < 1 },
            { label: "1.00–1.09", includes: (value: number) => value >= 1 && value < 1.1 },
            { label: "1.10–1.20", includes: (value: number) => value >= 1.1 && value <= 1.2 },
            { label: "> 1.20", includes: (value: number) => value > 1.2 },
          ];
          return {
            series: buckets.map((bucket) => ({
              label: bucket.label,
              value: ratios.filter(bucket.includes).length,
            })),
            unit: "count",
            kpis: [
              kpi("Group compa-ratio", groupCompaRatio(people), "ratio", "Σ salaries ÷ Σ midpoints"),
              kpi("Average compa-ratio", averageCompaRatio(people), "ratio", "mean of individual ratios"),
            ],
          };
        },
      },
      {
        id: "compa-by-employee",
        title: "Compa-ratio by employee",
        description: "Salary ÷ pay-range midpoint; 0.80–1.20 band shown.",
        metricId: "compaRatio",
        formats: CATEGORY,
        requires: ["payRanges"],
        build: (ds, p) => {
          const people = activePaid(ds, p.end);
          return {
            series: byValueDesc(
              people
                .map((x) => ({ x, v: compaRatio(x.annualSalary, x.payRangeMid) }))
                .filter((d) => d.v !== null)
                .map(({ x, v }) => ({ label: x.name, value: v!, hint: `${money(x.annualSalary!)} vs ${money(x.payRangeMid!)}` })),
            ),
            unit: "ratio",
            kpis: [
              kpi("Group compa-ratio", groupCompaRatio(people), "ratio", "Σ salaries ÷ Σ midpoints"),
              kpi("Average compa-ratio", averageCompaRatio(people), "ratio", "mean of individual ratios"),
            ],
            referenceLines: [
              { value: 0.8, label: "0.80" },
              { value: 1, label: "Midpoint" },
              { value: 1.2, label: "1.20" },
            ],
          };
        },
      },
      {
        id: "compa-by-dept",
        title: "Group compa-ratio by department",
        description: "Σ salaries ÷ Σ midpoints per department.",
        metricId: "compaRatio",
        formats: CATEGORY,
        requires: ["payRanges"],
        build: (ds, p) => {
          const people = activePaid(ds, p.end);
          return {
            series: byValueDesc(
              nonNull(departments(ds).map((d) => ({ label: d, r: groupCompaRatio(people.filter((x) => x.department === d)) }))),
            ),
            unit: "ratio",
            kpis: [kpi("Group compa-ratio", groupCompaRatio(people), "ratio")],
            referenceLines: [{ value: 1, label: "Midpoint" }],
          };
        },
      },
      {
        id: "range-penetration",
        title: "Range penetration by employee",
        description: "Position within pay range: 0% = minimum, 100% = maximum.",
        metricId: "rangePenetration",
        formats: CATEGORY,
        requires: ["payRanges"],
        build: (ds, p) => {
          const series = byValueDesc(
            activePaid(ds, p.end)
              .map((x) => ({ label: x.name, v: rangePenetration(x.annualSalary, x.payRangeMin, x.payRangeMax) }))
              .filter((d) => d.v !== null)
              .map((d) => ({ label: d.label, value: d.v! * 100 })),
          );
          return {
            series,
            unit: "percent",
            kpis: [kpi("Average range penetration", ratio(series.reduce((a, d) => a + d.value, 0), series.length), "percent")],
            referenceLines: [{ value: 50, label: "Midpoint" }],
          };
        },
      },
    ],
  },
  {
    id: "labor-cost",
    title: "Labor cost",
    description: "Read-only payroll: what the workforce costs.",
    views: [
      {
        id: "labor-cost-trend",
        title: "Monthly labor cost",
        description: "Earnings + employer taxes + employer contributions, by pay date.",
        metricId: "laborCost",
        formats: TREND,
        requires: ["payroll"],
        build: (ds, p) => {
          const lc = laborCostIn(ds.payStatements, p);
          const rev = ds.organization.annualRevenue;
          return {
            series: monthSegments(p).map((s) => ({ label: monthLabel(s.start), value: laborCostIn(ds.payStatements, s).total })),
            unit: "currency",
            kpis: [
              { label: "Total labor cost", value: lc.total, unit: "currency" },
              kpi("Per employee (annualized)", laborCostPerEmployee(ds.people, ds.payStatements, p), "currency"),
              kpi("Labor cost to revenue", laborCostToRevenue(lc, p, rev), "percent"),
              kpi("Revenue per employee", revenuePerEmployee(ds.people, p, rev), "currency"),
            ],
          };
        },
      },
      {
        id: "labor-cost-by-dept",
        title: "Labor cost by department",
        description: "Total labor cost in the period by employee department.",
        metricId: "laborCost",
        formats: PART,
        requires: ["payroll"],
        build: (ds, p) => ({
          series: byValueDesc(
            departments(ds).map((d) => ({
              label: d,
              value: laborCostIn(ds.payStatements, p, populationIds(ds.people, { department: d, includeContingent: true })).total,
            })),
          ).filter((d) => d.value > 0),
          unit: "currency",
          kpis: [{ label: "Total labor cost", value: laborCostIn(ds.payStatements, p).total, unit: "currency" }],
        }),
      },
      {
        id: "earnings-mix",
        title: "Earnings mix",
        description: "Earnings by Finch pay-statement type (excl. reimbursements).",
        metricId: "overtimeShare",
        formats: PART,
        requires: ["payroll"],
        build: (ds, p) => {
          const totals = new Map<EarningType, number>();
          for (const s of ds.payStatements) {
            if (s.payDate < p.start || s.payDate > p.end) continue;
            for (const e of s.earnings) if (e.type !== "reimbursement") totals.set(e.type, (totals.get(e.type) ?? 0) + e.amount);
          }
          return {
            series: byValueDesc([...totals].map(([t, v]) => ({ label: EARNING_LABELS[t], value: v }))),
            unit: "currency",
            kpis: [kpi("Overtime share", overtimeShare(ds.payStatements, p), "percent")],
          };
        },
      },
      {
        id: "labor-cost-components",
        title: "Labor cost components",
        description: "Wages vs. employer taxes vs. employer contributions.",
        metricId: "burdenRate",
        formats: PART,
        requires: ["payroll"],
        build: (ds, p) => {
          const lc = laborCostIn(ds.payStatements, p);
          return {
            series: [
              { label: "Wages", value: lc.wages },
              { label: "Employer taxes", value: lc.employerTaxes },
              { label: "Employer contributions", value: lc.employerContributions },
            ].filter((d) => d.value > 0),
            unit: "currency",
            kpis: [kpi("Employer burden rate", burdenRate(lc), "percent", "(taxes + contributions) ÷ wages")],
          };
        },
      },
    ],
  },
  {
    id: "absence",
    title: "Absence & time off",
    description: "Unplanned absence and approved leave.",
    views: [
      {
        id: "absence-trend",
        title: "Monthly absence rate",
        description: "Unplanned absence days ÷ scheduled workdays.",
        metricId: "absenceRate",
        formats: TREND,
        requires: ["absences"],
        build: (ds, p) => {
          const r = absenceRate(ds.people, ds.absences, p);
          return {
            series: monthSegments(p).map((s) => ({
              label: monthLabel(s.start),
              value: absenceRate(ds.people, ds.absences, s).value ?? 0,
            })),
            unit: "percent",
            kpis: [kpi("Absence rate", r, "percent", `${fmt(r.numerator)} days ÷ ${fmt(r.denominator, 0)} scheduled`)],
          };
        },
      },
      {
        id: "absence-by-dept",
        title: "Absence rate by department",
        description: "Unplanned absence days ÷ scheduled workdays per department.",
        metricId: "absenceRate",
        formats: CATEGORY,
        requires: ["absences"],
        build: (ds, p) => ({
          series: byValueDesc(
            nonNull(
              departments(ds).map((d) => {
                const r = absenceRate(ds.people, ds.absences, p, { department: d });
                return {
                  label: d,
                  r,
                  hint: `${fmt(r.numerator, 1)} days of ${fmt(r.denominator)} scheduled`,
                };
              }),
            ),
          ),
          unit: "percent",
          kpis: [kpi("Absence rate", absenceRate(ds.people, ds.absences, p), "percent")],
        }),
      },
      {
        id: "pto-by-type",
        title: "Approved time off by type",
        description: "Approved days with a start date in the period.",
        metricId: "ptoUsage",
        formats: PART,
        requires: ["pto"],
        build: (ds, p) => {
          const totals = new Map<string, number>();
          for (const r of ds.pto) {
            if (r.status !== "Approved" || r.startDate < p.start || r.startDate > p.end) continue;
            totals.set(r.type, (totals.get(r.type) ?? 0) + r.days);
          }
          const series = byValueDesc([...totals].map(([label, value]) => ({ label, value })));
          return {
            series,
            unit: "days",
            kpis: [{ label: "Approved days", value: series.reduce((a, d) => a + d.value, 0), unit: "days" }],
          };
        },
      },
    ],
  },
  {
    id: "performance",
    title: "Performance",
    description: "Review cycle health and rating calibration.",
    views: [
      {
        id: "rating-distribution",
        title: "Rating distribution",
        description: "Completed reviews by rating, all cycles.",
        metricId: "reviewCompletion",
        formats: PART,
        requires: ["reviews"],
        build: (ds) => {
          const ratings = ["Exceeds", "Meets", "Needs improvement"] as const;
          const done = ds.reviews.filter((r) => r.status === "Complete");
          return {
            series: ratings.map((r) => ({ label: r, value: done.filter((x) => x.rating === r).length })).filter((d) => d.value > 0),
            unit: "count",
            kpis: [kpi("Completion rate", ratio(done.length, ds.reviews.length, 100), "percent")],
          };
        },
      },
      {
        id: "review-completion",
        title: "Review completion by cycle",
        description: "Completed ÷ total reviews per cycle.",
        metricId: "reviewCompletion",
        formats: CATEGORY,
        requires: ["reviews"],
        build: (ds) => {
          const cycles = [...new Set(ds.reviews.map((r) => r.cycle))].sort();
          return {
            series: cycles.map((c) => {
              const xs = ds.reviews.filter((r) => r.cycle === c);
              return { label: c, value: ratio(xs.filter((r) => r.status === "Complete").length, xs.length, 100).value ?? 0 };
            }),
            unit: "percent",
            kpis: [
              kpi("Completion rate", ratio(ds.reviews.filter((r) => r.status === "Complete").length, ds.reviews.length, 100), "percent"),
            ],
          };
        },
      },
    ],
  },
  {
    id: "hr-function",
    title: "HR function & planning",
    description: "HR staffing, open seats and internal movement.",
    views: [
      {
        id: "fte-by-dept",
        title: "FTE by department",
        description: "Employee FTE at period end.",
        metricId: "hrStaffingRatio",
        formats: PART,
        build: (ds, p) => ({
          series: byValueDesc(
            departments(ds).map((d) => ({ label: d, value: totalFte(ds.people, p.end, { department: d }) })),
          ).filter((d) => d.value > 0),
          unit: "fte",
          kpis: [kpi("HR staff per 100 FTE", hrStaffingRatio(ds.people, p.end, ds.organization.hrDepartment), "ratio")],
        }),
      },
      {
        id: "vacancy-by-dept",
        title: "Vacancy rate by department",
        description: "Open budgeted positions ÷ total budgeted positions.",
        metricId: "vacancyRate",
        formats: CATEGORY,
        requires: ["positions"],
        build: (ds) => {
          const depts = [...new Set(ds.positions.map((x) => x.department))].sort();
          const r = vacancyRate(ds.positions);
          return {
            series: byValueDesc(nonNull(depts.map((d) => ({ label: d, r: vacancyRate(ds.positions, d) })))),
            unit: "percent",
            kpis: [kpi("Vacancy rate", r, "percent", `${r.numerator} open of ${r.denominator} positions`)],
          };
        },
      },
      {
        id: "mobility",
        title: "Promotion & internal mobility",
        description: "Job events ÷ average headcount.",
        metricId: "promotionRate",
        formats: CATEGORY,
        requires: ["jobEvents"],
        build: (ds, p) => {
          const promo = movementRate(ds.people, ds.jobEvents, p, ["Promotion"]);
          const mobility = movementRate(ds.people, ds.jobEvents, p, ["Promotion", "Lateral transfer"]);
          return {
            series: nonNull([
              { label: "Promotion rate", r: promo },
              { label: "Internal mobility rate", r: mobility },
            ]),
            unit: "percent",
            kpis: [kpi("Promotion rate", promo, "percent"), kpi("Internal mobility rate", mobility, "percent")],
          };
        },
      },
    ],
  },
];

export type PeriodKind = "ltm" | "ytd" | "prior-year";
export const PERIOD_LABELS: Record<PeriodKind, string> = {
  ltm: "Last 12 months",
  ytd: "Year to date",
  "prior-year": "Prior calendar year",
};

export function periodFor(kind: PeriodKind, asOf: string): Period {
  const [y, m, d] = asOf.split("-").map(Number);
  if (kind === "ytd") return { start: `${y}-01-01`, end: asOf };
  if (kind === "prior-year") return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
  return { start: addDays(toIso(Date.UTC(y - 1, m - 1, d)), 1), end: asOf };
}

export function resolveAnalyticsSelection(dashboardId?: string, viewId?: string, period?: string) {
  const dashboard = DASHBOARDS.find((item) => item.id === dashboardId) ?? DASHBOARDS[0];
  const view = dashboard.views.find((item) => item.id === viewId) ?? dashboard.views[0];
  const periodKind: PeriodKind =
    period === "ytd" || period === "prior-year" || period === "ltm" ? period : "ltm";
  return { dashboard, view, periodKind };
}

export function findView(dashboardId: string, viewId: string): ViewDefinition | undefined {
  return DASHBOARDS.find((d) => d.id === dashboardId)?.views.find((v) => v.id === viewId);
}
