import { getPool } from "./db";
import { seedWorkforce } from "./seed/workforce";
import type {
  EarningType,
  WorkforceDataset,
  WorkforcePerson,
} from "./metrics/types";

const dollarAmount = (value: string | number | null): number | null =>
  value === null ? null : Number(value) / 100;
const numeric = (value: string | number | null): number =>
  value === null ? 0 : Number(value);

const separationCategory = (value: string | null): WorkforcePerson["separationCategory"] => {
  if (value === "quit") return "Quit";
  if (value === "layoff_discharge") return "Layoff/Discharge";
  if (value === "other") return "Other";
  return null;
};

const earningTypes = new Set<EarningType>([
  "salary",
  "wage",
  "reimbursement",
  "overtime",
  "severance",
  "double_overtime",
  "pto",
  "sick",
  "bonus",
  "commission",
  "tips",
  "other",
]);

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

async function loadFromPostgres(orgSlug: string): Promise<WorkforceDataset> {
  const pool = getPool();
  const organizationResult = await pool.query<{
    id: string;
    name: string;
    annual_revenue_cents: string | number | null;
    hr_department_name: string;
    as_of_date: string;
  }>(
    `select id, name, annual_revenue_cents, hr_department_name, current_date::text as as_of_date
     from organizations where slug = $1`,
    [orgSlug],
  );
  const organization = organizationResult.rows[0];
  if (!organization) throw new Error(`Organization "${orgSlug}" was not found`);

  const [peopleResult, absencesResult, eventsResult, positionsResult, reviewsResult, ptoResult, payrollResult] =
    await Promise.all([
      pool.query<{
        employee_number: string | null;
        worker_id: string;
        name: string;
        department: string | null;
        location: string | null;
        manager_employee_number: string | null;
        worker_type: "employee" | "contractor";
        fte: string | number;
        hire_date: string;
        termination_date: string | null;
        separation_category: string | null;
        regrettable: boolean | null;
        annualized_cents: string | number | null;
        pay_range_min_cents: string | number | null;
        pay_range_mid_cents: string | number | null;
        pay_range_max_cents: string | number | null;
      }>(
        `select w.employee_number, wv.worker_id, wv.name, wv.department, wv.location,
                manager.employee_number as manager_employee_number, wv.worker_type, wv.fte,
                wv.hire_date, wv.termination_date, wv.separation_category, wv.regrettable,
                wv.annualized_cents, wv.pay_range_min_cents, wv.pay_range_mid_cents,
                wv.pay_range_max_cents
         from workforce_people wv
         join organizations o on o.id = wv.organization_id
         join workers w on w.id = wv.worker_id
         left join workers manager on manager.id = wv.manager_worker_id
         where o.slug = $1
         order by w.employee_number`,
        [orgSlug],
      ),
      pool.query<{
        employee_number: string;
        absence_date: string;
        days: string | number;
        planned: boolean;
        reason: string;
        id: string;
      }>(
        `select w.employee_number, a.id, a.absence_date, a.days, a.planned, a.reason
         from absences a
         join organizations o on o.id = a.organization_id
         join workers w on w.id = a.worker_id
         where o.slug = $1 order by a.absence_date, a.id`,
        [orgSlug],
      ),
      pool.query<{
        employee_number: string;
        effective_from: string;
        change_reason: "promotion" | "lateral_transfer";
      }>(
        `select w.employee_number, ja.effective_from, ja.change_reason
         from job_assignments ja
         join organizations o on o.id = ja.organization_id
         join workers w on w.id = ja.worker_id
         where o.slug = $1 and ja.change_reason in ('promotion', 'lateral_transfer')
         order by ja.effective_from, w.employee_number`,
        [orgSlug],
      ),
      pool.query<{
        id: string;
        department: string;
        title: string;
        status: "filled" | "open";
      }>(
        `select p.id, coalesce(d.name, 'Unassigned') as department,
                coalesce(jp.title, 'Untitled position') as title, p.status
         from positions p
         join organizations o on o.id = p.organization_id
         left join departments d on d.id = p.department_id
         left join job_profiles jp on jp.id = p.job_profile_id
         where o.slug = $1 and p.status in ('filled', 'open')
         order by p.id`,
        [orgSlug],
      ),
      pool.query<{
        id: string;
        employee_number: string;
        cycle: string;
        status: "not_started" | "in_progress" | "complete";
        rating: "exceeds" | "meets" | "needs_improvement" | null;
      }>(
        `select r.id, w.employee_number, r.cycle, r.status, r.rating
         from performance_reviews r
         join organizations o on o.id = r.organization_id
         join workers w on w.id = r.worker_id
         where o.slug = $1 order by r.cycle, r.id`,
        [orgSlug],
      ),
      pool.query<{
        id: string;
        employee_number: string;
        pto_type: string;
        start_date: string;
        days: string | number;
        status: "pending" | "approved" | "denied";
      }>(
        `select p.id, w.employee_number, p.pto_type, p.start_date, p.days, p.status
         from pto_requests p
         join organizations o on o.id = p.organization_id
         join workers w on w.id = p.worker_id
         where o.slug = $1 and p.status <> 'cancelled'
         order by p.start_date, p.id`,
        [orgSlug],
      ),
      pool.query<{
        statement_id: string;
        employee_number: string;
        pay_date: string;
        earnings: { type: string | null; amount_cents: string | number; hours: string | number | null }[];
        employer_taxes_cents: string | number;
        employer_contributions_cents: string | number;
      }>(
        `select ps.id as statement_id, w.employee_number, pr.pay_date,
                coalesce(
                  json_agg(
                    json_build_object(
                      'type', psi.item_type,
                      'amount_cents', psi.amount_cents,
                      'hours', psi.hours
                    ) order by psi.id
                  ) filter (where psi.item_class = 'earning'),
                  '[]'::json
                ) as earnings,
                coalesce(sum(psi.amount_cents) filter (where psi.item_class = 'tax' and psi.is_employer), 0)
                  as employer_taxes_cents,
                coalesce(sum(psi.amount_cents) filter (where psi.item_class = 'employer_contribution'), 0)
                  as employer_contributions_cents
         from pay_statements ps
         join pay_runs pr on pr.id = ps.pay_run_id
         join organizations o on o.id = ps.organization_id
         join workers w on w.id = ps.worker_id
         left join pay_statement_items psi on psi.pay_statement_id = ps.id
         where o.slug = $1
         group by ps.id, w.employee_number, pr.pay_date
         order by pr.pay_date, ps.id`,
        [orgSlug],
      ),
    ]);

  const people: WorkforcePerson[] = peopleResult.rows.map((row) => ({
    id: row.employee_number ?? row.worker_id,
    name: row.name,
    department: row.department ?? "Unassigned",
    location: row.location ?? "Unknown",
    managerId: row.manager_employee_number,
    workerType: row.worker_type === "contractor" ? "Contingent" : "Employee",
    fte: numeric(row.fte),
    hireDate: row.hire_date,
    terminationDate: row.termination_date,
    separationCategory: separationCategory(row.separation_category),
    regrettable: row.regrettable,
    annualSalary: dollarAmount(row.annualized_cents),
    payRangeMin: dollarAmount(row.pay_range_min_cents),
    payRangeMid: dollarAmount(row.pay_range_mid_cents),
    payRangeMax: dollarAmount(row.pay_range_max_cents),
  }));

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      asOfDate:
        orgSlug === "demo" ? seedWorkforce.organization.asOfDate : organization.as_of_date,
      hrDepartment: organization.hr_department_name,
      annualRevenue: dollarAmount(organization.annual_revenue_cents),
    },
    people,
    absences: absencesResult.rows.map((row) => ({
      id: row.id,
      personId: row.employee_number,
      startDate: row.absence_date,
      days: numeric(row.days),
      planned: row.planned,
      reason: row.reason,
    })),
    jobEvents: eventsResult.rows.map((row, index) => ({
      id: `job-event-${index + 1}`,
      personId: row.employee_number,
      effectiveDate: row.effective_from,
      type: row.change_reason === "promotion" ? "Promotion" : "Lateral transfer",
    })),
    positions: positionsResult.rows.map((row) => ({
      id: row.id,
      department: row.department,
      title: row.title,
      status: row.status === "open" ? "Open" : "Filled",
    })),
    reviews: reviewsResult.rows.map((row) => ({
      id: row.id,
      personId: row.employee_number,
      cycle: row.cycle,
      status:
        row.status === "not_started"
          ? "Not started"
          : row.status === "in_progress"
            ? "In progress"
            : "Complete",
      rating:
        row.rating === "needs_improvement"
          ? "Needs improvement"
          : row.rating
            ? titleCase(row.rating) as "Exceeds" | "Meets" | "Needs improvement"
            : null,
    })),
    pto: ptoResult.rows.map((row) => ({
      id: row.id,
      personId: row.employee_number,
      type: titleCase(row.pto_type) as "Vacation" | "Sick" | "Personal" | "Holiday",
      startDate: row.start_date,
      days: numeric(row.days),
      status:
        row.status === "pending" ? "Pending" : row.status === "approved" ? "Approved" : "Denied",
    })),
    payStatements: payrollResult.rows.map((row) => ({
      id: row.statement_id,
      personId: row.employee_number,
      payDate: row.pay_date,
      earnings: row.earnings
        .filter((earning) => earning.type !== null)
        .map((earning) => ({
          type: earningTypes.has(earning.type as EarningType) ? (earning.type as EarningType) : "other",
          amount: numeric(earning.amount_cents) / 100,
          hours: earning.hours === null ? null : numeric(earning.hours),
        })),
      employerTaxes: numeric(row.employer_taxes_cents) / 100,
      employerContributions: numeric(row.employer_contributions_cents) / 100,
    })),
  };
}

const DATASET_CACHE_TTL_MS = 60_000;
const datasetCache = new Map<
  string,
  {
    expiresAt: number;
    value: { dataset: WorkforceDataset; source: "postgres" | "seed" };
  }
>();

export async function getWorkforceDataset(
  orgSlug = "demo",
): Promise<{ dataset: WorkforceDataset; source: "postgres" | "seed" }> {
  const cached = datasetCache.get(orgSlug);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const cache = (value: { dataset: WorkforceDataset; source: "postgres" | "seed" }) => {
    datasetCache.set(orgSlug, { expiresAt: Date.now() + DATASET_CACHE_TTL_MS, value });
    return value;
  };

  if (!process.env.DATABASE_URL) return cache({ dataset: seedWorkforce, source: "seed" });
  try {
    return cache({ dataset: await loadFromPostgres(orgSlug), source: "postgres" });
  } catch (error) {
    console.warn(`Could not load workforce data from Postgres for "${orgSlug}"; using sample data.`, error);
    return cache({ dataset: seedWorkforce, source: "seed" });
  }
}
