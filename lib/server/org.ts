import type { Pool } from "pg";
import { demoOrganizationId, withFeatureDatabase } from "./common";

export type OrganizationPerson = {
  id: string;
  employeeNumber: string | null;
  name: string;
  managerId: string | null;
  departmentId: string | null;
  department: string | null;
  divisionId: string | null;
  division: string | null;
  location: string | null;
  workerType: "employee" | "contractor";
  hireDate: string;
  workEmail: string | null;
};

type DepartmentRow = {
  id: string;
  name: string;
  parent_id: string | null;
  unit_type: "division" | "department" | "team";
};

async function loadActivePeople(pool: Pool): Promise<OrganizationPerson[]> {
  const organizationId = await demoOrganizationId(pool);
  const [departmentResult, peopleResult] = await Promise.all([
    pool.query<DepartmentRow>(
      `select id, name, parent_id, unit_type
       from departments where organization_id = $1`,
      [organizationId],
    ),
    pool.query<{
      id: string;
      employee_number: string | null;
      name: string;
      manager_id: string | null;
      department_id: string | null;
      department: string | null;
      location: string | null;
      worker_type: "employee" | "contractor";
      hire_date: string;
      work_email: string | null;
    }>(
      `select w.id, w.employee_number,
              coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as name,
              ja.manager_worker_id as manager_id, d.id as department_id, d.name as department,
              l.name as location, ja.worker_type, ep.hire_date,
              contact.value as work_email
       from workers w
       join lateral (
         select j.*
         from job_assignments j
         where j.worker_id = w.id
           and j.effective_from <= current_date
           and (j.effective_to is null or j.effective_to >= current_date)
         order by j.effective_from desc
         limit 1
       ) ja on true
       join employment_periods ep on ep.id = ja.employment_period_id
       left join departments d on d.id = ja.department_id
       left join locations l on l.id = ja.location_id
       left join lateral (
         select wc.value
         from worker_contacts wc
         where wc.worker_id = w.id and wc.kind = 'email' and wc.usage = 'work'
         order by wc.is_primary desc, wc.id
         limit 1
       ) contact on true
       where w.organization_id = $1
         and ja.organization_id = $1
         and ja.employment_status = 'active'
         and ep.termination_date is null
       order by name`,
      [organizationId],
    ),
  ]);

  const departments = new Map(departmentResult.rows.map((row) => [row.id, row]));
  return peopleResult.rows.map((person) => {
    let current = person.department_id ? departments.get(person.department_id) : undefined;
    let division: DepartmentRow | undefined;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      if (current.unit_type === "division") {
        division = current;
        break;
      }
      visited.add(current.id);
      current = current.parent_id ? departments.get(current.parent_id) : undefined;
    }
    return {
      id: person.id,
      employeeNumber: person.employee_number,
      name: person.name,
      managerId: person.manager_id,
      departmentId: person.department_id,
      department: person.department,
      divisionId: division?.id ?? null,
      division: division?.name ?? null,
      location: person.location,
      workerType: person.worker_type,
      hireDate: person.hire_date,
      workEmail: person.work_email,
    };
  });
}

export async function getActivePeople(): Promise<OrganizationPerson[]> {
  return withFeatureDatabase(loadActivePeople);
}
