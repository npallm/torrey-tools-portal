import type { PoolClient } from "pg";
import { calibrationShift, proposedRating, ratingDistribution, selfManagerGap, weightedScore } from "@/lib/talent/reviews";
import { demoOrganizationId, withFeatureDatabase } from "./common";

export type RatingPoint = { value: number; label: string; description: string };
export type ReviewRole = "self" | "manager" | "peer" | "upward";
export type ReviewStatus = "not_started" | "in_progress" | "submitted";

export type ReviewTemplateItem = {
  id: string;
  position: number;
  itemType: "competency" | "question";
  title: string;
  description: string | null;
  weight: number;
  rated: boolean;
  appliesTo: ReviewRole[];
};

export type ReviewTemplate = {
  id: string;
  name: string;
  description: string | null;
  includeGoals: boolean;
  goalsWeight: number;
  scaleId: string;
  scaleName: string;
  ratingPoints: RatingPoint[];
  items: ReviewTemplateItem[];
};

const num = (value: string | number | null): number | null =>
  value === null ? null : Number(value);

const roleStatuses = ["self", "manager", "peer"] as const;

export async function getReviewCycles() {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query<{
      id: string;
      name: string;
      status: string;
      period_start: string;
      period_end: string;
      self_due: string | null;
      manager_due: string | null;
      calibration_due: string | null;
      template_id: string;
      template_name: string;
      self_total: string | number;
      self_submitted: string | number;
      manager_total: string | number;
      manager_submitted: string | number;
      peer_total: string | number;
      peer_submitted: string | number;
    }>(
      `select c.id, c.name, c.status, c.period_start, c.period_end, c.self_due,
              c.manager_due, c.calibration_due, c.template_id, t.name as template_name,
              count(a.id) filter (where a.reviewer_role = 'self') as self_total,
              count(a.id) filter (where a.reviewer_role = 'self' and a.status = 'submitted') as self_submitted,
              count(a.id) filter (where a.reviewer_role = 'manager') as manager_total,
              count(a.id) filter (where a.reviewer_role = 'manager' and a.status = 'submitted') as manager_submitted,
              count(a.id) filter (where a.reviewer_role = 'peer') as peer_total,
              count(a.id) filter (where a.reviewer_role = 'peer' and a.status = 'submitted') as peer_submitted
       from review_cycles c
       join review_templates t on t.id = c.template_id
       left join review_assignments a on a.cycle_id = c.id
       where c.organization_id = $1
       group by c.id, t.name
       order by c.period_start desc, c.name`,
      [organizationId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      selfDue: row.self_due,
      managerDue: row.manager_due,
      calibrationDue: row.calibration_due,
      templateId: row.template_id,
      templateName: row.template_name,
      roles: {
        self: { submitted: Number(row.self_submitted), total: Number(row.self_total) },
        manager: { submitted: Number(row.manager_submitted), total: Number(row.manager_total) },
        peer: { submitted: Number(row.peer_submitted), total: Number(row.peer_total) },
      },
    }));
  });
}

export async function getReviewTemplates(): Promise<ReviewTemplate[]> {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const templates = await pool.query<{
      id: string;
      name: string;
      description: string | null;
      include_goals: boolean;
      goals_weight: string | number;
      scale_id: string;
      scale_name: string;
      points: RatingPoint[];
    }>(
      `select t.id, t.name, t.description, t.include_goals, t.goals_weight,
              s.id as scale_id, s.name as scale_name, s.points
       from review_templates t
       join rating_scales s on s.id = t.rating_scale_id
       where t.organization_id = $1
       order by t.name`,
      [organizationId],
    );
    if (!templates.rows.length) return [];
    const items = await pool.query<{
      id: string;
      template_id: string;
      position: number;
      item_type: "competency" | "question";
      title: string;
      description: string | null;
      weight: string | number;
      rated: boolean;
      applies_to: ReviewRole[];
    }>(
      `select id, template_id, position, item_type, title, description, weight, rated, applies_to
       from review_template_items
       where template_id = any($1::uuid[])
       order by template_id, position`,
      [templates.rows.map((template) => template.id)],
    );
    const byTemplate = new Map<string, ReviewTemplateItem[]>();
    for (const item of items.rows) {
      const list = byTemplate.get(item.template_id) ?? [];
      list.push({
        id: item.id,
        position: item.position,
        itemType: item.item_type,
        title: item.title,
        description: item.description,
        weight: Number(item.weight),
        rated: item.rated,
        appliesTo: item.applies_to,
      });
      byTemplate.set(item.template_id, list);
    }
    return templates.rows.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      includeGoals: template.include_goals,
      goalsWeight: Number(template.goals_weight),
      scaleId: template.scale_id,
      scaleName: template.scale_name,
      ratingPoints: template.points,
      items: byTemplate.get(template.id) ?? [],
    }));
  });
}

export async function saveReviewTemplate(input: {
  id?: string;
  name: string;
  description: string;
  scaleId?: string;
  scaleName: string;
  ratingPoints: RatingPoint[];
  includeGoals: boolean;
  goalsWeight: number;
  items: (Omit<ReviewTemplateItem, "id"> & { id?: string })[];
}) {
  return withFeatureDatabase(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const organizationId = await demoOrganizationId(client);
      let scaleId = input.scaleId;
      if (scaleId) {
        const updatedScale = await client.query(
          `update rating_scales set name = $3, points = $4
           where id = $1 and organization_id = $2`,
          [scaleId, organizationId, input.scaleName, input.ratingPoints],
        );
        if (!updatedScale.rowCount) throw new Error("Rating scale not found.");
      } else {
        const scaleResult = await client.query<{ id: string }>(
          `insert into rating_scales (organization_id, name, points)
           values ($1, $2, $3) returning id`,
          [organizationId, input.scaleName, input.ratingPoints],
        );
        scaleId = scaleResult.rows[0].id;
      }

      let templateId = input.id;
      if (templateId) {
        const updatedTemplate = await client.query(
          `update review_templates
           set name = $3, description = $4, rating_scale_id = $5,
               include_goals = $6, goals_weight = $7
           where id = $1 and organization_id = $2`,
          [
            templateId,
            organizationId,
            input.name,
            input.description || null,
            scaleId,
            input.includeGoals,
            input.goalsWeight,
          ],
        );
        if (!updatedTemplate.rowCount) throw new Error("Review template not found.");
      } else {
        const templateResult = await client.query<{ id: string }>(
          `insert into review_templates
             (organization_id, name, description, rating_scale_id, include_goals, goals_weight)
           values ($1, $2, $3, $4, $5, $6)
           returning id`,
          [
            organizationId,
            input.name,
            input.description || null,
            scaleId,
            input.includeGoals,
            input.goalsWeight,
          ],
        );
        templateId = templateResult.rows[0].id;
      }

      const currentItems = await client.query<{ id: string; has_responses: boolean }>(
        `select i.id, exists (
           select 1 from review_item_responses r where r.template_item_id = i.id
         ) as has_responses
         from review_template_items i where i.template_id = $1`,
        [templateId],
      );
      await client.query(
        "update review_template_items set position = -position - 1 where template_id = $1",
        [templateId],
      );
      const retained = new Set<string>();
      for (const [position, item] of input.items.entries()) {
        if (item.id) {
          const updated = await client.query(
            `update review_template_items
             set position = $3, item_type = $4, title = $5, description = $6,
                 weight = $7, rated = $8, applies_to = $9
             where id = $1 and template_id = $2`,
            [
              item.id,
              templateId,
              position,
              item.itemType,
              item.title,
              item.description || null,
              item.weight,
              item.rated,
              item.appliesTo,
            ],
          );
          if (!updated.rowCount) throw new Error("Review template item not found.");
          retained.add(item.id);
        } else {
          await client.query(
            `insert into review_template_items
               (organization_id, template_id, position, item_type, title, description, weight, rated, applies_to)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              organizationId,
              templateId,
              position,
              item.itemType,
              item.title,
              item.description || null,
              item.weight,
              item.rated,
              item.appliesTo,
            ],
          );
        }
      }
      for (const current of currentItems.rows) {
        if (retained.has(current.id)) continue;
        if (current.has_responses) {
          await client.query(
            `update review_template_items
             set position = 30000 + abs(position), applies_to = '{}', rated = false
             where id = $1`,
            [current.id],
          );
        } else {
          await client.query("delete from review_template_items where id = $1", [current.id]);
        }
      }
      await client.query("commit");
      return templateId;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function getReviewCycleDetail(cycleId: string) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const cycleResult = await pool.query<{
      id: string;
      name: string;
      status: string;
      period_start: string;
      period_end: string;
      self_due: string | null;
      manager_due: string | null;
      calibration_due: string | null;
      template_id: string;
      template_name: string;
      points: RatingPoint[];
    }>(
      `select c.id, c.name, c.status, c.period_start, c.period_end,
              c.self_due, c.manager_due, c.calibration_due, c.template_id,
              t.name as template_name, s.points
       from review_cycles c
       join review_templates t on t.id = c.template_id
       join rating_scales s on s.id = t.rating_scale_id
       where c.id = $1 and c.organization_id = $2`,
      [cycleId, organizationId],
    );
    const cycle = cycleResult.rows[0];
    if (!cycle) return null;

    const [assignments, goals, outcomes] = await Promise.all([
      pool.query<{
        id: string;
        subject_worker_id: string;
        subject_name: string;
        reviewer_worker_id: string;
        reviewer_name: string;
        reviewer_role: ReviewRole;
        status: ReviewStatus;
        submitted_at: string | null;
        department: string | null;
      }>(
        `select a.id, a.subject_worker_id,
                coalesce(sw.preferred_name, sw.first_name) || ' ' || sw.last_name as subject_name,
                a.reviewer_worker_id,
                coalesce(rw.preferred_name, rw.first_name) || ' ' || rw.last_name as reviewer_name,
                a.reviewer_role, a.status, a.submitted_at, d.name as department
         from review_assignments a
         join workers sw on sw.id = a.subject_worker_id
         join workers rw on rw.id = a.reviewer_worker_id
         left join lateral (
           select j.department_id from job_assignments j
           where j.worker_id = sw.id and j.effective_to is null
           order by j.effective_from desc limit 1
         ) current_assignment on true
         left join departments d on d.id = current_assignment.department_id
         where a.cycle_id = $1 and a.organization_id = $2
         order by subject_name, a.reviewer_role`,
        [cycleId, organizationId],
      ),
      pool.query<{
        id: string;
        worker_id: string;
        worker_name: string;
        title: string;
        progress_pct: string | number;
        status: string;
        weight: string | number;
        due_date: string | null;
      }>(
        `select g.id, g.worker_id,
                coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as worker_name,
                g.title, g.progress_pct, g.status, g.weight, g.due_date
         from goals g join workers w on w.id = g.worker_id
         where g.cycle_id = $1 and g.organization_id = $2
         order by worker_name, g.title`,
        [cycleId, organizationId],
      ),
      pool.query<{
        id: string;
        worker_id: string;
        worker_name: string;
        proposed_rating: string | number | null;
        calibrated_rating: string | number | null;
        calibration_notes: string | null;
      }>(
        `select o.id, o.worker_id,
                coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as worker_name,
                o.proposed_rating, o.calibrated_rating, o.calibration_notes
         from review_outcomes o join workers w on w.id = o.worker_id
         where o.cycle_id = $1 and o.organization_id = $2
         order by worker_name`,
        [cycleId, organizationId],
      ),
    ]);

    const outcomeValues = outcomes.rows.map((row) => ({
      id: row.id,
      workerId: row.worker_id,
      workerName: row.worker_name,
      proposed: num(row.proposed_rating),
      calibrated: num(row.calibrated_rating),
      notes: row.calibration_notes,
    }));
    const ratingPoints = cycle.points;
    const points = ratingPoints.map((point) => Number(point.value));
    const proposedRatings = outcomeValues.flatMap((outcome) => outcome.proposed === null ? [] : [outcome.proposed]);
    const calibratedRatings = outcomeValues.flatMap((outcome) => outcome.calibrated === null ? [] : [outcome.calibrated]);
    return {
      cycle: {
        id: cycle.id,
        name: cycle.name,
        status: cycle.status,
        periodStart: cycle.period_start,
        periodEnd: cycle.period_end,
        selfDue: cycle.self_due,
        managerDue: cycle.manager_due,
        calibrationDue: cycle.calibration_due,
        templateId: cycle.template_id,
        templateName: cycle.template_name,
        ratingPoints,
      },
      assignments: assignments.rows.map((row) => ({
        id: row.id,
        subjectWorkerId: row.subject_worker_id,
        subjectName: row.subject_name,
        reviewerWorkerId: row.reviewer_worker_id,
        reviewerName: row.reviewer_name,
        role: row.reviewer_role,
        status: row.status,
        submittedAt: row.submitted_at,
        department: row.department,
      })),
      goals: goals.rows.map((row) => ({
        id: row.id,
        workerId: row.worker_id,
        workerName: row.worker_name,
        title: row.title,
        progressPct: Number(row.progress_pct),
        status: row.status,
        weight: Number(row.weight),
        dueDate: row.due_date,
      })),
      outcomes: outcomeValues,
      calibration: {
        shift: calibrationShift(outcomeValues.map((row) => ({ proposed: row.proposed, calibrated: row.calibrated }))),
        before: ratingDistribution(proposedRatings, points),
        after: ratingDistribution(calibratedRatings, points),
      },
    };
  });
}

export async function getReviewAssignment(assignmentId: string) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query<{
      id: string;
      cycle_id: string;
      cycle_name: string;
      cycle_status: string;
      subject_worker_id: string;
      subject_name: string;
      reviewer_role: ReviewRole;
      status: ReviewStatus;
      overall_comment: string | null;
      template_id: string;
      template_name: string;
      include_goals: boolean;
      goals_weight: string | number;
      points: RatingPoint[];
    }>(
      `select a.id, a.cycle_id, c.name as cycle_name, c.status as cycle_status,
              a.subject_worker_id,
              coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as subject_name,
              a.reviewer_role, a.status, a.overall_comment, t.id as template_id, t.name as template_name,
              t.include_goals, t.goals_weight, s.points
       from review_assignments a
       join review_cycles c on c.id = a.cycle_id
       join workers w on w.id = a.subject_worker_id
       join review_templates t on t.id = c.template_id
       join rating_scales s on s.id = t.rating_scale_id
       where a.id = $1 and a.organization_id = $2`,
      [assignmentId, organizationId],
    );
    const assignment = result.rows[0];
    if (!assignment) return null;
    const [itemResult, goalResult, scoreResult] = await Promise.all([
      pool.query<{
        id: string;
        position: number;
        item_type: "competency" | "question";
        title: string;
        description: string | null;
        weight: string | number;
        rated: boolean;
        rating_value: string | number | null;
        comment: string | null;
      }>(
        `select i.id, i.position, i.item_type, i.title, i.description, i.weight, i.rated,
                r.rating_value, r.comment
         from review_template_items i
         left join review_item_responses r
           on r.template_item_id = i.id and r.assignment_id = $1
         where i.template_id = $2 and i.applies_to @> array[$3]::text[]
         order by i.position`,
        [assignmentId, assignment.template_id, assignment.reviewer_role],
      ),
      pool.query<{
        id: string;
        title: string;
        description: string | null;
        weight: string | number;
        progress_pct: string | number;
        status: string;
        due_date: string | null;
      }>(
        `select id, title, description, weight, progress_pct, status, due_date
         from goals
         where worker_id = $1 and cycle_id = $2 and organization_id = $3
         order by title`,
        [assignment.subject_worker_id, assignment.cycle_id, organizationId],
      ),
      pool.query<{
        reviewer_role: "self" | "manager";
        status: ReviewStatus;
        weight: string | number;
        rating_value: string | number | null;
      }>(
        `select a.reviewer_role, a.status, i.weight, r.rating_value
         from review_assignments a
         join review_template_items i
           on i.template_id = $3 and i.applies_to @> array[a.reviewer_role]::text[] and i.rated
         left join review_item_responses r
           on r.assignment_id = a.id and r.template_item_id = i.id
         where a.cycle_id = $1 and a.subject_worker_id = $2
           and a.reviewer_role in ('self', 'manager')`,
        [assignment.cycle_id, assignment.subject_worker_id, assignment.template_id],
      ),
    ]);
    const scoreItems = (role: "self" | "manager") =>
      scoreResult.rows
        .filter((row) => row.reviewer_role === role)
        .map((row) => ({ weight: Number(row.weight), rating: num(row.rating_value) }));
    const selfAssignmentSubmitted = scoreResult.rows.some((row) => row.reviewer_role === "self" && row.status === "submitted");
    return {
      id: assignment.id,
      cycleId: assignment.cycle_id,
      cycleName: assignment.cycle_name,
      cycleStatus: assignment.cycle_status,
      subjectWorkerId: assignment.subject_worker_id,
      subjectName: assignment.subject_name,
      role: assignment.reviewer_role,
      status: assignment.status,
      overallComment: assignment.overall_comment,
      templateName: assignment.template_name,
      includeGoals: assignment.include_goals,
      goalsWeight: Number(assignment.goals_weight),
      ratingPoints: assignment.points,
      items: itemResult.rows.map((row) => ({
        id: row.id,
        position: row.position,
        itemType: row.item_type,
        title: row.title,
        description: row.description,
        weight: Number(row.weight),
        rated: row.rated,
        rating: num(row.rating_value),
        comment: row.comment,
      })),
      goals: goalResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        weight: Number(row.weight),
        progressPct: Number(row.progress_pct),
        status: row.status,
        dueDate: row.due_date,
      })),
      scores: {
        current: weightedScore(
          itemResult.rows
            .filter((row) => row.rated)
            .map((row) => ({ weight: Number(row.weight), rating: num(row.rating_value) })),
        ),
        self: weightedScore(scoreItems("self")),
        manager: weightedScore(scoreItems("manager")),
        selfSubmitted: selfAssignmentSubmitted,
        selfManagerGap: selfAssignmentSubmitted
          ? selfManagerGap(weightedScore(scoreItems("self")), weightedScore(scoreItems("manager")))
          : null,
      },
    };
  });
}

export async function saveReviewAssignment(input: {
  assignmentId: string;
  overallComment: string;
  items: { itemId: string; rating: number | null; comment: string }[];
  submit: boolean;
}) {
  return withFeatureDatabase(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const organizationId = await demoOrganizationId(client);
      const assignmentResult = await client.query<{
        id: string;
        status: ReviewStatus;
        reviewer_role: ReviewRole;
        subject_worker_id: string;
        cycle_id: string;
        template_id: string;
      }>(
        `select a.id, a.status, a.reviewer_role, a.subject_worker_id, a.cycle_id, c.template_id
         from review_assignments a join review_cycles c on c.id = a.cycle_id
         where a.id = $1 and a.organization_id = $2
         for update`,
        [input.assignmentId, organizationId],
      );
      const assignment = assignmentResult.rows[0];
      if (!assignment) throw new Error("Review assignment not found.");
      if (assignment.status === "submitted") throw new Error("This review has already been submitted.");

      const allowed = await client.query<{
        id: string;
        rated: boolean;
      }>(
        `select id, rated from review_template_items
         where template_id = $1 and applies_to @> array[$2]::text[]`,
        [assignment.template_id, assignment.reviewer_role],
      );
      const allowedItems = new Map(allowed.rows.map((item) => [item.id, item.rated]));
      for (const item of input.items) {
        if (!allowedItems.has(item.itemId)) continue;
        const rating = allowedItems.get(item.itemId) ? item.rating : null;
        await client.query(
          `insert into review_item_responses (assignment_id, template_item_id, rating_value, comment)
           values ($1, $2, $3, $4)
           on conflict (assignment_id, template_item_id)
           do update set rating_value = excluded.rating_value, comment = excluded.comment`,
          [input.assignmentId, item.itemId, rating, item.comment || null],
        );
      }
      await client.query(
        `update review_assignments
         set overall_comment = $2, status = $3,
             submitted_at = case when $3 = 'submitted' then now() else null end
         where id = $1`,
        [input.assignmentId, input.overallComment || null, input.submit ? "submitted" : "in_progress"],
      );

      if (input.submit && assignment.reviewer_role === "manager") {
        await updateProposedRating(client, organizationId, assignment);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
}

async function updateProposedRating(
  client: PoolClient,
  organizationId: string,
  assignment: { subject_worker_id: string; cycle_id: string; template_id: string },
) {
  const [template, items, goals] = await Promise.all([
    client.query<{
      include_goals: boolean;
      goals_weight: string | number;
      points: RatingPoint[];
    }>(
      `select t.include_goals, t.goals_weight, s.points
       from review_templates t join rating_scales s on s.id = t.rating_scale_id
       where t.id = $1`,
      [assignment.template_id],
    ),
    client.query<{
      weight: string | number;
      rating_value: string | number | null;
    }>(
      `select i.weight, r.rating_value
       from review_assignments a
       join review_item_responses r on r.assignment_id = a.id
       join review_template_items i on i.id = r.template_item_id
       where a.cycle_id = $1 and a.subject_worker_id = $2
         and a.reviewer_role = 'manager' and i.rated`,
      [assignment.cycle_id, assignment.subject_worker_id],
    ),
    client.query<{
      weight: string | number;
      progress_pct: string | number;
    }>(
      `select weight, progress_pct from goals
       where cycle_id = $1 and worker_id = $2 and organization_id = $3`,
      [assignment.cycle_id, assignment.subject_worker_id, organizationId],
    ),
  ]);
  const config = template.rows[0];
  if (!config) return;
  const scale = config.points.map((point) => Number(point.value));
  const proposal = proposedRating({
    managerItems: items.rows.map((row) => ({ weight: Number(row.weight), rating: num(row.rating_value) })),
    goals: goals.rows.map((row) => ({ weight: Number(row.weight), progressPct: Number(row.progress_pct) })),
    includeGoals: config.include_goals,
    goalsWeight: Number(config.goals_weight),
    scaleMin: Math.min(...scale),
    scaleMax: Math.max(...scale),
  });
  await client.query(
    `insert into review_outcomes (organization_id, cycle_id, worker_id, proposed_rating)
     values ($1, $2, $3, $4)
     on conflict (cycle_id, worker_id)
     do update set proposed_rating = excluded.proposed_rating`,
    [organizationId, assignment.cycle_id, assignment.subject_worker_id, proposal],
  );
}

export async function saveCalibration(input: {
  cycleId: string;
  workerId: string;
  proposed: number | null;
  calibrated: number | null;
  notes: string;
}) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    await pool.query(
      `insert into review_outcomes
         (organization_id, cycle_id, worker_id, proposed_rating, calibrated_rating, calibration_notes)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (cycle_id, worker_id)
       do update set proposed_rating = excluded.proposed_rating,
                     calibrated_rating = excluded.calibrated_rating,
                     calibration_notes = excluded.calibration_notes`,
      [organizationId, input.cycleId, input.workerId, input.proposed, input.calibrated, input.notes || null],
    );
  });
}

export async function setReviewCycleStatus(cycleId: string, status: string) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query(
      `update review_cycles set status = $3 where id = $1 and organization_id = $2`,
      [cycleId, organizationId, status],
    );
    if (!result.rowCount) throw new Error("Review cycle not found.");
  });
}

export async function releaseReviewCycle(cycleId: string) {
  return withFeatureDatabase(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const organizationId = await demoOrganizationId(client);
      await client.query(
        `update review_outcomes set released_at = now()
         where cycle_id = $1 and organization_id = $2`,
        [cycleId, organizationId],
      );
      const result = await client.query(
        `update review_cycles set status = 'released'
         where id = $1 and organization_id = $2`,
        [cycleId, organizationId],
      );
      if (!result.rowCount) throw new Error("Review cycle not found.");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function updateGoalProgress(goalId: string, progressPct: number, status: string) {
  return withFeatureDatabase(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const organizationId = await demoOrganizationId(client);
      const result = await client.query<{ worker_id: string; cycle_id: string | null }>(
        `update goals set progress_pct = $3, status = $4, updated_at = now()
         where id = $1 and organization_id = $2
         returning worker_id, cycle_id`,
        [goalId, organizationId, Math.max(0, Math.min(100, progressPct)), status],
      );
      const goal = result.rows[0];
      if (!goal) throw new Error("Goal not found.");
      if (goal.cycle_id) {
        const managerAssignment = await client.query<{ template_id: string }>(
          `select c.template_id from review_assignments a
           join review_cycles c on c.id = a.cycle_id
           where a.cycle_id = $1 and a.subject_worker_id = $2
             and a.reviewer_role = 'manager' and a.status = 'submitted'
           limit 1`,
          [goal.cycle_id, goal.worker_id],
        );
        if (managerAssignment.rows[0]) {
          await updateProposedRating(client, organizationId, {
            subject_worker_id: goal.worker_id,
            cycle_id: goal.cycle_id,
            template_id: managerAssignment.rows[0].template_id,
          });
        }
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
}
