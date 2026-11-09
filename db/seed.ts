import { basename } from "node:path";
import type { Pool } from "pg";
import { METRICS } from "../lib/metrics/catalog";
import {
  seedJobTitles,
  seedNonExemptPersonIdsList,
  seedWorkforce,
} from "../lib/seed/workforce";
import type { WorkforcePerson } from "../lib/metrics/types";
import { createPool, loadEnvLocal } from "./env";

const cents = (amount: number) => Math.round(amount * 100);

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function managerReason(type: string): string {
  return type === "Promotion" ? "promotion" : "lateral_transfer";
}

function splitName(name: string): { firstName: string; middleName: string | null; lastName: string } {
  const parts = name.split(" ");
  return {
    firstName: parts[0],
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : null,
    lastName: parts.at(-1)!,
  };
}

function dueDate(cycle: string): string {
  if (cycle.startsWith("2025")) return "2025-12-15";
  return cycle.includes("Mid-year") ? "2026-06-30" : "2026-12-15";
}

function isEmployedOn(person: WorkforcePerson, date: string): boolean {
  return person.hireDate <= date && (person.terminationDate === null || person.terminationDate >= date);
}

const separationReasonCodes: Record<string, string> = {
  "emp-006": "better_opportunity",
  "emp-007": "contract_end",
  "emp-008": "personal",
  "emp-015": "compensation",
  "emp-016": "career_change",
  "emp-017": "reduction_in_force",
  "emp-019": "transfer",
  "emp-021": "position_eliminated",
  "emp-022": "reduction_in_force",
  "emp-023": "manager",
};

export async function seedDemo(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from organizations where slug = $1", ["demo"]);

    const organizationResult = await client.query<{ id: string }>(
      `insert into organizations
        (slug, name, annual_revenue_cents, hr_department_name)
       values ($1, $2, $3, $4)
       returning id`,
      [
        "demo",
        seedWorkforce.organization.name,
        cents(seedWorkforce.organization.annualRevenue ?? 0),
        seedWorkforce.organization.hrDepartment,
      ],
    );
    const organizationId = organizationResult.rows[0].id;
    const people = seedWorkforce.people;

    const departmentNames = [
      ...new Set([
        ...people.map((person) => person.department),
        ...seedWorkforce.positions.map((position) => position.department),
      ]),
    ];
    const departmentIds = new Map<string, string>();
    for (const name of departmentNames) {
      const result = await client.query<{ id: string }>(
        "insert into departments (organization_id, name) values ($1, $2) returning id",
        [organizationId, name],
      );
      departmentIds.set(name, result.rows[0].id);
    }

    const locationNames = [...new Set(people.map((person) => person.location))];
    const locationIds = new Map<string, string>();
    for (const name of locationNames) {
      const [city, state] = name === "Remote" ? ["Remote", null] : name.split(/,\s*/);
      const result = await client.query<{ id: string }>(
        `insert into locations (organization_id, name, city, state, is_remote)
         values ($1, $2, $3, $4, $5) returning id`,
        [organizationId, name, city, state ?? null, name === "Remote"],
      );
      locationIds.set(name, result.rows[0].id);
    }

    const managerIds = new Set(people.flatMap((person) => (person.managerId ? [person.managerId] : [])));
    const nonExemptIds = new Set(seedNonExemptPersonIdsList);
    const titleNames = [
      ...new Set([
        ...Object.values(seedJobTitles),
        ...seedWorkforce.positions.map((position) => position.title),
      ]),
    ];
    const profiles = new Map<string, string>();
    for (const title of titleNames) {
      const titlePeople = people.filter((person) => seedJobTitles[person.id] === title);
      const department =
        titlePeople[0]?.department ??
        seedWorkforce.positions.find((position) => position.title === title)?.department ??
        "Operations";
      const result = await client.query<{ id: string }>(
        `insert into job_profiles
          (organization_id, title, job_family, flsa_status, is_people_manager)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [
          organizationId,
          title,
          department,
          titlePeople.some((person) => nonExemptIds.has(person.id)) ? "non_exempt" : "exempt",
          titlePeople.some((person) => managerIds.has(person.id)),
        ],
      );
      profiles.set(title, result.rows[0].id);

      const personWithRange = titlePeople.find(
        (person) =>
          person.payRangeMin !== null &&
          person.payRangeMid !== null &&
          person.payRangeMax !== null,
      );
      const departmentPeople = people.filter(
        (person) =>
          person.department === department &&
          person.payRangeMin !== null &&
          person.payRangeMid !== null &&
          person.payRangeMax !== null,
      );
      const mid = personWithRange?.payRangeMid ?? departmentPeople[0]?.payRangeMid ?? 65000;
      const min = personWithRange?.payRangeMin ?? Math.round(mid * 0.8);
      const max = personWithRange?.payRangeMax ?? Math.round(mid * 1.2);
      await client.query(
        `insert into pay_ranges
          (organization_id, job_profile_id, pay_basis, min_cents, mid_cents, max_cents, effective_from)
         values ($1, $2, 'yearly', $3, $4, $5, $6)`,
        [organizationId, result.rows[0].id, cents(min), cents(mid), cents(max), "2019-01-01"],
      );
    }

    const positionIds = new Map<string, string>();
    for (const position of seedWorkforce.positions) {
      const result = await client.query<{ id: string }>(
        `insert into positions
          (organization_id, job_profile_id, department_id, budgeted_fte, status, opened_on)
         values ($1, $2, $3, 1, $4, $5)
         returning id`,
        [
          organizationId,
          profiles.get(position.title),
          departmentIds.get(position.department),
          position.status.toLowerCase(),
          position.status === "Open" ? seedWorkforce.organization.asOfDate : null,
        ],
      );
      positionIds.set(position.id, result.rows[0].id);
    }

    const workerIds = new Map<string, string>();
    const employmentPeriodIds = new Map<string, string>();
    for (const person of people) {
      const name = splitName(person.name);
      const workerResult = await client.query<{ id: string }>(
        `insert into workers
          (organization_id, employee_number, first_name, middle_name, last_name, original_hire_date, continuous_service_date)
         values ($1, $2, $3, $4, $5, $6, $6)
         returning id`,
        [organizationId, person.id, name.firstName, name.middleName, name.lastName, person.hireDate],
      );
      const workerId = workerResult.rows[0].id;
      workerIds.set(person.id, workerId);

      const periodResult = await client.query<{ id: string }>(
        `insert into employment_periods
          (organization_id, worker_id, hire_date, termination_date)
         values ($1, $2, $3, $4)
         returning id`,
        [organizationId, workerId, person.hireDate, person.terminationDate],
      );
      employmentPeriodIds.set(person.id, periodResult.rows[0].id);

      const amountCents = cents(person.annualSalary ?? 0);
      await client.query(
        `insert into compensation_history
          (organization_id, worker_id, pay_unit, amount_cents, annualized_cents, effective_from, effective_to, change_reason)
         values ($1, $2, 'yearly', $3, $3, $4, $5, 'hire')`,
        [organizationId, workerId, amountCents, person.hireDate, person.terminationDate],
      );
    }

    for (const person of people) {
      const workerId = workerIds.get(person.id)!;
      const managerWorkerId = person.managerId ? workerIds.get(person.managerId) ?? null : null;
      const events = seedWorkforce.jobEvents
        .filter((event) => event.personId === person.id)
        .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
      const assignmentStarts = [
        { effectiveFrom: person.hireDate, changeReason: "hire" },
        ...events.map((event) => ({
          effectiveFrom: event.effectiveDate,
          changeReason: managerReason(event.type),
        })),
      ];
      const title = seedJobTitles[person.id];
      for (let index = 0; index < assignmentStarts.length; index++) {
        const assignment = assignmentStarts[index];
        const nextStart = assignmentStarts[index + 1]?.effectiveFrom;
        const effectiveTo = nextStart ? addDays(nextStart, -1) : person.terminationDate;
        const isLatest = index === assignmentStarts.length - 1;
        const positionId =
          isLatest && isEmployedOn(person, seedWorkforce.organization.asOfDate)
            ? positionIds.get(`position-${person.id}`) ?? null
            : null;
        await client.query(
          `insert into job_assignments
            (organization_id, worker_id, employment_period_id, position_id, job_profile_id,
             title, department_id, location_id, manager_worker_id, worker_type, worker_subtype,
             employment_status, flsa_status, fte, scheduled_weekly_hours, change_reason,
             effective_from, effective_to)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            organizationId,
            workerId,
            employmentPeriodIds.get(person.id),
            positionId,
            profiles.get(title),
            title,
            departmentIds.get(person.department),
            locationIds.get(person.location),
            managerWorkerId,
            person.workerType === "Contingent" ? "contractor" : "employee",
            person.workerType === "Contingent"
              ? "individual_contractor"
              : person.fte < 1
                ? "part_time"
                : "full_time",
            person.terminationDate ? "terminated" : "active",
            nonExemptIds.has(person.id) ? "non_exempt" : "exempt",
            person.fte,
            40 * person.fte,
            assignment.changeReason,
            assignment.effectiveFrom,
            effectiveTo,
          ],
        );
      }
    }

    for (const person of people) {
      if (!person.terminationDate || !person.separationCategory) continue;
      await client.query(
        `insert into separations
          (organization_id, employment_period_id, worker_id, separation_date, category,
           reason_code, regrettable, eligible_for_rehire)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          organizationId,
          employmentPeriodIds.get(person.id),
          workerIds.get(person.id),
          person.terminationDate,
          person.separationCategory === "Quit"
            ? "quit"
            : person.separationCategory === "Layoff/Discharge"
              ? "layoff_discharge"
              : "other",
          separationReasonCodes[person.id] ?? "other",
          person.regrettable,
          person.separationCategory !== "Layoff/Discharge",
        ],
      );
    }

    for (const request of seedWorkforce.pto) {
      const endDate = addDays(request.startDate, Math.max(0, Math.ceil(request.days) - 1));
      await client.query(
        `insert into pto_requests
          (organization_id, worker_id, pto_type, start_date, end_date, days, status)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          organizationId,
          workerIds.get(request.personId),
          request.type.toLowerCase(),
          request.startDate,
          endDate,
          request.days,
          request.status.toLowerCase(),
        ],
      );
    }

    for (const absence of seedWorkforce.absences) {
      await client.query(
        `insert into absences
          (organization_id, worker_id, absence_date, days, planned, reason)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          organizationId,
          workerIds.get(absence.personId),
          absence.startDate,
          absence.days,
          absence.planned,
          absence.reason,
        ],
      );
    }

    for (const review of seedWorkforce.reviews) {
      const status = review.status.toLowerCase().replaceAll(" ", "_");
      await client.query(
        `insert into performance_reviews
          (organization_id, worker_id, cycle, due_date, status, rating, completed_at)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          organizationId,
          workerIds.get(review.personId),
          review.cycle,
          dueDate(review.cycle),
          status,
          review.rating?.toLowerCase().replaceAll(" ", "_") ?? null,
          status === "complete" ? `${dueDate(review.cycle)}T12:00:00Z` : null,
        ],
      );
    }

    const statementsByDate = new Map<string, typeof seedWorkforce.payStatements>();
    for (const statement of seedWorkforce.payStatements) {
      const statements = statementsByDate.get(statement.payDate) ?? [];
      statements.push(statement);
      statementsByDate.set(statement.payDate, statements);
    }
    const payRunIds = new Map<string, string>();
    for (const [payDate, statements] of statementsByDate) {
      const grossCents = statements.reduce(
        (sum, statement) => sum + statement.earnings.reduce((total, earning) => total + cents(earning.amount), 0),
        0,
      );
      const employerTaxesCents = statements.reduce((sum, statement) => sum + cents(statement.employerTaxes), 0);
      const employerContributionsCents = statements.reduce(
        (sum, statement) => sum + cents(statement.employerContributions),
        0,
      );
      const result = await client.query<{ id: string }>(
        `insert into pay_runs
          (organization_id, pay_date, pay_frequency, gross_pay_cents, employer_taxes_cents, company_debit_cents)
         values ($1, $2, 'semi_monthly', $3, $4, $5)
         returning id`,
        [
          organizationId,
          payDate,
          grossCents,
          employerTaxesCents,
          grossCents + employerTaxesCents + employerContributionsCents,
        ],
      );
      payRunIds.set(payDate, result.rows[0].id);
    }

    for (const statement of seedWorkforce.payStatements) {
      const grossCents = statement.earnings.reduce((sum, earning) => sum + cents(earning.amount), 0);
      const totalHours = statement.earnings.reduce((sum, earning) => sum + (earning.hours ?? 0), 0);
      const statementResult = await client.query<{ id: string }>(
        `insert into pay_statements
          (organization_id, pay_run_id, worker_id, statement_type, payment_method, total_hours, gross_pay_cents)
         values ($1, $2, $3, 'regular_payroll', 'direct_deposit', $4, $5)
         returning id`,
        [
          organizationId,
          payRunIds.get(statement.payDate),
          workerIds.get(statement.personId),
          totalHours,
          grossCents,
        ],
      );
      const payStatementId = statementResult.rows[0].id;
      for (const earning of statement.earnings) {
        await client.query(
          `insert into pay_statement_items
            (organization_id, pay_statement_id, item_class, item_type, name, amount_cents, hours, is_employer)
           values ($1, $2, 'earning', $3, $4, $5, $6, false)`,
          [
            organizationId,
            payStatementId,
            earning.type,
            earning.type.replaceAll("_", " "),
            cents(earning.amount),
            earning.hours,
          ],
        );
      }
      if (statement.employerTaxes > 0) {
        await client.query(
          `insert into pay_statement_items
            (organization_id, pay_statement_id, item_class, item_type, name, amount_cents, is_employer)
           values ($1, $2, 'tax', 'employer_taxes', 'Employer taxes', $3, true)`,
          [organizationId, payStatementId, cents(statement.employerTaxes)],
        );
      }
      if (statement.employerContributions > 0) {
        await client.query(
          `insert into pay_statement_items
            (organization_id, pay_statement_id, item_class, item_type, name, amount_cents, is_employer)
           values ($1, $2, 'employer_contribution', 'employer_contributions', 'Employer contributions', $3, true)`,
          [organizationId, payStatementId, cents(statement.employerContributions)],
        );
      }
    }

    for (const metric of Object.values(METRICS)) {
      await client.query(
        `insert into metric_definitions (id, name, formula, definition, sources)
         values ($1, $2, $3, $4, $5)
         on conflict (id) do update
         set name = excluded.name, formula = excluded.formula,
             definition = excluded.definition, sources = excluded.sources`,
        [metric.id, metric.name, metric.formula, metric.definition, metric.sources],
      );
    }

    await client.query("commit");
    console.info(
      `Seeded demo organization: ${people.length} people, ${seedWorkforce.payStatements.length} pay statements`,
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  await loadEnvLocal();
  const pool = createPool();
  try {
    await seedDemo(pool);
  } finally {
    await pool.end();
  }
}

if (basename(process.argv[1] ?? "") === "seed.ts") {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
