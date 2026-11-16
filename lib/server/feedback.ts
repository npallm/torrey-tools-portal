import { randomBytes } from "node:crypto";
import type { CurrentUser } from "@/lib/auth/session-core";
import { isAdmin } from "@/lib/auth/permissions";
import {
  feedbackPeerError,
  feedbackResultsUnlocked,
  isFeedbackDirectManager,
  stableFeedbackOrder,
  suggestFeedbackPeers,
  type FeedbackPerson,
} from "@/lib/talent/feedback";
import { managerChain } from "@/lib/org/hierarchy";
import { getPool } from "@/lib/db";
import { demoOrganizationId, today, withFeatureDatabase } from "./common";
import { getActivePeople } from "./org";

const noWorkEmail = "One or more peers do not have a work email address.";

function asFeedbackPeople(
  people: Awaited<ReturnType<typeof getActivePeople>>,
  organizationId: string,
): FeedbackPerson[] {
  return people.map((person) => ({
    id: person.id,
    managerId: person.managerId,
    department: person.department ?? "",
    active: true,
    organizationId,
  }));
}

export async function getFeedbackDashboard(viewer: CurrentUser) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const [people, requests] = await Promise.all([
      getActivePeople(),
      pool.query<{
        id: string;
        subject_id: string;
        subject_name: string;
        message: string;
        due_date: string;
        status: "open" | "closed";
        created_at: string;
        min_responses: number;
        recipient_count: string;
        response_count: string;
      }>(
        `select fr.id, fr.subject_worker_id as subject_id,
                coalesce(sw.preferred_name, sw.first_name) || ' ' || sw.last_name as subject_name,
                fr.message, fr.due_date, fr.status, fr.created_at, fr.min_responses,
                count(distinct rr.id) as recipient_count,
                count(distinct rsp.id) as response_count
         from feedback_requests fr
         join workers sw on sw.id=fr.subject_worker_id and sw.organization_id=fr.organization_id
         left join feedback_request_recipients rr on rr.request_id=fr.id
         left join feedback_responses rsp on rsp.request_id=fr.id
         where fr.organization_id=$1
           and ($2::uuid is null or fr.requested_by_worker_id=$2 or $3)
           and ($4::uuid is null or fr.subject_worker_id<>$4)
         group by fr.id, sw.id
         order by fr.created_at desc`,
        [organizationId, viewer.workerId, isAdmin(viewer), viewer.workerId],
      ),
    ]);
    const allPeople = asFeedbackPeople(people, organizationId);
    const suggestions = Object.fromEntries(
      people.map((person) => [
        person.id,
        suggestFeedbackPeers(person.id, allPeople),
      ]),
    );
    return {
      requests: requests.rows.map((row) => ({
        id: row.id,
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        message: row.message,
        dueDate: row.due_date,
        status: row.status,
        createdAt: row.created_at,
        minResponses: row.min_responses,
        recipientCount: Number(row.recipient_count),
        responseCount: Number(row.response_count),
      })),
      directReports: viewer.workerId
        ? people.filter((person) => person.managerId === viewer.workerId)
        : [],
      peers: allPeople.map((person) => ({
        ...person,
        name: people.find((candidate) => candidate.id === person.id)?.name ?? "",
      })),
      suggestions,
    };
  });
}

export async function createFeedbackRequest(input: {
  organizationId?: string;
  requesterWorkerId: string;
  subjectWorkerId: string;
  recipientWorkerIds: string[];
  message: string;
  dueDate: string;
}) {
  const people = await getActivePeople();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const organizationId = input.organizationId ?? await demoOrganizationId(client);
    const peopleForRules = asFeedbackPeople(people, organizationId);
    const chain = managerChain(input.subjectWorkerId, people);
    if (!isFeedbackDirectManager(chain, input.requesterWorkerId)) {
      throw new Error("Only the subject's direct manager can request feedback.");
    }
    const recipients = input.recipientWorkerIds.map((id) => peopleForRules.find((person) => person.id === id)).filter((person): person is FeedbackPerson => !!person);
    const validationError = feedbackPeerError(
      recipients,
      input.subjectWorkerId,
      input.requesterWorkerId,
      organizationId,
    );
    if (validationError) throw new Error(validationError);
    if (!input.message.trim()) throw new Error("Enter a message for the feedback request.");
    if (!input.dueDate || input.dueDate < today()) throw new Error("Choose a due date that is today or later.");
    const subject = people.find((person) => person.id === input.subjectWorkerId);
    const manager = people.find((person) => person.id === input.requesterWorkerId);
    if (!subject || !manager) throw new Error("The subject or requesting manager is not active.");
    const emailRows = await client.query<{ worker_id: string; email: string }>(
      `select distinct on (worker_id) worker_id, value as email
       from worker_contacts
       where organization_id=$1 and worker_id=any($2::uuid[])
         and kind='email' and usage='work'
       order by worker_id, is_primary desc, id`,
      [organizationId, input.recipientWorkerIds],
    );
    const emails = new Map(emailRows.rows.map((row) => [row.worker_id, row.email]));
    if (input.recipientWorkerIds.some((id) => !emails.has(id))) throw new Error(noWorkEmail);
    const requestResult = await client.query<{ id: string }>(
      `insert into feedback_requests
         (organization_id, requested_by_worker_id, subject_worker_id, message, due_date)
       values ($1,$2,$3,$4,$5) returning id`,
      [organizationId, input.requesterWorkerId, input.subjectWorkerId, input.message.trim(), input.dueDate],
    );
    const requestId = requestResult.rows[0].id;
    const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    for (const recipientId of input.recipientWorkerIds) {
      const token = randomBytes(32).toString("base64url");
      await client.query(
        `insert into feedback_request_recipients (request_id, peer_worker_id, token)
         values ($1,$2,$3)`,
        [requestId, recipientId, token],
      );
      const link = `/f/${token}`;
      const subjectLine = `${manager.name} requested your feedback on ${subject.name}`;
      await client.query(
        `insert into outbox_messages
           (organization_id, to_email, subject, body, link_path, related_table, related_id)
         values ($1,$2,$3,$4,$5,'feedback_requests',$6)`,
        [
          organizationId,
          emails.get(recipientId),
          subjectLine,
          `Please submit your peer feedback by ${input.dueDate}.\n\n${input.message.trim()}\n\n${baseUrl}${link}`,
          link,
          requestId,
        ],
      );
    }
    await client.query("commit");
    return requestId;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function getFeedbackInvite(token: string) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query<{
      recipient_id: string;
      peer_worker_id: string;
      subject_worker_id: string;
      subject_name: string;
      requester_name: string;
      message: string;
      due_date: string;
      status: "open" | "closed";
      submitted_at: string | null;
    }>(
      `select rr.id as recipient_id, rr.peer_worker_id, fr.subject_worker_id,
              coalesce(sw.preferred_name, sw.first_name) || ' ' || sw.last_name as subject_name,
              coalesce(m.preferred_name, m.first_name) || ' ' || m.last_name as requester_name,
              fr.message, fr.due_date, fr.status, rr.submitted_at
       from feedback_request_recipients rr
       join feedback_requests fr on fr.id=rr.request_id
       join workers sw on sw.id=fr.subject_worker_id
       join workers m on m.id=fr.requested_by_worker_id
       join workers pw on pw.id=rr.peer_worker_id
       where rr.token=$1 and fr.organization_id=$2`,
      [token, organizationId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      recipientId: row.recipient_id,
      recipientWorkerId: row.peer_worker_id,
      subjectWorkerId: row.subject_worker_id,
      subjectName: row.subject_name,
      requesterName: row.requester_name,
      message: row.message,
      dueDate: row.due_date,
      status: row.status,
      submitted: Boolean(row.submitted_at),
      canSubmit: row.status === "open" && row.due_date >= today() && !row.submitted_at,
    };
  });
}

export async function submitFeedbackResponse(input: {
  token: string;
  viewerWorkerId: string;
  rating: number;
  keepDoing: string;
  doDifferently: string;
  anythingElse: string;
}) {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new Error("Choose a collaboration rating from 1 to 5.");
  }
  if (!input.keepDoing.trim() || !input.doDifferently.trim()) {
    throw new Error("Complete both required comment fields.");
  }
  return withFeatureDatabase(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const organizationId = await demoOrganizationId(client);
      const recipient = await client.query<{
        id: string;
        request_id: string;
        peer_worker_id: string;
        due_date: string;
        status: "open" | "closed";
        submitted_at: string | null;
      }>(
        `select rr.id, rr.request_id, rr.peer_worker_id, rr.submitted_at,
                fr.due_date, fr.status
         from feedback_request_recipients rr
         join feedback_requests fr on fr.id=rr.request_id
         where rr.token=$1 and fr.organization_id=$2
         for update of rr, fr`,
        [input.token, organizationId],
      );
      const row = recipient.rows[0];
      if (!row) throw new Error("This feedback link is not valid.");
      if (row.peer_worker_id !== input.viewerWorkerId) throw new Error("This link belongs to another person.");
      if (row.status !== "open" || row.due_date < today()) throw new Error("This feedback request is closed.");
      if (row.submitted_at) throw new Error("Feedback has already been submitted.");
      await client.query(
        `insert into feedback_responses
           (request_id, recipient_id, collaboration_rating, keep_doing, do_differently, anything_else)
         values ($1,$2,$3,$4,$5,$6)`,
        [row.request_id, row.id, input.rating, input.keepDoing.trim(), input.doDifferently.trim(), input.anythingElse.trim() || null],
      );
      await client.query("update feedback_request_recipients set submitted_at=now() where id=$1", [row.id]);
      await client.query("commit");
      return row.request_id;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function getFeedbackRequestDetail(requestId: string, viewer: CurrentUser) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const request = await pool.query<{
      id: string;
      requester_id: string;
      subject_id: string;
      requester_name: string;
      subject_name: string;
      message: string;
      due_date: string;
      status: "open" | "closed";
      min_responses: number;
      recipient_count: string;
      response_count: string;
    }>(
      `select fr.id, fr.requested_by_worker_id as requester_id, fr.subject_worker_id as subject_id,
              coalesce(m.preferred_name, m.first_name) || ' ' || m.last_name as requester_name,
              coalesce(s.preferred_name, s.first_name) || ' ' || s.last_name as subject_name,
              fr.message, fr.due_date, fr.status, fr.min_responses,
              (select count(*) from feedback_request_recipients rr where rr.request_id=fr.id) as recipient_count,
              (select count(*) from feedback_responses r where r.request_id=fr.id) as response_count
       from feedback_requests fr
       join workers m on m.id=fr.requested_by_worker_id
       join workers s on s.id=fr.subject_worker_id
       where fr.id=$1 and fr.organization_id=$2
         and ($3::uuid is null or fr.subject_worker_id<>$3)
         and ($3::uuid is null or fr.requested_by_worker_id=$3 or $4)`,
      [requestId, organizationId, viewer.workerId, isAdmin(viewer)],
    );
    const row = request.rows[0];
    if (!row) return null;
    const responseCount = Number(row.response_count);
    const recipientRows = await pool.query<{ name: string }>(
      `select coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as name
       from feedback_request_recipients rr join workers w on w.id=rr.peer_worker_id
       where rr.request_id=$1 order by name`,
      [requestId],
    );
    const unlocked = feedbackResultsUnlocked(responseCount, row.min_responses);
    const responseRows = unlocked
      ? await pool.query<{
          id: string;
          collaboration_rating: number;
          keep_doing: string;
          do_differently: string;
          anything_else: string | null;
        }>(
          `select id, collaboration_rating, keep_doing, do_differently, anything_else
           from feedback_responses where request_id=$1`,
          [requestId],
        )
      : { rows: [] };
    const responses = stableFeedbackOrder(responseRows.rows).map((response) => ({
      rating: response.collaboration_rating,
      keepDoing: response.keep_doing,
      doDifferently: response.do_differently,
      anythingElse: response.anything_else,
    }));
    return {
      id: row.id,
      requesterId: row.requester_id,
      requesterName: row.requester_name,
      subjectId: row.subject_id,
      subjectName: row.subject_name,
      message: row.message,
      dueDate: row.due_date,
      status: row.status,
      minResponses: row.min_responses,
      recipientCount: Number(row.recipient_count),
      responseCount,
      recipients: recipientRows.rows.map((recipient) => recipient.name),
      unlocked,
      averageRating: unlocked && responseRows.rows.length
        ? responseRows.rows.reduce((sum, response) => sum + response.collaboration_rating, 0) / responseRows.rows.length
        : null,
      responses,
    };
  });
}

export async function closeFeedbackRequest(requestId: string, viewer: CurrentUser) {
  return withFeatureDatabase(async (pool) => {
    const organizationId = await demoOrganizationId(pool);
    const result = await pool.query(
      `update feedback_requests set status='closed', closed_at=now()
       where id=$1 and organization_id=$2 and status='open'
         and ($3::uuid is null or requested_by_worker_id=$3 or $4)`,
      [requestId, organizationId, viewer.workerId, isAdmin(viewer)],
    );
    if (!result.rowCount) throw new Error("Feedback request not found or already closed.");
  });
}
