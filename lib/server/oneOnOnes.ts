import { actionItemStatus, oneOnOneHealth } from "@/lib/talent/oneOnOnes";
import { supOrgMembers, supOrgs } from "@/lib/org/hierarchy";
import { demoOrganizationId, today, withFeatureDatabase } from "./common";
import { getActivePeople } from "./org";

export async function getOneOnOneDashboard(filters: {
  managerId?: string;
  supOrgLeaderId?: string;
} = {}) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const [people, seriesResult] = await Promise.all([
      getActivePeople(),
      pool.query<{
        id: string;
        manager_worker_id: string;
        manager_name: string;
        report_worker_id: string;
        report_name: string;
        cadence_days: number;
        started_on: string;
      }>(
        `select s.id, s.manager_worker_id,
                coalesce(m.preferred_name, m.first_name) || ' ' || m.last_name as manager_name,
                s.report_worker_id,
                coalesce(r.preferred_name, r.first_name) || ' ' || r.last_name as report_name,
                s.cadence_days, s.started_on
         from one_on_one_series s
         join workers m on m.id = s.manager_worker_id
         join workers r on r.id = s.report_worker_id
         where s.organization_id = $1 and s.active
         order by manager_name, report_name`,
        [organizationId],
      ),
    ]);
    const ids = seriesResult.rows.map((row) => row.id);
    const [meetings, actions] = ids.length
      ? await Promise.all([
          pool.query<{ series_id: string; meeting_date: string }>(
            `select series_id, meeting_date from one_on_one_meetings
             where series_id = any($1::uuid[]) and status = 'held'
             order by meeting_date`,
            [ids],
          ),
          pool.query<{
            series_id: string;
            due_date: string | null;
            completed_at: string | null;
          }>(
            `select series_id, due_date, completed_at
             from one_on_one_action_items
             where series_id = any($1::uuid[])`,
            [ids],
          ),
        ])
      : [{ rows: [] as { series_id: string; meeting_date: string }[] }, { rows: [] as { series_id: string; due_date: string | null; completed_at: string | null }[] }];
    const heldBySeries = new Map<string, string[]>();
    for (const meeting of meetings.rows) {
      const held = heldBySeries.get(meeting.series_id) ?? [];
      held.push(meeting.meeting_date);
      heldBySeries.set(meeting.series_id, held);
    }
    const actionsBySeries = new Map<string, typeof actions.rows>();
    for (const action of actions.rows) {
      const list = actionsBySeries.get(action.series_id) ?? [];
      list.push(action);
      actionsBySeries.set(action.series_id, list);
    }
    const activePeople = people.map((person) => ({
      id: person.id,
      name: person.name,
      managerId: person.managerId,
    }));
    const allowedMembers = filters.supOrgLeaderId
      ? new Set([
          filters.supOrgLeaderId,
          ...supOrgMembers(filters.supOrgLeaderId, activePeople),
        ])
      : null;
    const selected = seriesResult.rows.filter((row) => {
      if (filters.managerId && row.manager_worker_id !== filters.managerId) return false;
      if (allowedMembers && !allowedMembers.has(row.report_worker_id)) return false;
      return true;
    });
    const asOf = today();
    const series = selected.map((row) => {
      const health = oneOnOneHealth(
        { cadenceDays: row.cadence_days, startedOn: row.started_on },
        heldBySeries.get(row.id) ?? [],
        asOf,
      );
      const statuses = (actionsBySeries.get(row.id) ?? []).map((action) =>
        actionItemStatus({ dueDate: action.due_date, completedAt: action.completed_at }, asOf),
      );
      return {
        id: row.id,
        managerId: row.manager_worker_id,
        managerName: row.manager_name,
        reportId: row.report_worker_id,
        reportName: row.report_name,
        cadenceDays: row.cadence_days,
        startedOn: row.started_on,
        health,
        openItems: statuses.filter((status) => status !== "Done").length,
        overdueItems: statuses.filter((status) => status === "Overdue").length,
      };
    });
    const onTrack = series.filter((row) => row.health.status === "On track").length;
    return {
      asOf,
      series,
      people,
      supOrgs: supOrgs(activePeople),
      kpis: {
        onTrackPct: series.length ? (onTrack / series.length) * 100 : null,
        overdue: series.filter((row) => row.health.status === "Overdue").length,
        openActions: series.reduce((sum, row) => sum + row.openItems, 0),
        overdueActions: series.reduce((sum, row) => sum + row.overdueItems, 0),
      },
    };
  });
}

export async function getOneOnOneSeries(seriesId: string) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const seriesResult = await pool.query<{
      id: string;
      manager_worker_id: string;
      manager_name: string;
      report_worker_id: string;
      report_name: string;
      cadence_days: number;
      started_on: string;
      manager_id: string | null;
    }>(
      `select s.id, s.manager_worker_id,
              coalesce(m.preferred_name, m.first_name) || ' ' || m.last_name as manager_name,
              s.report_worker_id,
              coalesce(r.preferred_name, r.first_name) || ' ' || r.last_name as report_name,
              s.cadence_days, s.started_on, current_assignment.manager_worker_id as manager_id
       from one_on_one_series s
       join workers m on m.id = s.manager_worker_id
       join workers r on r.id = s.report_worker_id
       left join lateral (
         select manager_worker_id from job_assignments
         where worker_id = r.id and effective_to is null
         order by effective_from desc limit 1
       ) current_assignment on true
       where s.id = $1 and s.organization_id = $2`,
      [seriesId, organizationId],
    );
    const row = seriesResult.rows[0];
    if (!row) return null;
    const [meetings, agenda, actions] = await Promise.all([
      pool.query<{
        id: string;
        meeting_date: string;
        status: string;
        shared_notes: string | null;
        manager_private_notes: string | null;
        report_private_notes: string | null;
        report_pulse: number | null;
      }>(
        `select id, meeting_date, status, shared_notes, manager_private_notes,
                report_private_notes, report_pulse
         from one_on_one_meetings
         where series_id = $1 and organization_id = $2
         order by meeting_date desc`,
        [seriesId, organizationId],
      ),
      pool.query<{
        id: string;
        added_by: "manager" | "report";
        body: string;
        discussed: boolean;
        created_at: string;
      }>(
        `select id, added_by, body, discussed, created_at
         from one_on_one_agenda_items
         where series_id = $1 and organization_id = $2 and meeting_id is null
         order by created_at`,
        [seriesId, organizationId],
      ),
      pool.query<{
        id: string;
        owner: "manager" | "report";
        body: string;
        due_date: string | null;
        completed_at: string | null;
      }>(
        `select id, owner, body, due_date, completed_at
         from one_on_one_action_items
         where series_id = $1 and organization_id = $2
         order by completed_at nulls first, due_date nulls last, created_at`,
        [seriesId, organizationId],
      ),
    ]);
    const asOf = today();
    const heldDates = meetings.rows
      .filter((meeting) => meeting.status === "held")
      .map((meeting) => meeting.meeting_date);
    return {
      id: row.id,
      managerId: row.manager_worker_id,
      managerName: row.manager_name,
      reportId: row.report_worker_id,
      reportName: row.report_name,
      cadenceDays: row.cadence_days,
      startedOn: row.started_on,
      health: oneOnOneHealth(
        { cadenceDays: row.cadence_days, startedOn: row.started_on },
        heldDates,
        asOf,
      ),
      agenda: agenda.rows,
      actions: actions.rows.map((action) => ({
        ...action,
        status: actionItemStatus({ dueDate: action.due_date, completedAt: action.completed_at }, asOf),
      })),
      meetings: meetings.rows,
    };
  });
}

export async function createOneOnOneSeries(input: {
  managerId: string;
  reportId: string;
  cadenceDays: number;
  startedOn: string;
}) {
  const people = await getActivePeople();
  const report = people.find((person) => person.id === input.reportId);
  if (!people.some((person) => person.id === input.managerId) || report?.managerId !== input.managerId) {
    throw new Error("Choose an active manager and one of their direct reports.");
  }
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query<{ id: string }>(
      `insert into one_on_one_series
         (organization_id, manager_worker_id, report_worker_id, cadence_days, started_on)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [organizationId, input.managerId, input.reportId, input.cadenceDays, input.startedOn],
    );
    return result.rows[0].id;
  });
}

export async function addOneOnOneAgendaItem(input: {
  seriesId: string;
  addedBy: "manager" | "report";
  body: string;
}) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query<{ id: string }>(
      `insert into one_on_one_agenda_items (organization_id, series_id, added_by, body)
       select $1, s.id, $3, $4 from one_on_one_series s
       where s.id = $2 and s.organization_id = $1
       returning id`,
      [organizationId, input.seriesId, input.addedBy, input.body.trim()],
    );
    if (!result.rowCount) throw new Error("1:1 series not found.");
  });
}

export async function setAgendaDiscussed(input: { seriesId: string; itemId: string; discussed: boolean }) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query(
      `update one_on_one_agenda_items set discussed = $3
       where id = $1 and series_id = $2 and organization_id = $4 and meeting_id is null`,
      [input.itemId, input.seriesId, input.discussed, organizationId],
    );
    if (!result.rowCount) throw new Error("Queued agenda item not found.");
  });
}

export async function addOneOnOneAction(input: {
  seriesId: string;
  owner: "manager" | "report";
  body: string;
  dueDate: string | null;
}) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query(
      `insert into one_on_one_action_items (organization_id, series_id, owner, body, due_date)
       select $1, s.id, $3, $4, $5 from one_on_one_series s
       where s.id = $2 and s.organization_id = $1`,
      [organizationId, input.seriesId, input.owner, input.body.trim(), input.dueDate],
    );
    if (!result.rowCount) throw new Error("1:1 series not found.");
  });
}

export async function setOneOnOneActionCompleted(input: {
  seriesId: string;
  itemId: string;
  completed: boolean;
}) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query(
      `update one_on_one_action_items set completed_at = case when $3 then now() else null end
       where id = $1 and series_id = $2 and organization_id = $4`,
      [input.itemId, input.seriesId, input.completed, organizationId],
    );
    if (!result.rowCount) throw new Error("Action item not found.");
  });
}

export async function logOneOnOneMeeting(input: {
  seriesId: string;
  meetingDate: string;
  sharedNotes: string;
  managerPrivateNotes: string;
  reportPrivateNotes: string;
  reportPulse: number | null;
}) {
  return withFeatureDatabase(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const organizationId = await demoOrganizationId(pool);
      const result = await client.query<{ id: string }>(
        `insert into one_on_one_meetings
           (organization_id, series_id, meeting_date, status, shared_notes,
            manager_private_notes, report_private_notes, report_pulse)
         select $1, s.id, $3, 'held', $4, $5, $6, $7
         from one_on_one_series s
         where s.id = $2 and s.organization_id = $1
         returning id`,
        [
          organizationId,
          input.seriesId,
          input.meetingDate,
          input.sharedNotes || null,
          input.managerPrivateNotes || null,
          input.reportPrivateNotes || null,
          input.reportPulse,
        ],
      );
      const meetingId = result.rows[0]?.id;
      if (!meetingId) throw new Error("1:1 series not found.");
      await client.query(
        `update one_on_one_agenda_items
         set meeting_id = $2
         where series_id = $1 and organization_id = $3 and meeting_id is null`,
        [input.seriesId, meetingId, organizationId],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
}
