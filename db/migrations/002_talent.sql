-- Surveys, performance management v2, 1:1s and succession planning.
-- Design: docs/talent-framework.md. All tables carry organization_id.

-- Division / department / team levels on the existing department tree.
alter table departments add column unit_type text not null default 'department'
  check (unit_type in ('division', 'department', 'team'));

-- ---------- Employee surveys ----------
create table surveys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  description text,
  kind text not null default 'engagement' check (kind in ('engagement', 'pulse', 'onboarding', 'exit', 'custom')),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  anonymity_threshold smallint not null default 5 check (anonymity_threshold >= 3),
  opens_at timestamptz,
  closes_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

create table survey_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  survey_id uuid not null references surveys(id) on delete cascade,
  position smallint not null,
  question_type text not null check (question_type in ('likert5', 'enps', 'single_choice', 'multi_choice', 'text')),
  prompt text not null,
  dimension text,
  options text[] not null default '{}',
  reverse_scored boolean not null default false,
  required boolean not null default true,
  unique (survey_id, position)
);

-- One per invited worker; respondent attributes are frozen at launch.
create table survey_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  survey_id uuid not null references surveys(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  token text not null unique,
  division text,
  department text,
  location text,
  worker_type text,
  tenure_band text,
  manager_chain uuid[] not null default '{}',
  sent_at timestamptz,
  opened_at timestamptz,
  submitted_at timestamptz,
  unique (survey_id, worker_id)
);

create table survey_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  survey_id uuid not null references surveys(id) on delete cascade,
  invitation_id uuid not null unique references survey_invitations(id) on delete cascade,
  submitted_at timestamptz not null default now()
);

create table survey_answers (
  response_id uuid not null references survey_responses(id) on delete cascade,
  question_id uuid not null references survey_questions(id) on delete cascade,
  numeric_value smallint,
  choice_values text[] not null default '{}',
  text_value text,
  primary key (response_id, question_id)
);

-- Individualized, auto-updating result links (e.g. a manager's sup org, a division head's division).
create table survey_result_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  survey_id uuid not null references surveys(id) on delete cascade,
  recipient_worker_id uuid references workers(id) on delete cascade,
  recipient_email text,
  scope_sup_org_leader_id uuid references workers(id),
  scope_division text,
  scope_department text,
  token text not null unique,
  created_at timestamptz not null default now(),
  last_viewed_at timestamptz
);

-- Outgoing messages; delivered by an email provider when configured, otherwise copied manually.
create table outbox_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  to_email text not null,
  subject text not null,
  body text not null,
  link_path text,
  related_table text,
  related_id uuid,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- ---------- Performance management ----------
create table rating_scales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  -- [{ "value": 1, "label": "Below expectations", "description": "..." }, ...]
  points jsonb not null
);

create table review_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  rating_scale_id uuid not null references rating_scales(id),
  include_goals boolean not null default true,
  goals_weight numeric(5, 2) not null default 0
);

create table review_template_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  template_id uuid not null references review_templates(id) on delete cascade,
  position smallint not null,
  item_type text not null check (item_type in ('competency', 'question')),
  title text not null,
  description text,
  weight numeric(5, 2) not null default 1,
  rated boolean not null default true,
  applies_to text[] not null default '{self,manager,peer}',
  unique (template_id, position)
);

create table review_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  template_id uuid not null references review_templates(id),
  period_start date not null,
  period_end date not null,
  self_due date,
  manager_due date,
  calibration_due date,
  include_self boolean not null default true,
  include_peer boolean not null default false,
  include_upward boolean not null default false,
  status text not null default 'planning'
    check (status in ('planning', 'self_review', 'manager_review', 'calibration', 'released', 'closed'))
);

create table review_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  cycle_id uuid not null references review_cycles(id) on delete cascade,
  subject_worker_id uuid not null references workers(id) on delete cascade,
  reviewer_worker_id uuid not null references workers(id) on delete cascade,
  reviewer_role text not null check (reviewer_role in ('self', 'manager', 'peer', 'upward')),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'submitted')),
  overall_comment text,
  submitted_at timestamptz,
  unique (cycle_id, subject_worker_id, reviewer_worker_id, reviewer_role)
);

create table review_item_responses (
  assignment_id uuid not null references review_assignments(id) on delete cascade,
  template_item_id uuid not null references review_template_items(id) on delete cascade,
  rating_value numeric(4, 2),
  comment text,
  primary key (assignment_id, template_item_id)
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  cycle_id uuid references review_cycles(id) on delete set null,
  parent_goal_id uuid references goals(id) on delete set null,
  title text not null,
  description text,
  key_results text[] not null default '{}',
  weight numeric(5, 2) not null default 1,
  progress_pct numeric(5, 2) not null default 0,
  status text not null default 'on_track' check (status in ('not_started', 'on_track', 'at_risk', 'off_track', 'done')),
  due_date date,
  updated_at timestamptz not null default now()
);

-- Manager-proposed vs calibrated overall rating per person per cycle.
create table review_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  cycle_id uuid not null references review_cycles(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  proposed_rating numeric(4, 2),
  calibrated_rating numeric(4, 2),
  calibration_notes text,
  calibrated_by text,
  released_at timestamptz,
  unique (cycle_id, worker_id)
);

-- ---------- 1:1s ----------
create table one_on_one_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  manager_worker_id uuid not null references workers(id) on delete cascade,
  report_worker_id uuid not null references workers(id) on delete cascade,
  cadence_days smallint not null default 14 check (cadence_days between 1 and 90),
  started_on date not null,
  active boolean not null default true,
  unique (manager_worker_id, report_worker_id)
);

create table one_on_one_meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  series_id uuid not null references one_on_one_series(id) on delete cascade,
  meeting_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'held', 'canceled')),
  shared_notes text,
  manager_private_notes text,
  report_private_notes text,
  -- Optional 1–5 check-in from the report.
  report_pulse smallint check (report_pulse between 1 and 5)
);

create table one_on_one_agenda_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  series_id uuid not null references one_on_one_series(id) on delete cascade,
  -- null = queued for the next meeting
  meeting_id uuid references one_on_one_meetings(id) on delete set null,
  added_by text not null check (added_by in ('manager', 'report')),
  body text not null,
  discussed boolean not null default false,
  created_at timestamptz not null default now()
);

create table one_on_one_action_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  series_id uuid not null references one_on_one_series(id) on delete cascade,
  created_in_meeting_id uuid references one_on_one_meetings(id) on delete set null,
  owner text not null check (owner in ('manager', 'report')),
  body text not null,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Succession & talent ----------
-- Manager assessment; potential split into aspiration / ability / engagement (1 low – 3 high).
create table talent_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  assessed_on date not null,
  assessed_by text,
  aspiration smallint not null check (aspiration between 1 and 3),
  ability smallint not null check (ability between 1 and 3),
  engagement smallint not null check (engagement between 1 and 3),
  flight_risk text not null check (flight_risk in ('low', 'medium', 'high')),
  impact_of_loss text not null check (impact_of_loss in ('low', 'medium', 'high')),
  retirement_within_2_years boolean not null default false,
  open_to_relocation boolean,
  career_interests text,
  skills text[] not null default '{}',
  notes text,
  unique (worker_id, assessed_on)
);

create table critical_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  position_id uuid references positions(id),
  department_id uuid references departments(id),
  incumbent_worker_id uuid references workers(id),
  impact_of_loss smallint not null check (impact_of_loss between 1 and 5),
  probability_of_loss smallint not null check (probability_of_loss between 1 and 5),
  required_skills text[] not null default '{}',
  rationale text,
  reviewed_on date
);

create table succession_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  critical_role_id uuid not null references critical_roles(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  readiness text not null check (readiness in ('ready_now', 'ready_1_2_years', 'ready_3_plus_years')),
  is_emergency_backup boolean not null default false,
  rank smallint,
  skill_gaps text[] not null default '{}',
  notes text,
  unique (critical_role_id, worker_id)
);

-- 70-20-10 development plan items.
create table development_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  critical_role_id uuid references critical_roles(id) on delete set null,
  action_type text not null check (action_type in ('experience', 'exposure', 'education')),
  title text not null,
  due_date date,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'done')),
  created_at timestamptz not null default now()
);

create index on survey_invitations (survey_id);
create index on survey_invitations using gin (manager_chain);
create index on survey_responses (survey_id, submitted_at);
create index on review_assignments (cycle_id, subject_worker_id);
create index on goals (worker_id, cycle_id);
create index on one_on_one_meetings (series_id, meeting_date);
create index on one_on_one_action_items (series_id) where completed_at is null;
create index on talent_profiles (worker_id, assessed_on desc);
create index on succession_candidates (critical_role_id);
