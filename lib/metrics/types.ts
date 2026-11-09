/** Canonical, source-agnostic workforce dataset that every HR metric is computed from. */

export type WorkerType = "Employee" | "Contingent";

/** BLS JOLTS separation categories. */
export type SeparationCategory = "Quit" | "Layoff/Discharge" | "Other";

export type WorkforcePerson = {
  id: string;
  name: string;
  department: string;
  location: string;
  managerId: string | null;
  workerType: WorkerType;
  /** 1 = full time; 0.5 = half time. */
  fte: number;
  hireDate: string;
  /** Last day on payroll (inclusive); null while employed. */
  terminationDate: string | null;
  separationCategory: SeparationCategory | null;
  regrettable: boolean | null;
  annualSalary: number | null;
  payRangeMin: number | null;
  payRangeMid: number | null;
  payRangeMax: number | null;
};

export type AbsenceRecord = {
  id: string;
  personId: string;
  startDate: string;
  days: number;
  /** Planned absence (approved vacation/holiday) is excluded from absence rate. */
  planned: boolean;
  reason: string;
};

export type JobEventType =
  | "Promotion"
  | "Lateral transfer"
  | "Demotion"
  | "Compensation change"
  | "Title change";

export type JobEvent = {
  id: string;
  personId: string;
  effectiveDate: string;
  type: JobEventType;
};

export type PositionRecord = {
  id: string;
  department: string;
  title: string;
  status: "Filled" | "Open";
};

export type ReviewRecord = {
  id: string;
  personId: string;
  cycle: string;
  status: "Not started" | "In progress" | "Complete";
  rating: "Exceeds" | "Meets" | "Needs improvement" | null;
};

export type PtoRecord = {
  id: string;
  personId: string;
  type: "Vacation" | "Sick" | "Personal" | "Holiday";
  startDate: string;
  days: number;
  status: "Pending" | "Approved" | "Denied";
};

/** Finch pay-statement earning types. */
export type EarningType =
  | "salary"
  | "wage"
  | "reimbursement"
  | "overtime"
  | "severance"
  | "double_overtime"
  | "pto"
  | "sick"
  | "bonus"
  | "commission"
  | "tips"
  | "other";

/** One employee pay statement (read-only payroll data, amounts in dollars). */
export type PayStatementRecord = {
  id: string;
  personId: string;
  payDate: string;
  earnings: { type: EarningType; amount: number; hours: number | null }[];
  employerTaxes: number;
  /** Employer-paid benefit and retirement contributions. */
  employerContributions: number;
};

export type WorkforceDataset = {
  organization: {
    id: string;
    name: string;
    asOfDate: string;
    hrDepartment: string;
    /** Trailing-12-month revenue, for labor-cost-to-revenue and revenue per employee. */
    annualRevenue: number | null;
  };
  payStatements: PayStatementRecord[];
  people: WorkforcePerson[];
  absences: AbsenceRecord[];
  jobEvents: JobEvent[];
  positions: PositionRecord[];
  reviews: ReviewRecord[];
  pto: PtoRecord[];
};

/** Inclusive ISO date range (YYYY-MM-DD). */
export type Period = { start: string; end: string };

/** value is null when the denominator is zero (metric undefined, not 0). */
export type MetricResult = { value: number | null; numerator: number; denominator: number };
