import { basename } from "node:path";
import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { METRICS } from "../lib/metrics/catalog";
import { managerChain } from "../lib/org/hierarchy";
import {
  seedJobTitles,
  seedNonExemptPersonIdsList,
  seedWorkforce,
} from "../lib/seed/workforce";
import type { WorkforcePerson } from "../lib/metrics/types";
import { createPool, loadEnvLocal } from "./env";
import { MANAGER_QUESTION_BANK } from "../lib/surveys/managerQuestions";
import { tenureBand } from "../lib/surveys/results";
import { refreshManagerSurveySnapshots } from "../lib/server/surveys";
import { proposedRating } from "../lib/talent/reviews";
import { seedChangeRequests } from "../lib/seed/changeRequests";

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

    for (const [position, question] of MANAGER_QUESTION_BANK.entries()) {
      await client.query(
        `insert into survey_question_bank (organization_id, category, prompt, active, position)
         values ($1, $2, $3, true, $4)`,
        [organizationId, question.category, question.prompt, position],
      );
    }

    const departmentNames = [
      ...new Set([
        ...people.map((person) => person.department),
        ...seedWorkforce.positions.map((position) => position.department),
      ]),
    ];
    const divisionDepartments: Record<string, string[]> = {
      Revenue: ["Client Services"],
      Operations: ["Operations", "Finance"],
      "People & Technology": ["People", "Technology"],
    };
    const divisionByDepartment = new Map(
      Object.entries(divisionDepartments).flatMap(([division, children]) =>
        children.map((department) => [department, division] as const),
      ),
    );
    const departmentIds = new Map<string, string>();
    const divisionIds = new Map<string, string>();
    for (const division of Object.keys(divisionDepartments)) {
      const result = await client.query<{ id: string }>(
        `insert into departments (organization_id, name, unit_type)
         values ($1, $2, 'division') returning id`,
        [organizationId, division],
      );
      divisionIds.set(division, result.rows[0].id);
    }
    for (const name of departmentNames) {
      const result = await client.query<{ id: string }>(
        `insert into departments (organization_id, name, unit_type, parent_id)
         values ($1, $2, 'department', $3) returning id`,
        [organizationId, name, divisionIds.get(divisionByDepartment.get(name) ?? "") ?? null],
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
    for (const [positionIndex, position] of seedWorkforce.positions.entries()) {
      const result = await client.query<{ id: string }>(
        `insert into positions
          (organization_id, job_profile_id, department_id, budgeted_fte, status, opened_on, position_code)
         values ($1, $2, $3, 1, $4, $5, $6)
         returning id`,
        [
          organizationId,
          profiles.get(position.title),
          departmentIds.get(position.department),
          position.status.toLowerCase(),
          position.status === "Open" ? seedWorkforce.organization.asOfDate : null,
          `P-${1001 + positionIndex}`,
        ],
      );
      positionIds.set(position.id, result.rows[0].id);
    }
    const hrbpPositionId = positionIds.get("position-emp-026")!;
    const vacantPositionId = positionIds.get("position-open-005")!;

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

    const activePeople = people.filter((person) => !person.terminationDate);
    const hierarchyPeople = activePeople.map((person) => ({
      id: person.id,
      name: person.name,
      managerId: person.managerId,
    }));
    const today = seedWorkforce.organization.asOfDate;
    const surveyConfigs = [
      { title: "2026 Manager Effectiveness Survey", status: "closed", opened: "2026-09-15", respondedRatio: 0.85, includeContingent: true },
      { title: "Q4 Manager Pulse", status: "open", opened: "2026-11-03", respondedRatio: 0.5, includeContingent: true },
    ] as const;
    for (const [surveyIndex, config] of surveyConfigs.entries()) {
      const surveyResult = await client.query<{ id: string }>(
        `insert into surveys
           (organization_id, title, description, kind, survey_type, status,
            anonymity_threshold, opens_at, closes_at, include_contingent_workers)
         values ($1, $2, $3, 'custom', 'manager_effectiveness', $4, 5, $5, $6, $7)
         returning id`,
        [
          organizationId,
          config.title,
          "Confidential feedback about manager effectiveness.",
          config.status,
          config.opened,
          config.status === "closed" ? "2026-09-30" : "2026-11-30",
          config.includeContingent,
        ],
      );
      const surveyId = surveyResult.rows[0].id;
      const questions = [];
      for (const [position, question] of MANAGER_QUESTION_BANK.entries()) {
        const result = await client.query<{ id: string }>(
          `insert into survey_questions
             (organization_id, survey_id, position, question_type, prompt, dimension, reverse_scored, required)
           values ($1, $2, $3, 'likert5', $4, $5, false, true) returning id`,
          [organizationId, surveyId, position, question.prompt, question.category],
        );
        questions.push({ id: result.rows[0].id, category: question.category });
      }
      const invitees = activePeople.filter(
        (person) =>
          person.managerId &&
          (config.includeContingent || person.workerType === "Employee"),
      );
      const orderedInvitees = invitees.map((person) => {
        const workerId = workerIds.get(person.id)!;
        const chain = managerChain(person.id, hierarchyPeople).map((id) => workerIds.get(id) ?? id);
        return { person, workerId, chain, inviteToken: randomBytes(24).toString("base64url") };
      });
      const reportCounts = new Map<string, number>();
      const seenByManager = new Map<string, number>();
      for (const invitee of orderedInvitees) {
        const managerId = invitee.person.managerId!;
        reportCounts.set(managerId, (reportCounts.get(managerId) ?? 0) + 1);
      }
      for (const [index, invitee] of orderedInvitees.entries()) {
        const directManagerId = invitee.person.managerId!;
        const managerPosition = seenByManager.get(directManagerId) ?? 0;
        seenByManager.set(directManagerId, managerPosition + 1);
        const managerTarget = Math.round((reportCounts.get(directManagerId) ?? 0) * config.respondedRatio);
        const hasResponded = managerPosition < managerTarget;
        const email = `${invitee.person.id}@example.invalid`;
        const result = await client.query<{ id: string }>(
          `insert into survey_invitations
             (organization_id, survey_id, worker_id, token, division, department, location,
              worker_type, tenure_band, manager_chain, submitted_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
             case when $11 then ($12::date + ($13::int % 12))::timestamptz else null end)
           returning id`,
          [
            organizationId,
            surveyId,
            invitee.workerId,
            invitee.inviteToken,
            divisionByDepartment.get(invitee.person.department) ?? null,
            invitee.person.department,
            invitee.person.location,
            invitee.person.workerType === "Contingent" ? "contractor" : "employee",
            tenureBand(invitee.person.hireDate, today),
            invitee.chain,
            hasResponded,
            config.opened,
            index,
          ],
        );
        const invitationId = result.rows[0].id;
        await client.query(
          `insert into outbox_messages
             (organization_id, to_email, subject, body, link_path, related_table, related_id)
           values ($1,$2,$3,$4,$5,'survey_invitations',$6)`,
          [organizationId, email, config.title, `Please share feedback: /s/${invitee.inviteToken}`, `/s/${invitee.inviteToken}`, invitationId],
        );
        if (!hasResponded) continue;
        const responseDate = config.status === "closed" ? "2026-09-16" : "2026-11-04";
        const response = await client.query<{ id: string }>(
          `insert into survey_responses (organization_id, survey_id, invitation_id, submitted_at)
           values ($1, $2, $3, ($4::date + ($5::int % 10))::timestamptz) returning id`,
          [organizationId, surveyId, invitationId, responseDate, index],
        );
        const managerNumber = Number(invitee.person.managerId!.slice(-3));
        const categoryScores: Record<number, readonly number[]> = {
          1: [5, 4, 4, 4],
          2: [4, 4, 3, 4],
          9: [5, 5, 4, 4],
          10: [3, 3, 4, 3],
          11: [4, 3, 4, 3],
          12: [4, 5, 4, 5],
          51: [2, 2, 3, 1],
          52: [2, 3, 2, 2],
          53: [3, 2, 2, 3],
        };
        const managerCategories = categoryScores[managerNumber] ?? [3, 3, 3, 3];
        const itemOffsets = [-1, 0, 1, 0, 0];
        for (const [questionIndex, question] of questions.entries()) {
          const categoryScore = managerCategories[Math.floor(questionIndex / 5)];
          const itemIndex = questionIndex % 5;
          const offset = categoryScore === 1 || categoryScore === 5
            ? 0
            : itemOffsets[(itemIndex + managerNumber) % itemOffsets.length];
          const value = categoryScore + offset;
          await client.query(
            `insert into survey_answers (response_id, question_id, numeric_value) values ($1,$2,$3)`,
            [response.rows[0].id, question.id, value],
          );
        }
      }
      const managerTokens = new Map<string, string>();
      for (const invitee of orderedInvitees) {
        const managerId = invitee.chain[0];
        if (!managerId || managerTokens.has(managerId)) continue;
        const shareToken = randomBytes(24).toString("base64url");
        const share = await client.query<{ id: string }>(
          `insert into survey_result_shares
             (organization_id, survey_id, recipient_worker_id, recipient_email, scope_sup_org_leader_id, token)
           values ($1,$2,$3,$4,$3,$5) returning id`,
          [organizationId, surveyId, managerId, `${invitee.person.managerId}@example.invalid`, shareToken],
        );
        managerTokens.set(managerId, shareToken);
        await client.query(
          `insert into outbox_messages
             (organization_id, to_email, subject, body, link_path, related_table, related_id)
           values ($1,$2,$3,$4,$5,'survey_result_shares',$6)`,
          [organizationId, `${invitee.person.managerId}@example.invalid`, `${config.title} results`, `View results: /r/${shareToken}`, `/r/${shareToken}`, share.rows[0].id],
        );
      }
      await refreshManagerSurveySnapshots(client, organizationId, surveyId);
    }

    const ratingPoints = [
      { value: 1, label: "Needs improvement", description: "Does not consistently meet expectations." },
      { value: 2, label: "Partially meets", description: "Meets some expectations; development needed." },
      { value: 3, label: "Meets", description: "Consistently meets role expectations." },
      { value: 4, label: "Exceeds", description: "Frequently exceeds role expectations." },
      { value: 5, label: "Exceptional", description: "Consistently delivers exceptional impact." },
    ];
    const scale = await client.query<{ id: string }>(
      "insert into rating_scales (organization_id, name, points) values ($1,$2,$3) returning id",
      [organizationId, "Five-point performance scale", JSON.stringify(ratingPoints)],
    );
    const template = await client.query<{ id: string }>(
      `insert into review_templates
         (organization_id, name, description, rating_scale_id, include_goals, goals_weight)
       values ($1,'Annual review','Balanced competency and goal assessment',$2,true,30) returning id`,
      [organizationId, scale.rows[0].id],
    );
    const templateId = template.rows[0].id;
    const reviewItems: string[] = [];
    for (const [position, title] of [
      "Role expertise", "Quality and delivery", "Collaboration", "Ownership and judgment",
      "Growth and adaptability", "What should this person continue or change?",
    ].entries()) {
      const item = await client.query<{ id: string }>(
        `insert into review_template_items
           (organization_id, template_id, position, item_type, title, description, weight, rated, applies_to)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'{self,manager,peer}') returning id`,
        [organizationId, templateId, position, position === 5 ? "question" : "competency", title,
          position === 5 ? "Share a specific example." : "Reflect on outcomes and behaviors.", position === 5 ? 0 : 20, position !== 5],
      );
      reviewItems.push(item.rows[0].id);
    }
    const oldCycle = await client.query<{ id: string }>(
      `insert into review_cycles
         (organization_id,name,template_id,period_start,period_end,self_due,manager_due,calibration_due,include_self,include_peer,status)
       values ($1,'2025 Annual',$2,'2025-01-01','2025-12-31','2025-12-01','2026-01-15','2026-02-15',true,true,'closed') returning id`,
      [organizationId, templateId],
    );
    const openCycle = await client.query<{ id: string }>(
      `insert into review_cycles
         (organization_id,name,template_id,period_start,period_end,self_due,manager_due,calibration_due,include_self,include_peer,status)
       values ($1,'2026 Annual',$2,'2026-01-01','2026-12-31','2026-11-15','2026-12-15','2027-01-15',true,true,'manager_review') returning id`,
      [organizationId, templateId],
    );
    const goalsByWorker = new Map<string, { weight: number; progressPct: number }[]>();
    for (const [index, person] of activePeople.entries()) {
      const workerId = workerIds.get(person.id)!;
      const goals = [
        { weight: 60, progressPct: 30 + (index % 7) * 10 },
        { weight: 40, progressPct: 20 + (index % 8) * 10 },
      ];
      goalsByWorker.set(workerId, goals);
      for (const [goalIndex, goal] of goals.entries()) {
        await client.query(
          `insert into goals (organization_id,worker_id,cycle_id,title,description,weight,progress_pct,status,due_date)
           values ($1,$2,$3,$4,$5,$6,$7,$8,'2026-12-31')`,
          [organizationId, workerId, openCycle.rows[0].id, `2026 goal ${goalIndex + 1} · ${person.department}`,
            "Deliver a measurable team or role outcome.", goal.weight, goal.progressPct,
            goal.progressPct >= 70 ? "on_track" : "at_risk"],
        );
      }
      for (const [cycleIndex, cycleId] of [oldCycle.rows[0].id, openCycle.rows[0].id].entries()) {
        const reviewerId = person.managerId ? workerIds.get(person.managerId)! : workerId;
        for (const role of ["self", "manager"] as const) {
          const submitted = cycleIndex === 0 || (role === "self" ? index % 7 !== 0 : index % 2 === 0);
          const assignment = await client.query<{ id: string }>(
            `insert into review_assignments
               (organization_id,cycle_id,subject_worker_id,reviewer_worker_id,reviewer_role,status,submitted_at)
             values ($1,$2,$3,$4,$5,$6,case when $6='submitted' then now() else null end) returning id`,
            [organizationId, cycleId, workerId, role === "self" ? workerId : reviewerId, role, submitted ? "submitted" : "in_progress"],
          );
          if (role === "manager") {
            const managerRatings = reviewItems.slice(0, 5).map((_, itemIndex) => {
              const value = 2 + ((index + itemIndex + cycleIndex) % 4);
              return { itemId: reviewItems[itemIndex], rating: value };
            });
            for (const response of managerRatings) {
              await client.query(
                `insert into review_item_responses (assignment_id,template_item_id,rating_value,comment)
                 values ($1,$2,$3,$4)`,
                [assignment.rows[0].id, response.itemId, response.rating, "Example-based feedback."],
              );
            }
            const proposed = proposedRating({
              managerItems: managerRatings.map((item) => ({ weight: 20, rating: item.rating })),
              goals,
              includeGoals: true,
              goalsWeight: 30,
              scaleMin: 1,
              scaleMax: 5,
            });
            await client.query(
              `insert into review_outcomes
                 (organization_id,cycle_id,worker_id,proposed_rating,calibrated_rating,calibration_notes)
               values ($1,$2,$3,$4,$5,$6)`,
              [organizationId, cycleId, workerId, proposed,
                cycleIndex === 0 && proposed !== null ? Math.max(1, Math.min(5, proposed + (index % 6 === 0 ? 0.2 : 0))) : null,
                cycleIndex === 0 && index % 6 === 0 ? "Calibration discussion" : null],
            );
          }
        }
      }
    }

    for (const [index, person] of activePeople.entries()) {
      const workerId = workerIds.get(person.id)!;
      const assessmentCount = index % 9 === 0 ? 2 : 1;
      for (let history = 0; history < assessmentCount; history++) {
        const scores = index % 7 === 0 && history === 0
          ? [3, 3, 3]
          : [
              1 + ((index + history) % 3),
              1 + ((index + 1 + history) % 3),
              1 + ((index + 2) % 3),
            ];
        await client.query(
          `insert into talent_profiles
             (organization_id,worker_id,assessed_on,aspiration,ability,engagement,flight_risk,impact_of_loss,
              retirement_within_2_years,open_to_relocation,career_interests,skills,notes)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [organizationId, workerId, history ? "2025-11-08" : today,
            scores[0], scores[1], scores[2],
            index % 8 === 0 ? "high" : index % 3 === 0 ? "medium" : "low",
            index % 5 === 0 ? "high" : "medium", index % 13 === 0, index % 4 === 0,
            "Leadership, systems, customer outcomes", ["Coaching", "Planning", "Communication"].slice(0, 1 + index % 3),
            history ? "Prior annual talent discussion." : null],
        );
      }
    }
    const roleRows: { id: string; incumbent: string; department: string }[] = [];
    for (const [index, employeeId] of ["emp-001","emp-002","emp-009","emp-010","emp-011","emp-012"].entries()) {
      const person = people.find((row) => row.id === employeeId)!;
      const role = await client.query<{ id: string }>(
        `insert into critical_roles
           (organization_id,title,department_id,incumbent_worker_id,impact_of_loss,probability_of_loss,required_skills,rationale,reviewed_on)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [organizationId, seedJobTitles[employeeId], departmentIds.get(person.department), workerIds.get(employeeId),
          index === 0 ? 5 : 3 + (index % 3), index === 0 ? 5 : 2 + (index % 4), ["Leadership", "Strategy", "Coaching"],
          "Role continuity and knowledge retention.", today],
      );
      roleRows.push({ id: role.rows[0].id, incumbent: employeeId, department: person.department });
    }
    const readyStates = ["ready_now","ready_1_2_years","ready_3_plus_years"];
    for (const [roleIndex, role] of roleRows.entries()) {
      const candidateIndexes = roleIndex === 0 ? [1] : roleIndex === 1 ? [2,3,4] : [roleIndex+1,roleIndex+2];
      for (const [rank, candidateIndex] of candidateIndexes.entries()) {
        const candidate = activePeople[candidateIndex % activePeople.length];
        const readiness = roleIndex === 0 ? "ready_3_plus_years" : readyStates[(rank + roleIndex) % readyStates.length];
        await client.query(
          `insert into succession_candidates
             (organization_id,critical_role_id,worker_id,readiness,is_emergency_backup,rank,skill_gaps,notes)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [organizationId, role.id, workerIds.get(candidate.id),
            readiness, rank === 0 && roleIndex % 2 === 0,
            rank + 1, ["Strategic planning"], "Build experience through a scoped stretch assignment."],
        );
        if (rank === 0) {
          await client.query(
            `insert into development_actions
               (organization_id,worker_id,critical_role_id,action_type,title,due_date,status)
             values ($1,$2,$3,'experience','Lead a cross-functional initiative','2027-03-31','planned')`,
            [organizationId, workerIds.get(candidate.id), role.id],
          );
        }
      }
    }

    const activeManagerIds = new Set(activePeople.flatMap((person) => person.managerId ? [person.managerId] : []));
    let seriesIndex = 0;
    for (const report of activePeople.filter((person) => person.managerId && activeManagerIds.has(person.managerId))) {
      const series = await client.query<{ id: string }>(
        `insert into one_on_one_series
           (organization_id,manager_worker_id,report_worker_id,cadence_days,started_on)
         values ($1,$2,$3,$4,'2026-01-05') returning id`,
        [organizationId, workerIds.get(report.managerId!), workerIds.get(report.id), seriesIndex % 5 === 0 ? 7 : 14],
      );
      const seriesId = series.rows[0].id;
      const cadenceDays = seriesIndex % 5 === 0 ? 7 : 14;
      const latestMeetingDaysAgo = cadenceDays === 7
        ? [3, 9, 21][seriesIndex % 3]
        : [7, 18, 35][seriesIndex % 3];
      for (const [meetingIndex, daysAgo] of [84, 56, latestMeetingDaysAgo].entries()) {
        if (seriesIndex % 4 === 0 && meetingIndex === 2) continue;
        const meetingDate = new Date(`${today}T00:00:00Z`);
        meetingDate.setUTCDate(meetingDate.getUTCDate() - daysAgo);
        const meeting = await client.query<{ id: string }>(
          `insert into one_on_one_meetings
             (organization_id,series_id,meeting_date,status,shared_notes,report_pulse)
           values ($1,$2,$3,'held','Progress, blockers and next steps.',$4) returning id`,
          [organizationId, seriesId, meetingDate.toISOString().slice(0,10), 3 + (seriesIndex % 3)],
        );
        await client.query(
          `insert into one_on_one_agenda_items (organization_id,series_id,meeting_id,added_by,body,discussed)
           values ($1,$2,$3,'manager','Review current priorities',true)`,
          [organizationId, seriesId, meeting.rows[0].id],
        );
      }
      await client.query(
        `insert into one_on_one_agenda_items (organization_id,series_id,added_by,body)
         values ($1,$2,'report','Discuss upcoming goals')`,
        [organizationId, seriesId],
      );
      await client.query(
        `insert into one_on_one_action_items (organization_id,series_id,owner,body,due_date,completed_at)
         values ($1,$2,'report','Share project update',$3,$4)`,
        [organizationId, seriesId, seriesIndex % 3 === 0 ? "2026-10-01" : "2026-12-01",
          seriesIndex % 2 === 0 ? "2026-10-15T12:00:00Z" : null],
      );
      seriesIndex++;
    }

    await seedChangeRequests(client, organizationId, workerIds, {
      hrbpPositionId,
      vacantPositionId,
    });

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
