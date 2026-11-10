import {
  benchCoverage,
  benchStrength,
  performanceTrend,
  potentialSegment,
  riskBand,
  roleRiskScore,
  singlePointsOfFailure,
  suggestedProbabilityOfLoss,
  type Level3,
  type Readiness,
} from "@/lib/talent/succession";
import { demoOrganizationId, withFeatureDatabase } from "./common";
import { getActivePeople } from "./org";

type ProfileRow = {
  id: string;
  worker_id: string;
  assessed_on: string;
  aspiration: number;
  ability: number;
  engagement: number;
  flight_risk: "low" | "medium" | "high";
  impact_of_loss: "low" | "medium" | "high";
  retirement_within_2_years: boolean;
  open_to_relocation: boolean | null;
  career_interests: string | null;
  skills: string[];
  notes: string | null;
};

function profileView(profile: ProfileRow) {
  return {
    id: profile.id,
    workerId: profile.worker_id,
    assessedOn: profile.assessed_on,
    aspiration: profile.aspiration as Level3,
    ability: profile.ability as Level3,
    engagement: profile.engagement as Level3,
    potential: potentialSegment({
      aspiration: profile.aspiration as Level3,
      ability: profile.ability as Level3,
      engagement: profile.engagement as Level3,
    }),
    flightRisk: profile.flight_risk,
    impactOfLoss: profile.impact_of_loss,
    retirementWithin2Years: profile.retirement_within_2_years,
    openToRelocation: profile.open_to_relocation,
    careerInterests: profile.career_interests,
    skills: profile.skills,
    notes: profile.notes,
  };
}

export async function getSuccessionDashboard(filters: {
  division?: string;
  department?: string;
} = {}) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const people = await getActivePeople();
    const [rolesResult, candidatesResult, profilesResult, ratingsResult] = await Promise.all([
      pool.query<{
        id: string;
        title: string;
        impact_of_loss: number;
        probability_of_loss: number;
        department_id: string | null;
        department: string | null;
        incumbent_worker_id: string | null;
        incumbent_name: string | null;
      }>(
        `select r.id, r.title, r.impact_of_loss, r.probability_of_loss, r.department_id,
                d.name as department, r.incumbent_worker_id,
                coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as incumbent_name
         from critical_roles r
         left join departments d on d.id = r.department_id
         left join workers w on w.id = r.incumbent_worker_id
         where r.organization_id = $1
         order by r.title`,
        [organizationId],
      ),
      pool.query<{
        critical_role_id: string;
        worker_id: string;
        readiness: Readiness;
        is_emergency_backup: boolean;
        rank: number | null;
        skill_gaps: string[];
      }>(
        `select critical_role_id, worker_id, readiness, is_emergency_backup, rank, skill_gaps
         from succession_candidates where organization_id = $1
         order by critical_role_id, rank nulls last, worker_id`,
        [organizationId],
      ),
      pool.query<ProfileRow & { worker_name: string }>(
        `select distinct on (p.worker_id) p.*,
                coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as worker_name
         from talent_profiles p
         join workers w on w.id = p.worker_id
         where p.organization_id = $1
         order by p.worker_id, p.assessed_on desc, p.id`,
        [organizationId],
      ),
      pool.query<{
        worker_id: string;
        cycle_id: string;
        period_start: string;
        calibrated_rating: string | number;
      }>(
        `select o.worker_id, c.id as cycle_id, c.period_start, o.calibrated_rating
         from review_outcomes o join review_cycles c on c.id = o.cycle_id
         where o.organization_id = $1 and o.calibrated_rating is not null
         order by c.period_start, o.calibrated_rating`,
        [organizationId],
      ),
    ]);

    const divisionByDepartment = new Map<string, string>();
    for (const person of people) {
      if (person.department && person.division) divisionByDepartment.set(person.department, person.division);
    }
    const candidatesByRole = new Map<string, typeof candidatesResult.rows>();
    for (const candidate of candidatesResult.rows) {
      const list = candidatesByRole.get(candidate.critical_role_id) ?? [];
      list.push(candidate);
      candidatesByRole.set(candidate.critical_role_id, list);
    }
    const workerById = new Map(people.map((person) => [person.id, person]));
    const roles = rolesResult.rows
      .filter((role) => {
        if (filters.department && role.department !== filters.department) return false;
        if (filters.division && divisionByDepartment.get(role.department ?? "") !== filters.division) return false;
        return true;
      })
      .map((role) => {
        const bench = benchStrength(
          (candidatesByRole.get(role.id) ?? []).map((candidate) => ({ readiness: candidate.readiness })),
        );
        const riskScore = roleRiskScore(role.impact_of_loss, role.probability_of_loss);
        return {
          id: role.id,
          title: role.title,
          departmentId: role.department_id,
          department: role.department,
          division: divisionByDepartment.get(role.department ?? "") ?? null,
          incumbentId: role.incumbent_worker_id,
          incumbent: role.incumbent_name,
          impactOfLoss: role.impact_of_loss,
          probabilityOfLoss: role.probability_of_loss,
          riskScore,
          riskBand: riskBand(riskScore),
          bench,
          candidates: (candidatesByRole.get(role.id) ?? []).map((candidate) => ({
            workerId: candidate.worker_id,
            name: workerById.get(candidate.worker_id)?.name ?? "Unknown",
            readiness: candidate.readiness,
            isEmergencyBackup: candidate.is_emergency_backup,
            rank: candidate.rank,
            skillGaps: candidate.skill_gaps,
          })),
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore || a.title.localeCompare(b.title));
    const profileByWorker = new Map(profilesResult.rows.map((profile) => [profile.worker_id, profile]));
    const ratingsByWorker = new Map<string, number[]>();
    for (const rating of ratingsResult.rows) {
      const values = ratingsByWorker.get(rating.worker_id) ?? [];
      values.push(Number(rating.calibrated_rating));
      ratingsByWorker.set(rating.worker_id, values);
    }
    const slatesByWorker = new Map<string, { roleId: string; role: string; readiness: Readiness }[]>();
    for (const role of rolesResult.rows) {
      for (const candidate of candidatesByRole.get(role.id) ?? []) {
        const list = slatesByWorker.get(candidate.worker_id) ?? [];
        list.push({ roleId: role.id, role: role.title, readiness: candidate.readiness });
        slatesByWorker.set(candidate.worker_id, list);
      }
    }
    const peopleByFilter = people.filter((person) => {
      if (filters.division && person.division !== filters.division) return false;
      if (filters.department && person.department !== filters.department) return false;
      return true;
    });
    const talentPool = peopleByFilter.flatMap((person) => {
      const profile = profileByWorker.get(person.id);
      if (!profile) return [];
      const history = ratingsByWorker.get(person.id) ?? [];
      return [{
        workerId: person.id,
        name: person.name,
        division: person.division,
        department: person.department,
        profile: profileView(profile),
        performanceRatings: history,
        performanceTrend: performanceTrend(history),
        roles: slatesByWorker.get(person.id) ?? [],
      }];
    });
    const summaries = roles.map((role) => ({
      roleId: role.id,
      riskScore: role.riskScore,
      bench: role.bench,
    }));
    return {
      roles,
      talentPool,
      people,
      divisions: [...new Set(people.map((person) => person.division).filter((value): value is string => Boolean(value)))].sort(),
      departments: [...new Set(people.map((person) => person.department).filter((value): value is string => Boolean(value)))].sort(),
      kpis: {
        benchCoverage: benchCoverage(summaries),
        singlePointsOfFailure: singlePointsOfFailure(summaries).length,
        highPotential: talentPool.filter((person) => person.profile.potential === "High potential").length,
      },
    };
  });
}

export async function getCriticalRoleDetail(roleId: string) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const roleResult = await pool.query<{
      id: string;
      title: string;
      impact_of_loss: number;
      probability_of_loss: number;
      department_id: string | null;
      department: string | null;
      incumbent_worker_id: string | null;
      incumbent_name: string | null;
      required_skills: string[];
      rationale: string | null;
      reviewed_on: string | null;
      flight_risk: "low" | "medium" | "high" | null;
      retirement_within_2_years: boolean | null;
    }>(
      `select r.id, r.title, r.impact_of_loss, r.probability_of_loss, r.department_id,
              d.name as department, r.incumbent_worker_id,
              coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as incumbent_name,
              r.required_skills, r.rationale, r.reviewed_on,
              p.flight_risk, p.retirement_within_2_years
       from critical_roles r
       left join departments d on d.id = r.department_id
       left join workers w on w.id = r.incumbent_worker_id
       left join lateral (
         select flight_risk, retirement_within_2_years
         from talent_profiles where worker_id = r.incumbent_worker_id
         order by assessed_on desc limit 1
       ) p on true
       where r.id = $1 and r.organization_id = $2`,
      [roleId, organizationId],
    );
    const role = roleResult.rows[0];
    if (!role) return null;
    const [people, candidates, actions] = await Promise.all([
      getActivePeople(),
      pool.query<{
        id: string;
        worker_id: string;
        name: string;
        readiness: Readiness;
        is_emergency_backup: boolean;
        rank: number | null;
        skill_gaps: string[];
        notes: string | null;
      }>(
        `select c.id, c.worker_id,
                coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as name,
                c.readiness, c.is_emergency_backup, c.rank, c.skill_gaps, c.notes
         from succession_candidates c join workers w on w.id = c.worker_id
         where c.critical_role_id = $1 and c.organization_id = $2
         order by c.rank nulls last, name`,
        [roleId, organizationId],
      ),
      pool.query<{
        id: string;
        worker_id: string;
        action_type: "experience" | "exposure" | "education";
        title: string;
        due_date: string | null;
        status: string;
      }>(
        `select id, worker_id, action_type, title, due_date, status
         from development_actions
         where critical_role_id = $1 and organization_id = $2
         order by due_date nulls last, created_at`,
        [roleId, organizationId],
      ),
    ]);
    const bench = benchStrength(candidates.rows.map((candidate) => ({ readiness: candidate.readiness })));
    return {
      id: role.id,
      title: role.title,
      departmentId: role.department_id,
      department: role.department,
      incumbentId: role.incumbent_worker_id,
      incumbent: role.incumbent_name,
      impactOfLoss: role.impact_of_loss,
      probabilityOfLoss: role.probability_of_loss,
      riskScore: roleRiskScore(role.impact_of_loss, role.probability_of_loss),
      riskBand: riskBand(roleRiskScore(role.impact_of_loss, role.probability_of_loss)),
      requiredSkills: role.required_skills,
      rationale: role.rationale,
      reviewedOn: role.reviewed_on,
      suggestedProbability: role.flight_risk
        ? suggestedProbabilityOfLoss(role.flight_risk, role.retirement_within_2_years ?? false)
        : null,
      bench,
      candidates: candidates.rows.map((candidate) => ({
        id: candidate.id,
        workerId: candidate.worker_id,
        name: candidate.name,
        readiness: candidate.readiness,
        isEmergencyBackup: candidate.is_emergency_backup,
        rank: candidate.rank,
        skillGaps: candidate.skill_gaps,
        notes: candidate.notes,
        actions: actions.rows
          .filter((action) => action.worker_id === candidate.worker_id)
          .map((action) => ({
            id: action.id,
            type: action.action_type,
            title: action.title,
            dueDate: action.due_date,
            status: action.status,
          })),
      })),
      people,
    };
  });
}

export async function getTalentPersonProfile(workerId: string) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const personResult = await pool.query<{
      id: string;
      name: string;
      employee_number: string | null;
      department: string | null;
      division: string | null;
    }>(
      `select w.id, w.employee_number,
              coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as name,
              d.name as department, div.name as division
       from workers w
       left join lateral (
         select department_id from job_assignments
         where worker_id = w.id and effective_to is null
         order by effective_from desc limit 1
       ) ja on true
       left join departments d on d.id = ja.department_id
       left join lateral (
         with recursive ancestry as (
           select id, parent_id, name, unit_type, 0 as depth
           from departments where id = d.id
           union all
           select p.id, p.parent_id, p.name, p.unit_type, a.depth + 1
           from departments p join ancestry a on p.id = a.parent_id
         )
         select name from ancestry where unit_type = 'division' order by depth limit 1
       ) div on true
       where w.id = $1 and w.organization_id = $2`,
      [workerId, organizationId],
    );
    const person = personResult.rows[0];
    if (!person) return null;
    const [profiles, ratings, roles, actions] = await Promise.all([
      pool.query<ProfileRow>(
        `select id, worker_id, assessed_on, aspiration, ability, engagement, flight_risk,
                impact_of_loss, retirement_within_2_years, open_to_relocation, career_interests,
                skills, notes
         from talent_profiles
         where worker_id = $1 and organization_id = $2
         order by assessed_on desc`,
        [workerId, organizationId],
      ),
      pool.query<{ period_start: string; calibrated_rating: string | number }>(
        `select c.period_start, o.calibrated_rating
         from review_outcomes o join review_cycles c on c.id = o.cycle_id
         where o.worker_id = $1 and o.organization_id = $2 and o.calibrated_rating is not null
         order by c.period_start`,
        [workerId, organizationId],
      ),
      pool.query<{
        role_id: string;
        title: string;
        readiness: Readiness;
        is_emergency_backup: boolean;
      }>(
        `select r.id as role_id, r.title, c.readiness, c.is_emergency_backup
         from succession_candidates c join critical_roles r on r.id = c.critical_role_id
         where c.worker_id = $1 and c.organization_id = $2
         order by r.title`,
        [workerId, organizationId],
      ),
      pool.query<{
        id: string;
        critical_role_id: string | null;
        role_title: string | null;
        action_type: "experience" | "exposure" | "education";
        title: string;
        due_date: string | null;
        status: string;
      }>(
        `select a.id, a.critical_role_id, r.title as role_title, a.action_type, a.title,
                a.due_date, a.status
         from development_actions a
         left join critical_roles r on r.id = a.critical_role_id
         where a.worker_id = $1 and a.organization_id = $2
         order by a.due_date nulls last, a.created_at`,
        [workerId, organizationId],
      ),
    ]);
    const calibratedRatings = ratings.rows.map((row) => Number(row.calibrated_rating));
    return {
      person: {
        id: person.id,
        employeeNumber: person.employee_number,
        name: person.name,
        department: person.department,
        division: person.division,
      },
      profiles: profiles.rows.map(profileView),
      performanceRatings: ratings.rows.map((row) => ({
        periodStart: row.period_start,
        rating: Number(row.calibrated_rating),
      })),
      performanceTrend: performanceTrend(calibratedRatings),
      roles: roles.rows.map((row) => ({
        roleId: row.role_id,
        title: row.title,
        readiness: row.readiness,
        isEmergencyBackup: row.is_emergency_backup,
      })),
      actions: actions.rows.map((action) => ({
        id: action.id,
        roleId: action.critical_role_id,
        role: action.role_title,
        type: action.action_type,
        title: action.title,
        dueDate: action.due_date,
        status: action.status,
      })),
    };
  });
}

export async function updateCriticalRole(input: {
  roleId: string;
  impactOfLoss: number;
  probabilityOfLoss: number;
  rationale: string;
}) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query(
      `update critical_roles
       set impact_of_loss = $3, probability_of_loss = $4, rationale = $5, reviewed_on = current_date
       where id = $1 and organization_id = $2`,
      [input.roleId, organizationId, input.impactOfLoss, input.probabilityOfLoss, input.rationale || null],
    );
    if (!result.rowCount) throw new Error("Critical role not found.");
  });
}

export async function addSuccessionCandidate(input: {
  roleId: string;
  workerId: string;
  readiness: Readiness;
  skillGaps: string[];
  emergencyBackup: boolean;
}) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    await pool.query(
      `insert into succession_candidates
         (organization_id, critical_role_id, worker_id, readiness, skill_gaps, is_emergency_backup, rank)
       values (
         $1, $2, $3, $4, $5, $6,
         (select coalesce(max(rank), 0) + 1 from succession_candidates where critical_role_id = $2)
       )
       on conflict (critical_role_id, worker_id)
       do update set readiness = excluded.readiness, skill_gaps = excluded.skill_gaps,
                     is_emergency_backup = excluded.is_emergency_backup`,
      [organizationId, input.roleId, input.workerId, input.readiness, input.skillGaps, input.emergencyBackup],
    );
  });
}

export async function updateSuccessionCandidate(input: {
  candidateId: string;
  roleId: string;
  readiness: Readiness;
  rank: number | null;
  skillGaps: string[];
  emergencyBackup: boolean;
  notes: string;
}) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query(
      `update succession_candidates
       set readiness = $3, rank = $4, skill_gaps = $5,
           is_emergency_backup = $6, notes = $7
       where id = $1 and critical_role_id = $2 and organization_id = $8`,
      [
        input.candidateId,
        input.roleId,
        input.readiness,
        input.rank,
        input.skillGaps,
        input.emergencyBackup,
        input.notes || null,
        organizationId,
      ],
    );
    if (!result.rowCount) throw new Error("Successor candidate not found.");
  });
}

export async function removeSuccessionCandidate(roleId: string, candidateId: string) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query(
      `delete from succession_candidates
       where id = $1 and critical_role_id = $2 and organization_id = $3`,
      [candidateId, roleId, organizationId],
    );
    if (!result.rowCount) throw new Error("Successor candidate not found.");
  });
}

export async function addDevelopmentAction(input: {
  workerId: string;
  roleId: string | null;
  type: "experience" | "exposure" | "education";
  title: string;
  dueDate: string | null;
}) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    await pool.query(
      `insert into development_actions (organization_id, worker_id, critical_role_id, action_type, title, due_date)
       values ($1, $2, $3, $4, $5, $6)`,
      [organizationId, input.workerId, input.roleId, input.type, input.title.trim(), input.dueDate],
    );
  });
}

export async function saveTalentProfile(input: {
  workerId: string;
  assessedOn: string;
  aspiration: Level3;
  ability: Level3;
  engagement: Level3;
  flightRisk: "low" | "medium" | "high";
  impactOfLoss: "low" | "medium" | "high";
  retirementWithin2Years: boolean;
  openToRelocation: boolean | null;
  careerInterests: string;
  skills: string[];
  notes: string;
}) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    await pool.query(
      `insert into talent_profiles
         (organization_id, worker_id, assessed_on, aspiration, ability, engagement, flight_risk,
          impact_of_loss, retirement_within_2_years, open_to_relocation, career_interests, skills, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (worker_id, assessed_on)
       do update set aspiration = excluded.aspiration, ability = excluded.ability,
                     engagement = excluded.engagement, flight_risk = excluded.flight_risk,
                     impact_of_loss = excluded.impact_of_loss,
                     retirement_within_2_years = excluded.retirement_within_2_years,
                     open_to_relocation = excluded.open_to_relocation,
                     career_interests = excluded.career_interests, skills = excluded.skills,
                     notes = excluded.notes`,
      [
        organizationId,
        input.workerId,
        input.assessedOn,
        input.aspiration,
        input.ability,
        input.engagement,
        input.flightRisk,
        input.impactOfLoss,
        input.retirementWithin2Years,
        input.openToRelocation,
        input.careerInterests || null,
        input.skills,
        input.notes || null,
      ],
    );
  });
}
