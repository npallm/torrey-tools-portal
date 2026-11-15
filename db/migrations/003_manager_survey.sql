-- Manager-effectiveness surveys: editable question bank and persisted score snapshots.

-- Org-level bank; a survey copies active items into survey_questions (dimension = category).
create table survey_question_bank (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  category text not null,
  prompt text not null,
  position smallint not null,
  active boolean not null default true,
  unique (organization_id, position)
);

alter table survey_questions add constraint survey_questions_likert_only check (question_type = 'likert5');
alter table surveys add column survey_type text not null default 'manager_effectiveness'
  check (survey_type in ('manager_effectiveness'));

-- Snapshot of lib/surveys/managerScores.ts output, refreshed on every submission and on close.
-- scope = 'direct' (manager's direct reports) or 'sup_org' (everyone under the leader).
create table survey_manager_scores (
  survey_id uuid not null references surveys(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  manager_worker_id uuid not null references workers(id) on delete cascade,
  scope text not null check (scope in ('direct', 'sup_org')),
  shown boolean not null,
  respondents integer,
  overall_score numeric(4, 3),
  rank integer,
  -- [{ "category": "...", "score": 4.2 }]
  category_scores jsonb,
  -- [{ "questionId": "...", "score": 4.1 }]
  item_scores jsonb,
  computed_at timestamptz not null default now(),
  primary key (survey_id, manager_worker_id, scope)
);
create index on survey_manager_scores (survey_id, scope, rank);
