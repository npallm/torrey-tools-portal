import { randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { managerChain } from "@/lib/org/hierarchy";
import { managerSurveyResults, type ScoreBlock } from "@/lib/surveys/managerScores";
import { tenureBand } from "@/lib/surveys/results";
import type { SurveyInvitation, SurveyResponse } from "@/lib/surveys/types";
import { demoOrganizationId, isoDate, today, withFeatureDatabase } from "./common";
import { getActivePeople } from "./org";

export type QuestionBankItem = {
  id?: string;
  category: string;
  prompt: string;
  active: boolean;
  position: number;
};

export type SurveyScoreRow = {
  managerId: string;
  name: string;
  division: string | null;
  department: string | null;
  shown: boolean;
  respondents: number | null;
  overall: number | null;
  rank: number | null;
  categories: ScoreBlock["categories"] | null;
  items: ScoreBlock["items"] | null;
};

const token = () => randomBytes(24).toString("base64url");
const emailFallback = (employeeNumber: string | null, workerId: string) =>
  employeeNumber ? `${employeeNumber}@example.invalid` : `${workerId}@example.invalid`;

async function closeLockedManagerSurvey(client: PoolClient, organizationId: string, surveyId: string) {
  const survey = await client.query<{ status: "draft" | "open" | "closed" }>(
    `select status from surveys
     where id = $1 and organization_id = $2 and survey_type = 'manager_effectiveness'
     for update`,
    [surveyId, organizationId],
  );
  if (survey.rows[0]?.status !== "open") return false;
  await client.query(
    `update surveys set status = 'closed', closes_at = coalesce(closes_at, now())
     where id = $1 and organization_id = $2`,
    [surveyId, organizationId],
  );
  await refreshManagerSurveySnapshots(client, organizationId, surveyId);
  return true;
}

export async function closeExpiredSurveys(client: PoolClient, organizationId: string) {
  const expired = await client.query<{ id: string }>(
    `select id from surveys
     where organization_id = $1 and survey_type = 'manager_effectiveness'
       and status = 'open' and closes_at <= now()
     order by closes_at, id
     for update`,
    [organizationId],
  );
  for (const survey of expired.rows) {
    await closeLockedManagerSurvey(client, organizationId, survey.id);
  }
}

async function withExpiredSurveysClosed<T>(
  pool: Pool,
  load: (client: PoolClient, organizationId: string) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const organizationId = await demoOrganizationId(client);
    await closeExpiredSurveys(client, organizationId);
    const result = await load(client, organizationId);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function getQuestionBank(): Promise<QuestionBankItem[]> {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query<QuestionBankItem>(
      `select id, category, prompt, active, position
       from survey_question_bank
       where organization_id = $1
       order by position`,
      [organizationId],
    );
    return result.rows;
  });
}

export async function saveQuestionBank(items: QuestionBankItem[]) {
  return withFeatureDatabase(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const organizationId = await demoOrganizationId(client);
      await client.query("delete from survey_question_bank where organization_id = $1", [organizationId]);
      for (const [position, item] of items.entries()) {
        await client.query(
          `insert into survey_question_bank (organization_id, category, prompt, active, position)
           values ($1, $2, $3, $4, $5)`,
          [organizationId, item.category, item.prompt.trim(), item.active, position],
        );
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

export async function getActiveQuestionBank(): Promise<QuestionBankItem[]> {
  const bank = await getQuestionBank();
  return bank.filter((item) => item.active);
}

export async function createManagerSurvey(input: {
  title: string;
  description: string;
  closesAt: string | null;
  includeContingentWorkers: boolean;
}) {
  return withFeatureDatabase(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const organizationId = await demoOrganizationId(client);
      const bank = await client.query<{
        category: string;
        prompt: string;
      }>(
        `select category, prompt from survey_question_bank
         where organization_id = $1 and active
         order by position`,
        [organizationId],
      );
      if (!bank.rows.length) throw new Error("Activate at least one question before creating a survey.");
      const survey = await client.query<{ id: string }>(
        `insert into surveys
           (organization_id, title, description, kind, survey_type, status, anonymity_threshold,
            closes_at, include_contingent_workers)
         values ($1, $2, $3, 'custom', 'manager_effectiveness', 'draft', 5, $4, $5)
         returning id`,
        [
          organizationId,
          input.title.trim(),
          input.description.trim() || null,
          input.closesAt,
          input.includeContingentWorkers,
        ],
      );
      const surveyId = survey.rows[0].id;
      for (const [position, item] of bank.rows.entries()) {
        await client.query(
          `insert into survey_questions
             (organization_id, survey_id, position, question_type, prompt, dimension, reverse_scored, required)
           values ($1, $2, $3, 'likert5', $4, $5, false, true)`,
          [organizationId, surveyId, position, item.prompt, item.category],
        );
      }
      await client.query("commit");
      return surveyId;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function getSurveys() {
  return withFeatureDatabase((pool) => withExpiredSurveysClosed(pool, async (client, organizationId) => {
    const result = await client.query<{
      id: string;
      title: string;
      description: string | null;
      status: "draft" | "open" | "closed";
      opens_at: string | Date | null;
      closes_at: string | Date | null;
      anonymity_threshold: number;
      include_contingent_workers: boolean;
      invited: string | number;
      responded: string | number;
    }>(
      `select s.id, s.title, s.description, s.status, s.opens_at, s.closes_at,
              s.anonymity_threshold, s.include_contingent_workers,
              count(i.id) as invited,
              count(i.id) filter (where i.submitted_at is not null) as responded
       from surveys s
       left join survey_invitations i on i.survey_id = s.id
       where s.organization_id = $1 and s.survey_type = 'manager_effectiveness'
       group by s.id
       order by s.created_at desc`,
      [organizationId],
    );
    return result.rows.map((row) => {
      const invited = Number(row.invited);
      const responded = Number(row.responded);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        opensAt: row.opens_at ? isoDate(row.opens_at) : null,
        closesAt: row.closes_at ? isoDate(row.closes_at) : null,
        threshold: row.anonymity_threshold,
        includeContingentWorkers: row.include_contingent_workers,
        invited,
        responded,
        responseRate: invited ? (responded / invited) * 100 : null,
      };
    });
  }));
}

export async function getSurvey(id: string) {
  return withFeatureDatabase((pool) => withExpiredSurveysClosed(pool, async (client, organizationId) => {
    const surveyResult = await client.query<{
      id: string;
      title: string;
      description: string | null;
      status: "draft" | "open" | "closed";
      opens_at: string | Date | null;
      closes_at: string | Date | null;
      anonymity_threshold: number;
      include_contingent_workers: boolean;
      invited: string | number;
      responded: string | number;
    }>(
      `select s.id, s.title, s.description, s.status, s.opens_at, s.closes_at,
              s.anonymity_threshold, s.include_contingent_workers,
              count(i.id) as invited,
              count(i.id) filter (where i.submitted_at is not null) as responded
       from surveys s left join survey_invitations i on i.survey_id = s.id
       where s.id = $1 and s.organization_id = $2 and s.survey_type = 'manager_effectiveness'
       group by s.id`,
      [id, organizationId],
    );
    const survey = surveyResult.rows[0];
    if (!survey) return null;
    const [people, questions, directResult, supResult, shares, departmentCounts] = await Promise.all([
      getActivePeople(),
      client.query<{ id: string; prompt: string; category: string; position: number }>(
        `select id, prompt, dimension as category, position
         from survey_questions where survey_id = $1 order by position`,
        [id],
      ),
      client.query<{
        manager_worker_id: string;
        name: string;
        shown: boolean;
        respondents: number | null;
        overall_score: string | number | null;
        rank: number | null;
        category_scores: ScoreBlock["categories"] | null;
        item_scores: ScoreBlock["items"] | null;
      }>(
        `select ss.manager_worker_id, ss.shown, ss.respondents, ss.overall_score,
                ss.rank, ss.category_scores, ss.item_scores,
                coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as name
         from survey_manager_scores ss
         join workers w on w.id = ss.manager_worker_id
         where ss.survey_id = $1 and ss.scope = 'direct'
         order by ss.rank nulls last, name`,
        [id],
      ),
      client.query<{
        manager_worker_id: string;
        name: string;
        shown: boolean;
        respondents: number | null;
        overall_score: string | number | null;
        category_scores: ScoreBlock["categories"] | null;
        item_scores: ScoreBlock["items"] | null;
      }>(
        `select ss.manager_worker_id, ss.shown, ss.respondents, ss.overall_score,
                ss.category_scores, ss.item_scores,
                coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as name
         from survey_manager_scores ss
         join workers w on w.id = ss.manager_worker_id
         where ss.survey_id = $1 and ss.scope = 'sup_org'
         order by ss.shown desc, ss.overall_score desc nulls last, name`,
        [id],
      ),
      client.query<{
        id: string;
        token: string;
        scope_sup_org_leader_id: string | null;
        recipient_email: string | null;
        name: string | null;
      }>(
        `select s.id, s.token, s.scope_sup_org_leader_id, s.recipient_email,
                coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as name
         from survey_result_shares s
         left join workers w on w.id = s.scope_sup_org_leader_id
         where s.survey_id = $1 and s.organization_id = $2 order by name nulls last`,
        [id, organizationId],
      ),
      client.query<{ department: string; invited: string; responded: string }>(
        `select coalesce(i.department, 'Unknown') as department,
                count(*) as invited,
                count(*) filter (where i.submitted_at is not null) as responded
         from survey_invitations i
         where i.survey_id = $1 and i.organization_id = $2
         group by coalesce(i.department, 'Unknown')
         order by department`,
        [id, organizationId],
      ),
    ]);
    const personById = new Map(people.map((person) => [person.id, person]));
    const direct = survey.status === "closed" ? directResult.rows.map((row) => ({
      managerId: row.manager_worker_id,
      name: row.name,
      division: personById.get(row.manager_worker_id)?.division ?? null,
      department: personById.get(row.manager_worker_id)?.department ?? null,
      shown: row.shown,
      respondents: row.shown ? row.respondents : null,
      overall: row.shown && row.overall_score !== null ? Number(row.overall_score) : null,
      rank: row.shown ? row.rank : null,
      categories: row.shown ? row.category_scores : null,
      items: row.shown ? row.item_scores : null,
    })) : [];
    const supOrgs = survey.status === "closed" ? supResult.rows.map((row) => {
      const person = personById.get(row.manager_worker_id);
      return {
        managerId: row.manager_worker_id,
        name: row.name,
        division: person?.division ?? null,
        department: person?.department ?? null,
        shown: row.shown,
        respondents: row.shown ? row.respondents : null,
        overall: row.shown && row.overall_score !== null ? Number(row.overall_score) : null,
        rank: null,
        categories: row.shown ? row.category_scores : null,
        items: row.shown ? row.item_scores : null,
      };
    }) : [];
    const topLeader = people.find((person) => person.managerId === null);
    return {
      id: survey.id,
      title: survey.title,
      description: survey.description,
      status: survey.status,
      opensAt: survey.opens_at ? isoDate(survey.opens_at) : null,
      closesAt: survey.closes_at ? isoDate(survey.closes_at) : null,
      threshold: survey.anonymity_threshold,
      includeContingentWorkers: survey.include_contingent_workers,
      invited: Number(survey.invited),
      responded: Number(survey.responded),
      responseRate: Number(survey.invited) ? (Number(survey.responded) / Number(survey.invited)) * 100 : null,
      managersScored: direct.filter((row) => row.shown).length,
      managerCount: direct.length,
      questions: survey.status === "closed" ? questions.rows : [],
      direct,
      supOrgs,
      companyAverage: topLeader ? supOrgs.find((row) => row.managerId === topLeader.id) ?? null : null,
      departmentResponses: departmentCounts.rows.map((row) => {
        const invited = Number(row.invited);
        const responded = Number(row.responded);
        return {
          department: row.department,
          suppressed: invited < 5,
          invited: invited < 5 ? null : invited,
          responded: invited < 5 ? null : responded,
          responseRate: invited < 5 ? null : (responded / invited) * 100,
        };
      }),
      shares: shares.rows.map((row) => ({
        id: row.id,
        token: row.token,
        managerId: row.scope_sup_org_leader_id,
        name: row.name,
        recipientEmail: row.recipient_email,
        path: `/r/${row.token}`,
      })),
    };
  }));
}

export async function launchManagerSurvey(surveyId: string) {
  const people = await getActivePeople();
  return withFeatureDatabase(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const organizationId = await demoOrganizationId(client);
      const surveyResult = await client.query<{
        title: string;
        status: string;
        include_contingent_workers: boolean;
      }>(
        `select title, status, include_contingent_workers
         from surveys where id = $1 and organization_id = $2
         for update`,
        [surveyId, organizationId],
      );
      const survey = surveyResult.rows[0];
      if (!survey) throw new Error("Survey not found.");
      if (survey.status !== "draft") throw new Error("Only draft surveys can be launched.");
      const invitees = people.filter(
        (person) =>
          person.managerId &&
          (survey.include_contingent_workers || person.workerType === "employee"),
      );
      const orgPeople = people.map((person) => ({ id: person.id, name: person.name, managerId: person.managerId }));
      const managerEmails = new Map(people.map((person) => [person.id, person.workEmail]));
      const managerReportCounts = new Map<string, number>();
      for (const person of invitees) {
        const directManagerId = person.managerId!;
        managerReportCounts.set(directManagerId, (managerReportCounts.get(directManagerId) ?? 0) + 1);
        const chain = managerChain(person.id, orgPeople);
        const inviteToken = token();
        const email = person.workEmail ?? emailFallback(person.employeeNumber, person.id);
        await client.query(
          `insert into survey_invitations
             (organization_id, survey_id, worker_id, token, division, department, location,
              worker_type, tenure_band, manager_chain)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            organizationId,
            surveyId,
            person.id,
            inviteToken,
            person.division,
            person.department,
            person.location,
            person.workerType,
            tenureBand(person.hireDate, today()),
            chain,
          ],
        );
        await client.query(
          `insert into outbox_messages
             (organization_id, to_email, subject, body, link_path, related_table, related_id)
           values ($1, $2, $3, $4, $5, 'survey_invitations',
             (select id from survey_invitations where token = $6))`,
          [
            organizationId,
            email,
            survey.title,
            `You are invited to share feedback about your manager: /s/${inviteToken}`,
            `/s/${inviteToken}`,
            inviteToken,
          ],
        );
      }
      for (const managerId of managerReportCounts.keys()) {
        const shareToken = token();
        const email = managerEmails.get(managerId);
        const share = await client.query<{ id: string }>(
          `insert into survey_result_shares
             (organization_id, survey_id, recipient_worker_id, recipient_email,
              scope_sup_org_leader_id, token)
           values ($1, $2, $3, $4, $3, $5)
           returning id`,
          [organizationId, surveyId, managerId, email, shareToken],
        );
        await client.query(
          `insert into outbox_messages
             (organization_id, to_email, subject, body, link_path, related_table, related_id)
           values ($1, $2, $3, $4, $5, 'survey_result_shares', $6)`,
          [
            organizationId,
            email ?? emailFallback(null, managerId),
            `${survey.title} results`,
            `View your manager survey results: /r/${shareToken}`,
            `/r/${shareToken}`,
            share.rows[0].id,
          ],
        );
      }
      await client.query(
        `update surveys set status = 'open', opens_at = now()
         where id = $1 and organization_id = $2`,
        [surveyId, organizationId],
      );
      await client.query("commit");
      return { invited: invitees.length, managers: managerReportCounts.size };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function closeManagerSurvey(surveyId: string) {
  return withFeatureDatabase(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const organizationId = await demoOrganizationId(client);
      if (!await closeLockedManagerSurvey(client, organizationId, surveyId)) {
        throw new Error("Only open surveys can be closed.");
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

type Queryable = Pool | PoolClient;

async function loadManagerScoreInput(db: Queryable, organizationId: string, surveyId: string) {
  const questions = await db.query<{ id: string; category: string }>(
    `select id, dimension as category from survey_questions
     where survey_id = $1 and organization_id = $2 order by position`,
    [surveyId, organizationId],
  );
  const invitationRows = await db.query<{
      id: string;
      division: string | null;
      department: string | null;
      location: string | null;
      worker_type: string | null;
      tenure_band: string | null;
      manager_chain: string[];
    }>(
    `select id, division, department, location, worker_type, tenure_band, manager_chain
     from survey_invitations where survey_id = $1 and organization_id = $2`,
    [surveyId, organizationId],
  );
  const responseRows = await db.query<{
      id: string;
      invitation_id: string;
      submitted_at: string;
      question_id: string | null;
      numeric_value: number | null;
    }>(
    `select r.id, r.invitation_id, r.submitted_at, a.question_id, a.numeric_value
     from survey_responses r
     left join survey_answers a on a.response_id = r.id
     where r.survey_id = $1 and r.organization_id = $2
     order by r.submitted_at, r.id, a.question_id`,
    [surveyId, organizationId],
  );
  const invitations: SurveyInvitation[] = invitationRows.rows.map((row) => ({
    id: row.id,
    attributes: {
      division: row.division,
      department: row.department,
      location: row.location,
      workerType: row.worker_type,
      tenureBand: row.tenure_band,
      managerChain: row.manager_chain,
    },
  }));
  const byResponse = new Map<string, SurveyResponse>();
  for (const row of responseRows.rows) {
    let response = byResponse.get(row.id);
    if (!response) {
      response = { id: row.id, invitationId: row.invitation_id, submittedAt: row.submitted_at, answers: [] };
      byResponse.set(row.id, response);
    }
    if (row.question_id) {
      response.answers.push({
        questionId: row.question_id,
        numericValue: row.numeric_value,
        choiceValues: [],
        textValue: null,
      });
    }
  }
  const managerIds = [...new Set(invitationRows.rows.flatMap((row) => row.manager_chain))];
  return {
    questions: questions.rows,
    invitations,
    responses: [...byResponse.values()],
    managerIds,
  };
}

export async function refreshManagerSurveySnapshots(
  db: Queryable,
  organizationId: string,
  surveyId: string,
) {
  const input = await loadManagerScoreInput(db, organizationId, surveyId);
  const thresholdResult = await db.query<{ anonymity_threshold: number }>(
    `select anonymity_threshold from surveys where id = $1 and organization_id = $2`,
    [surveyId, organizationId],
  );
  const result = managerSurveyResults({
    ...input,
    k: thresholdResult.rows[0]?.anonymity_threshold ?? 5,
  });
  const supByLeader = new Map(result.supOrgs.map((row) => [row.leaderId, row]));
  for (const manager of result.managers) {
    const direct = manager.direct;
    const supOrg = supByLeader.get(manager.managerId);
    for (const [scope, shown, block, rank] of [
      ["direct", manager.scored, direct, manager.rank],
      ["sup_org", supOrg?.shown ?? false, supOrg?.total ?? null, null],
    ] as const) {
      await db.query(
        `insert into survey_manager_scores
           (survey_id, organization_id, manager_worker_id, scope, shown, respondents,
            overall_score, rank, category_scores, item_scores, computed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         on conflict (survey_id, manager_worker_id, scope)
         do update set shown = excluded.shown, respondents = excluded.respondents,
                       overall_score = excluded.overall_score, rank = excluded.rank,
                       category_scores = excluded.category_scores,
                       item_scores = excluded.item_scores, computed_at = now()`,
        [
          surveyId,
          organizationId,
          manager.managerId,
          scope,
          shown,
          shown ? block?.respondents ?? null : null,
          shown ? block?.overall ?? null : null,
          scope === "direct" && shown ? rank : null,
          shown ? JSON.stringify(block?.categories ?? []) : null,
          shown ? JSON.stringify(block?.items ?? []) : null,
        ],
      );
    }
  }
  return result;
}

export async function getSurveyFormByToken(inviteToken: string) {
  return withFeatureDatabase((pool) => withExpiredSurveysClosed(pool, async (client, organizationId) => {
    const result = await client.query<{
      invitation_id: string;
      survey_id: string;
      worker_id: string;
      status: "draft" | "open" | "closed";
      deadline_passed: boolean;
      submitted_at: string | null;
      title: string;
      description: string | null;
    }>(
      `select i.id as invitation_id, i.survey_id, i.worker_id, i.submitted_at,
              s.status, s.title, s.description,
              coalesce(s.closes_at <= clock_timestamp(), false) as deadline_passed
       from survey_invitations i join surveys s on s.id = i.survey_id
       where i.token = $1 and i.organization_id = $2
         and s.organization_id = $2 and s.survey_type = 'manager_effectiveness'`,
      [inviteToken, organizationId],
    );
    const invitation = result.rows[0];
    if (!invitation) return { state: "unknown" as const };
    await client.query(
      `update survey_invitations set opened_at = coalesce(opened_at, now())
       where id = $1`,
      [invitation.invitation_id],
    );
    if (invitation.submitted_at) return { state: "submitted" as const, title: invitation.title, workerId: invitation.worker_id };
    if (invitation.status !== "open" || invitation.deadline_passed) {
      return { state: "closed" as const, title: invitation.title, workerId: invitation.worker_id };
    }
    const questions = await client.query<{
      id: string;
      prompt: string;
      category: string;
      position: number;
    }>(
      `select id, prompt, dimension as category, position
       from survey_questions where survey_id = $1 order by position`,
      [invitation.survey_id],
    );
    return {
      state: "open" as const,
      invitationId: invitation.invitation_id,
      workerId: invitation.worker_id,
      title: invitation.title,
      description: invitation.description,
      questions: questions.rows,
    };
  }));
}

export async function submitManagerSurveyResponse(input: {
  token: string;
  answers: { questionId: string; value: number }[];
  viewerWorkerId?: string | null;
}) {
  return withFeatureDatabase(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await closeExpiredSurveys(client, await demoOrganizationId(client));
      const invitationResult = await client.query<{
        id: string;
        survey_id: string;
        organization_id: string;
        worker_id: string;
        status: "draft" | "open" | "closed";
        submitted_at: string | null;
      }>(
        `select i.id, i.survey_id, i.organization_id, i.worker_id, s.status, i.submitted_at
         from survey_invitations i join surveys s on s.id = i.survey_id
         where i.token = $1 and i.organization_id = $2 and s.organization_id = $2
           and s.survey_type = 'manager_effectiveness'
         for update of i, s`,
        [input.token, await demoOrganizationId(client)],
      );
      const invitation = invitationResult.rows[0];
      if (!invitation) throw new Error("This survey link is not valid.");
      if (input.viewerWorkerId !== undefined && invitation.worker_id !== input.viewerWorkerId) {
        throw new Error("This link belongs to another person.");
      }
      if (invitation.status !== "open") throw new Error("This survey is closed.");
      const deadline = await client.query<{ passed: boolean }>(
        "select closes_at <= clock_timestamp() as passed from surveys where id = $1",
        [invitation.survey_id],
      );
      if (deadline.rows[0]?.passed) throw new Error("This survey is closed.");
      if (invitation.submitted_at) throw new Error("A response has already been submitted for this link.");
      const questions = await client.query<{ id: string }>(
        `select id from survey_questions where survey_id = $1 and organization_id = $2`,
        [invitation.survey_id, invitation.organization_id],
      );
      const validIds = new Set(questions.rows.map((question) => question.id));
      const answers = new Map<string, number>();
      for (const answer of input.answers) {
        if (!validIds.has(answer.questionId)) throw new Error("One or more survey questions are invalid.");
        if (!Number.isInteger(answer.value) || answer.value < 1 || answer.value > 5) {
          throw new Error("Choose a rating from 1 to 5 for every question.");
        }
        answers.set(answer.questionId, answer.value);
      }
      if (answers.size !== questions.rows.length) throw new Error("Answer every question before submitting.");
      const response = await client.query<{ id: string }>(
        `insert into survey_responses (organization_id, survey_id, invitation_id)
         values ($1, $2, $3) returning id`,
        [invitation.organization_id, invitation.survey_id, invitation.id],
      );
      for (const [questionId, value] of answers) {
        await client.query(
          `insert into survey_answers (response_id, question_id, numeric_value)
           values ($1, $2, $3)`,
          [response.rows[0].id, questionId, value],
        );
      }
      await client.query(
        "update survey_invitations set submitted_at = now() where id = $1",
        [invitation.id],
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

async function scoreRowsForManager(db: Queryable, surveyId: string, managerId: string) {
  const result = await db.query<{
    manager_worker_id: string;
    scope: "direct" | "sup_org";
    shown: boolean;
    respondents: number | null;
    overall_score: string | number | null;
    rank: number | null;
    category_scores: ScoreBlock["categories"] | null;
    item_scores: ScoreBlock["items"] | null;
  }>(
    `select manager_worker_id, scope, shown, respondents, overall_score, rank,
            category_scores, item_scores
     from survey_manager_scores
     where survey_id = $1 and manager_worker_id = $2
     order by scope`,
    [surveyId, managerId],
  );
  return result.rows.map((row) => ({
    managerId: row.manager_worker_id,
    scope: row.scope,
    shown: row.shown,
    respondents: row.shown ? row.respondents : null,
    overall: row.shown && row.overall_score !== null ? Number(row.overall_score) : null,
    rank: row.scope === "direct" && row.shown ? row.rank : null,
    categories: row.shown ? row.category_scores : null,
    items: row.shown ? row.item_scores : null,
  }));
}

export async function getShareScores(shareToken: string) {
  return withFeatureDatabase((pool) => withExpiredSurveysClosed(pool, async (client, organizationId) => {
    const share = await client.query<{
      id: string;
      survey_id: string;
      manager_id: string;
      title: string;
      status: "draft" | "open" | "closed";
      closes_at: string | Date | null;
      invited: string;
      responded: string;
      name: string;
    }>(
      `select s.id, s.survey_id, s.scope_sup_org_leader_id as manager_id,
              v.title, v.status, v.closes_at,
              (select count(*) from survey_invitations i where i.survey_id = v.id) as invited,
              (select count(*) from survey_invitations i
               where i.survey_id = v.id and i.submitted_at is not null) as responded,
              coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as name
       from survey_result_shares s
       join surveys v on v.id = s.survey_id
       join workers w on w.id = s.scope_sup_org_leader_id
       where s.token = $1 and s.organization_id = $2 and v.organization_id = $2
         and v.survey_type = 'manager_effectiveness'`,
      [shareToken, organizationId],
    );
    const row = share.rows[0];
    if (!row) return null;
    await client.query("update survey_result_shares set last_viewed_at = now() where id = $1", [row.id]);
    if (row.status !== "closed") {
      const invited = Number(row.invited);
      const responded = Number(row.responded);
      return {
        surveyId: row.survey_id,
        title: row.title,
        status: row.status,
        closesAt: row.closes_at ? isoDate(row.closes_at) : null,
        managerId: row.manager_id,
        managerName: row.name,
        invited,
        responded,
        responseRate: invited ? (responded / invited) * 100 : null,
        scores: [],
        questions: [],
        scoredManagerCount: 0,
      };
    }
    const [scores, questions, scoredManagers] = await Promise.all([
      scoreRowsForManager(client, row.survey_id, row.manager_id),
      client.query<{ id: string; prompt: string; category: string }>(
        `select id, prompt, dimension as category from survey_questions
         where survey_id = $1 order by position`,
        [row.survey_id],
      ),
      client.query<{ count: string }>(
        `select count(*) as count from survey_manager_scores
         where survey_id = $1 and scope = 'direct' and shown`,
        [row.survey_id],
      ),
    ]);
    return {
      surveyId: row.survey_id,
      title: row.title,
      status: row.status,
      closesAt: row.closes_at ? isoDate(row.closes_at) : null,
      managerId: row.manager_id,
      managerName: row.name,
      invited: Number(row.invited),
      responded: Number(row.responded),
      responseRate: Number(row.invited) ? (Number(row.responded) / Number(row.invited)) * 100 : null,
      scores,
      questions: questions.rows,
      scoredManagerCount: Number(scoredManagers.rows[0]?.count ?? 0),
    };
  }));
}

export async function getOutboxMessages() {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query<{
      id: string;
      to_email: string;
      subject: string;
      body: string;
      link_path: string | null;
      status: string;
      created_at: string;
      sent_at: string | null;
    }>(
      `select id, to_email, subject, body, link_path, status, created_at, sent_at
       from outbox_messages where organization_id = $1
       order by created_at desc`,
      [organizationId],
    );
    return result.rows;
  });
}

export async function markOutboxSent(messageId: string) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query(
      `update outbox_messages set status = 'sent', sent_at = now()
       where id = $1 and organization_id = $2 and status = 'queued'`,
      [messageId, organizationId],
    );
    if (!result.rowCount) throw new Error("Queued message not found.");
  });
}

export async function getManagerShareToken(surveyId: string, managerId: string) {
  return withFeatureDatabase(async (pool) => {
    const result = await pool.query<{ token: string }>(
      `select token from survey_result_shares
       where survey_id = $1 and scope_sup_org_leader_id = $2
       order by created_at desc limit 1`,
      [surveyId, managerId],
    );
    return result.rows[0]?.token ?? null;
  });
}
