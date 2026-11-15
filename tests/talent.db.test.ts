import { afterAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { getPool } from "@/lib/db";
import { managerSurveyResults } from "@/lib/surveys/managerScores";
import type { SurveyInvitation, SurveyResponse } from "@/lib/surveys/types";
import { getShareScores, submitManagerSurveyResponse } from "@/lib/server/surveys";
import {
  addOneOnOneAgendaItem,
  getOneOnOneDashboard,
  getOneOnOneSeries,
  logOneOnOneMeeting,
  setAgendaDiscussed,
} from "@/lib/server/oneOnOnes";
import { getSuccessionDashboard } from "@/lib/server/succession";
import { actionItemStatus, oneOnOneHealth } from "@/lib/talent/oneOnOnes";
import { benchStrength, performanceTrend, riskBand, roleRiskScore } from "@/lib/talent/succession";
import { proposedRating } from "@/lib/talent/reviews";

const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;
let pool: Pool | null = null;
const db = () => (pool ??= getPool());

async function organizationId() {
  const result = await db().query<{ id: string }>("select id from organizations where slug = 'demo'");
  return result.rows[0].id;
}

async function loadSurveyResult(surveyId: string) {
  const organization = await organizationId();
  const [questions, invitations, responses, threshold] = await Promise.all([
    db().query<{ id: string; category: string }>(
      "select id, dimension as category from survey_questions where survey_id=$1 order by position",
      [surveyId],
    ),
    db().query<{
      id: string; division: string | null; department: string | null; location: string | null;
      worker_type: string | null; tenure_band: string | null; manager_chain: string[];
    }>("select id,division,department,location,worker_type,tenure_band,manager_chain from survey_invitations where survey_id=$1", [surveyId]),
    db().query<{
      id: string; invitation_id: string; submitted_at: Date; question_id: string | null; numeric_value: number | null;
    }>(
      `select r.id,r.invitation_id,r.submitted_at,a.question_id,a.numeric_value
       from survey_responses r left join survey_answers a on a.response_id=r.id
       where r.survey_id=$1 order by r.id,a.question_id`,
      [surveyId],
    ),
    db().query<{ anonymity_threshold: number }>("select anonymity_threshold from surveys where id=$1", [surveyId]),
  ]);
  const surveyInvitations: SurveyInvitation[] = invitations.rows.map((row) => ({
    id: row.id,
    attributes: {
      division: row.division, department: row.department, location: row.location,
      workerType: row.worker_type, tenureBand: row.tenure_band, managerChain: row.manager_chain,
    },
  }));
  const surveyResponses = new Map<string, SurveyResponse>();
  for (const row of responses.rows) {
    let response = surveyResponses.get(row.id);
    if (!response) {
      response = {
        id: row.id,
        invitationId: row.invitation_id,
        submittedAt: row.submitted_at.toISOString(),
        answers: [],
      };
      surveyResponses.set(row.id, response);
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
  const managerIds = [...new Set(invitations.rows.flatMap((row) => row.manager_chain))];
  return managerSurveyResults({
    questions: questions.rows,
    invitations: surveyInvitations,
    responses: [...surveyResponses.values()],
    managerIds,
    k: threshold.rows[0].anonymity_threshold,
  });
}

databaseDescribe("seeded talent database pipelines", () => {
  afterAll(async () => {
    if (pool) await pool.end();
  });

  it("persists snapshots matching raw survey invitations, responses, and answers", async () => {
    const surveys = await db().query<{ id: string }>(
      "select id from surveys where organization_id=$1 order by title",
      [await organizationId()],
    );
    for (const survey of surveys.rows) {
      const computed = await loadSurveyResult(survey.id);
      const snapshots = await db().query<{
        manager_worker_id: string; scope: "direct" | "sup_org"; shown: boolean;
        respondents: number | null; overall_score: string | number | null; rank: number | null;
        category_scores: unknown; item_scores: unknown;
      }>(
        `select manager_worker_id,scope,shown,respondents,overall_score,rank,category_scores,item_scores
         from survey_manager_scores where survey_id=$1`,
        [survey.id],
      );
      for (const manager of computed.managers) {
        for (const [scope, shown, block, rank] of [
          ["direct", manager.scored, manager.direct, manager.rank],
          ["sup_org", computed.supOrgs.find((row) => row.leaderId === manager.managerId)?.shown ?? false,
            computed.supOrgs.find((row) => row.leaderId === manager.managerId)?.total ?? null, null],
        ] as const) {
          const snapshot = snapshots.rows.find((row) => row.manager_worker_id === manager.managerId && row.scope === scope);
          expect(snapshot).toBeDefined();
          expect(snapshot?.shown).toBe(shown);
          expect(snapshot?.respondents).toBe(shown ? block?.respondents ?? null : null);
          const snapshotScore = snapshot?.overall_score === null ? null : Number(snapshot?.overall_score);
          if (shown) expect(snapshotScore).toBeCloseTo(block?.overall ?? 0, 3);
          else expect(snapshotScore).toBeNull();
          expect(snapshot?.rank).toBe(scope === "direct" && shown ? rank : null);
          if (shown) {
            const categories = snapshot?.category_scores as { category: string; score: number }[];
            const items = snapshot?.item_scores as { questionId: string; score: number }[];
            expect(categories.map((row) => row.category)).toEqual(block?.categories.map((row) => row.category));
            expect(items.map((row) => row.questionId)).toEqual(block?.items.map((row) => row.questionId));
            categories.forEach((row, index) => expect(row.score).toBeCloseTo(block?.categories[index].score ?? 0, 8));
            items.forEach((row, index) => expect(row.score).toBeCloseTo(block?.items[index].score ?? 0, 8));
          }
        }
      }
    }
  });

  it("refreshes a manager snapshot after a token submission", async () => {
    const survey = await db().query<{ id: string }>(
      "select id from surveys where title='Q4 Manager Pulse' and status='open'",
    );
    const openSurveyId = survey.rows[0].id;
    const selected = await db().query<{ token: string; manager_id: string; count: string }>(
      `select i.token, i.manager_chain[1] as manager_id,
              (select count(*) from survey_responses r
               join survey_invitations report on report.id=r.invitation_id
               where report.survey_id=i.survey_id and report.manager_chain[1]=i.manager_chain[1]) as count
       from survey_invitations i
       join survey_manager_scores score on score.survey_id=i.survey_id
         and score.manager_worker_id=i.manager_chain[1] and score.scope='direct' and not score.shown
       where i.survey_id=$1 and i.submitted_at is null and cardinality(i.manager_chain)>0
         and (select count(*) from survey_responses r
              join survey_invitations report on report.id=r.invitation_id
              where report.survey_id=i.survey_id and report.manager_chain[1]=i.manager_chain[1])=4
       order by i.id
       limit 1`,
      [openSurveyId],
    );
    const invitation = selected.rows[0];
    expect(Number(invitation.count)).toBeGreaterThan(0);
    const before = await db().query<{ responded: string }>(
      "select count(*) as responded from survey_responses where survey_id=$1",
      [openSurveyId],
    );
    const questions = await db().query<{ id: string }>(
      "select id from survey_questions where survey_id=$1",
      [openSurveyId],
    );
    await submitManagerSurveyResponse({
      token: invitation.token,
      answers: questions.rows.map((question) => ({ questionId: question.id, value: 4 })),
    });
    await expect(submitManagerSurveyResponse({
      token: invitation.token,
      answers: questions.rows.map((question) => ({ questionId: question.id, value: 4 })),
    })).rejects.toThrow("A response has already been submitted");
    const after = await db().query<{ responded: string }>(
      "select count(*) as responded from survey_responses where survey_id=$1",
      [openSurveyId],
    );
    expect(Number(after.rows[0].responded)).toBe(Number(before.rows[0].responded) + 1);
    const score = await db().query<{ shown: boolean; respondents: number | null }>(
      `select shown,respondents from survey_manager_scores
       where survey_id=$1 and manager_worker_id=$2 and scope='direct'`,
      [openSurveyId, invitation.manager_id],
    );
    expect(score.rows[0].shown).toBe(true);
    expect(score.rows[0].respondents).toBe(Number(invitation.count) + 1);
  });

  it("keeps manager share loading limited to that token's leader", async () => {
    const share = await db().query<{ token: string; manager_id: string }>(
      `select token,scope_sup_org_leader_id as manager_id
       from survey_result_shares order by created_at limit 1`,
    );
    const result = await getShareScores(share.rows[0].token);
    expect(result?.managerId).toBe(share.rows[0].manager_id);
    expect(result?.scores).toHaveLength(2);
    expect(result?.scores.every((row) => row.managerId === result.managerId)).toBe(true);
    expect(result?.scores.map((row) => row.scope).sort()).toEqual(["direct", "sup_org"]);
  });

  it("preserves agenda text and includes its discussed state in meeting history", async () => {
    const seriesRow = await db().query<{ id: string }>(
      `select id from one_on_one_series
       limit 1`,
    );
    expect(seriesRow.rows[0]).toBeDefined();
    const seriesId = seriesRow.rows[0].id;
    let agendaItemId: string | null = null;
    let meetingId: string | null = null;
    try {
      agendaItemId = await addOneOnOneAgendaItem({
        seriesId,
        addedBy: "manager",
        body: "Q1 roadmap",
      });
      const stored = await db().query<{ body: string }>(
        "select body from one_on_one_agenda_items where id = $1",
        [agendaItemId],
      );
      expect(stored.rows[0].body).toBe("Q1 roadmap");
      await setAgendaDiscussed({ seriesId, itemId: agendaItemId, discussed: true });
      meetingId = await logOneOnOneMeeting({
        seriesId,
        meetingDate: "2026-01-02",
        sharedNotes: "",
        managerPrivateNotes: "",
        reportPrivateNotes: "",
        reportPulse: null,
      });
      const series = await getOneOnOneSeries(seriesId);
      const meeting = series?.meetings.find((item) => item.id === meetingId);
      expect(meeting?.agenda).toContainEqual({
        id: agendaItemId,
        added_by: "manager",
        body: "Q1 roadmap",
        discussed: true,
      });
    } finally {
      if (agendaItemId) await db().query("delete from one_on_one_agenda_items where id = $1", [agendaItemId]);
      if (meetingId) await db().query("delete from one_on_one_meetings where id = $1", [meetingId]);
    }
  });

  it("persists open-cycle proposed ratings from raw manager responses and goals", async () => {
    const rows = await db().query<{
      cycle_id: string; worker_id: string; proposed_rating: string | number | null;
      include_goals: boolean; goals_weight: string | number; points: { value: number }[];
    }>(
      `select o.cycle_id,o.worker_id,o.proposed_rating,t.include_goals,t.goals_weight,s.points
       from review_outcomes o join review_cycles c on c.id=o.cycle_id
       join review_templates t on t.id=c.template_id join rating_scales s on s.id=t.rating_scale_id
       where c.name='2026 Annual'`,
    );
    for (const outcome of rows.rows) {
      const [responses, goals] = await Promise.all([
        db().query<{ weight: string | number; rating_value: string | number | null }>(
          `select i.weight,r.rating_value from review_assignments a
           join review_item_responses r on r.assignment_id=a.id
           join review_template_items i on i.id=r.template_item_id
           where a.cycle_id=$1 and a.subject_worker_id=$2 and a.reviewer_role='manager' and i.rated`,
          [outcome.cycle_id, outcome.worker_id],
        ),
        db().query<{ weight: string | number; progress_pct: string | number }>(
          "select weight,progress_pct from goals where cycle_id=$1 and worker_id=$2",
          [outcome.cycle_id, outcome.worker_id],
        ),
      ]);
      const points = outcome.points.map((point) => Number(point.value));
      expect(Number(outcome.proposed_rating)).toBe(proposedRating({
        managerItems: responses.rows.map((row) => ({ weight: Number(row.weight), rating: row.rating_value === null ? null : Number(row.rating_value) })),
        goals: goals.rows.map((row) => ({ weight: Number(row.weight), progressPct: Number(row.progress_pct) })),
        includeGoals: outcome.include_goals,
        goalsWeight: Number(outcome.goals_weight),
        scaleMin: Math.min(...points),
        scaleMax: Math.max(...points),
      }));
    }
  });

  it("derives 1:1 and succession outputs through the lib scoring functions", async () => {
    const [oneOnOnes, succession] = await Promise.all([getOneOnOneDashboard(), getSuccessionDashboard()]);
    for (const series of oneOnOnes.series) {
      const [meetings, actions] = await Promise.all([
        db().query<{ meeting_date: string }>(
          "select meeting_date from one_on_one_meetings where series_id=$1 and status='held' order by meeting_date",
          [series.id],
        ),
        db().query<{ due_date: string | null; completed_at: string | null }>(
          "select due_date,completed_at from one_on_one_action_items where series_id=$1",
          [series.id],
        ),
      ]);
      const health = oneOnOneHealth({ cadenceDays: series.cadenceDays, startedOn: series.startedOn }, meetings.rows.map((row) => row.meeting_date), oneOnOnes.asOf);
      expect(series.health).toEqual(health);
      expect(series.openItems).toBe(actions.rows.filter((row) => actionItemStatus({ dueDate: row.due_date, completedAt: row.completed_at }, oneOnOnes.asOf) !== "Done").length);
    }
    for (const role of succession.roles) {
      expect(role.riskScore).toBe(roleRiskScore(role.impactOfLoss, role.probabilityOfLoss));
      expect(role.riskBand).toBe(riskBand(role.riskScore));
      expect(role.bench).toEqual(benchStrength(role.candidates.map((candidate) => ({ readiness: candidate.readiness }))));
    }
    const organization = await organizationId();
    for (const person of succession.talentPool) {
      const rawRatings = await db().query<{ calibrated_rating: string | number }>(
        `select o.calibrated_rating
         from review_outcomes o join review_cycles c on c.id = o.cycle_id
         where o.worker_id = $1 and o.organization_id = $2
           and o.calibrated_rating is not null and c.status in ('released', 'closed')
         order by c.period_start, c.id, o.id`,
        [person.workerId, organization],
      );
      const ratings = rawRatings.rows.map((row) => Number(row.calibrated_rating));
      expect(person.performanceRatings).toEqual(ratings);
      expect(person.performanceTrend).toBe(performanceTrend(ratings));
    }
    const trendCounts = new Map<string, number>();
    for (const person of succession.talentPool) {
      trendCounts.set(person.performanceTrend, (trendCounts.get(person.performanceTrend) ?? 0) + 1);
    }
    expect((trendCounts.get("Rising") ?? 0)).toBeGreaterThan(0);
    expect((trendCounts.get("Steady") ?? 0)).toBeGreaterThan(0);
    expect((trendCounts.get("Declining") ?? 0)).toBeGreaterThan(0);
    expect(succession.talentPool.length - (trendCounts.get("Insufficient data") ?? 0)).toBeGreaterThan(succession.talentPool.length / 2);
  });
});
