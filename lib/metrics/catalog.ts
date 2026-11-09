/** Metric definitions shown in-app next to every chart. Formulas mirror lib/metrics/calc.ts. */

export const SOURCES = {
  "shrm-bask": {
    label: "SHRM Body of Applied Skills and Knowledge (2026)",
    url: "https://www.shrm.org/content/dam/en/shrm/credentials/shrm-certification/bask/shrm-bask.pdf",
  },
  "hrci-phr": {
    label: "HRCI PHR Exam Content Outline",
    url: "https://www.hrci.org/docs/default-source/default-document-library/hrci_phr-exam-content-outline.pdf",
  },
  "bls-jolts": { label: "BLS JOLTS definitions", url: "https://www.bls.gov/jlt/jltdef.htm" },
  "bls-jolts-calc": {
    label: "BLS Handbook of Methods: JOLTS calculation",
    url: "https://www.bls.gov/opub/hom/jlt/calculation.htm",
  },
  "iso-30414": { label: "ISO 30414 Human capital reporting", url: "https://www.iso.org/standard/69338.html" },
  "wiki-turnover": { label: "Turnover (employment), Wikipedia", url: "https://en.wikipedia.org/wiki/Turnover_(employment)" },
  "aihr-metrics": { label: "AIHR: HR metrics examples", url: "https://www.aihr.com/blog/hr-metrics-examples/" },
  "aihr-compa": { label: "AIHR: Compa ratio", url: "https://www.aihr.com/blog/compa-ratio/" },
  "aihr-absence": { label: "AIHR: Absenteeism rate", url: "https://www.aihr.com/blog/absenteeism-rate/" },
  "aihr-dashboard": { label: "AIHR: HR dashboard", url: "https://www.aihr.com/blog/hr-dashboard/" },
  "finch-payroll": { label: "Finch Payroll API (pay statements)", url: "https://developer.tryfinch.com/products/payroll/Overview" },
} as const;

export type SourceId = keyof typeof SOURCES;

export type MetricDefinition = {
  id: string;
  name: string;
  formula: string;
  definition: string;
  sources: SourceId[];
};

export const METRICS: Record<string, MetricDefinition> = {
  headcount: {
    id: "headcount",
    name: "Headcount",
    formula: "Count of employees on payroll on the as-of date",
    definition:
      "Employees (not contingent workers) hired on or before the date whose last day is on or after it. Contingent workers are reported separately, consistent with JOLTS excluding agency/contract workers from employment.",
    sources: ["bls-jolts", "iso-30414", "aihr-dashboard"],
  },
  averageHeadcount: {
    id: "averageHeadcount",
    name: "Average headcount",
    formula: "mean over months of (headcount at month start + headcount at month end) ÷ 2",
    definition: "Denominator for turnover and movement rates. Months are clipped to the selected period.",
    sources: ["wiki-turnover", "bls-jolts-calc"],
  },
  turnoverRate: {
    id: "turnoverRate",
    name: "Turnover rate",
    formula: "separations in period ÷ average headcount × 100",
    definition:
      "Separations are classified with the JOLTS categories: Quit (voluntary), Layoff/Discharge (involuntary), Other (retirement, transfer, death, disability). Rates for partial years are also shown annualized (× 365 ÷ days in period).",
    sources: ["bls-jolts", "bls-jolts-calc", "wiki-turnover", "shrm-bask", "hrci-phr"],
  },
  retentionRate: {
    id: "retentionRate",
    name: "Retention rate",
    formula: "employees at period start still employed at period end ÷ headcount at period start × 100",
    definition: "Cohort measure; new hires during the period are excluded from both numerator and denominator.",
    sources: ["shrm-bask", "iso-30414"],
  },
  newHireTurnover: {
    id: "newHireTurnover",
    name: "New-hire (early) turnover",
    formula: "hires in period who separated in period ÷ hires in period × 100",
    definition: "Signals onboarding and quality-of-hire problems.",
    sources: ["aihr-metrics", "shrm-bask"],
  },
  compaRatio: {
    id: "compaRatio",
    name: "Compa-ratio",
    formula: "salary ÷ pay-range midpoint (group: Σ salaries ÷ Σ midpoints)",
    definition: "1.00 = paid at midpoint. 0.80–1.20 is a commonly used acceptable band.",
    sources: ["shrm-bask", "aihr-compa"],
  },
  rangePenetration: {
    id: "rangePenetration",
    name: "Range penetration",
    formula: "(salary − range minimum) ÷ (range maximum − range minimum) × 100",
    definition: "Position within the pay range: 0% = minimum, 100% = maximum.",
    sources: ["aihr-compa"],
  },
  absenceRate: {
    id: "absenceRate",
    name: "Absence rate",
    formula: "unplanned absence days ÷ scheduled workdays × 100",
    definition: "Scheduled workdays = weekdays employed in the period × FTE. Approved planned leave is excluded.",
    sources: ["aihr-absence", "aihr-metrics", "iso-30414"],
  },
  spanOfControl: {
    id: "spanOfControl",
    name: "Span of control",
    formula: "direct reports of active managers ÷ number of active managers",
    definition: "Includes contingent workers who report to a manager.",
    sources: ["hrci-phr", "iso-30414"],
  },
  averageTenure: {
    id: "averageTenure",
    name: "Average tenure",
    formula: "mean of (as-of date − hire date) in years",
    definition: "Employees on payroll on the as-of date.",
    sources: ["aihr-dashboard"],
  },
  vacancyRate: {
    id: "vacancyRate",
    name: "Vacancy rate",
    formula: "open budgeted positions ÷ total budgeted positions × 100",
    definition: "Workforce-availability measure from position management.",
    sources: ["shrm-bask", "iso-30414"],
  },
  promotionRate: {
    id: "promotionRate",
    name: "Promotion / internal mobility rate",
    formula: "promotions (or promotions + lateral transfers) in period ÷ average headcount × 100",
    definition: "ISO 30414 recruitment, mobility and turnover area.",
    sources: ["iso-30414"],
  },
  hrStaffingRatio: {
    id: "hrStaffingRatio",
    name: "HR staff per 100 FTE",
    formula: "HR department FTE ÷ total employee FTE × 100",
    definition: "SHRM BASK HR-function metric (HR staff per full-time employee).",
    sources: ["shrm-bask", "aihr-metrics"],
  },
  reviewCompletion: {
    id: "reviewCompletion",
    name: "Review completion rate",
    formula: "completed reviews ÷ reviews in cycle × 100",
    definition: "Performance-management process health; rating distribution supports calibration.",
    sources: ["shrm-bask"],
  },
  ptoUsage: {
    id: "ptoUsage",
    name: "Time off taken",
    formula: "Σ approved time-off days in period, by type",
    definition: "Part-to-whole view of approved leave.",
    sources: ["aihr-dashboard"],
  },
  laborCost: {
    id: "laborCost",
    name: "Total labor cost",
    formula: "Σ earnings (excl. reimbursements) + employer taxes + employer contributions, by pay date",
    definition: "Read-only payroll data from Finch pay statements; ISO 30414 costs area. Cash basis by pay date.",
    sources: ["finch-payroll", "iso-30414"],
  },
  laborCostPerEmployee: {
    id: "laborCostPerEmployee",
    name: "Labor cost per employee (annualized)",
    formula: "labor cost ÷ average headcount × 365 ÷ days in period",
    definition: "Fully loaded cost of the average employee.",
    sources: ["iso-30414", "aihr-metrics"],
  },
  laborCostToRevenue: {
    id: "laborCostToRevenue",
    name: "Labor cost to revenue",
    formula: "annualized labor cost ÷ annual revenue × 100",
    definition: "Share of revenue consumed by people cost; requires the organization's annual revenue.",
    sources: ["iso-30414"],
  },
  revenuePerEmployee: {
    id: "revenuePerEmployee",
    name: "Revenue per employee",
    formula: "annual revenue ÷ average headcount",
    definition: "ISO 30414 productivity measure.",
    sources: ["aihr-metrics", "iso-30414"],
  },
  overtimeShare: {
    id: "overtimeShare",
    name: "Overtime share of earnings",
    formula: "(overtime + double overtime earnings) ÷ earnings excl. reimbursements × 100",
    definition: "Capacity and FLSA-exposure signal.",
    sources: ["finch-payroll"],
  },
  burdenRate: {
    id: "burdenRate",
    name: "Employer burden rate",
    formula: "(employer taxes + employer contributions) ÷ wages × 100",
    definition: "Cost on top of wages.",
    sources: ["finch-payroll", "aihr-metrics"],
  },
};
