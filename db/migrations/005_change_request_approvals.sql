-- Change-request approval chains (up to 6 sequential steps, each a worker or a position).

alter table positions add column position_code text;
create unique index positions_org_code_key on positions (organization_id, position_code) where position_code is not null;

-- Reusable default chains, optionally per change type.
create table approval_chain_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  change_type text check (change_type in ('title', 'compensation', 'department', 'schedule', 'manager', 'status')),
  is_default boolean not null default false,
  active boolean not null default true
);

create table approval_chain_template_steps (
  template_id uuid not null references approval_chain_templates(id) on delete cascade,
  step_number smallint not null check (step_number between 1 and 6),
  approver_kind text not null check (approver_kind in ('worker', 'position')),
  approver_worker_id uuid references workers(id),
  approver_position_id uuid references positions(id),
  primary key (template_id, step_number),
  check ((approver_kind = 'worker') = (approver_worker_id is not null)
     and (approver_kind = 'position') = (approver_position_id is not null))
);

alter table change_requests drop constraint change_requests_status_check;
alter table change_requests add constraint change_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'withdrawn'));
alter table change_requests
  add column submitted_by_worker_id uuid references workers(id),
  add column approval_template_id uuid references approval_chain_templates(id),
  add column completed_at timestamptz;

-- Per-request copy of the chain with live state (mirrors lib/approvals/workflow.ts ApprovalStep).
create table change_request_approval_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  change_request_id uuid not null references change_requests(id) on delete cascade,
  step_number smallint not null check (step_number between 1 and 6),
  approver_kind text not null check (approver_kind in ('worker', 'position')),
  approver_worker_id uuid references workers(id),
  approver_position_id uuid references positions(id),
  status text not null check (status in ('waiting', 'pending', 'approved', 'rejected', 'skipped')),
  eligible_worker_ids uuid[] not null default '{}',
  decided_by_worker_id uuid references workers(id),
  decided_at timestamptz,
  comment text,
  activated_at timestamptz,
  unique (change_request_id, step_number),
  check ((approver_kind = 'worker') = (approver_worker_id is not null)
     and (approver_kind = 'position') = (approver_position_id is not null))
);

-- One link per eligible approver per step; the token identifies the approver until login exists.
create table change_request_approval_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  step_id uuid not null references change_request_approval_steps(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  unique (step_id, worker_id)
);

create table change_request_events (
  id bigserial primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  change_request_id uuid not null references change_requests(id) on delete cascade,
  event_type text not null check (event_type in
    ('submitted', 'step_activated', 'approved_step', 'rejected', 'approved', 'withdrawn', 'reassigned', 'email_queued')),
  step_number smallint,
  actor_worker_id uuid references workers(id),
  detail text,
  occurred_at timestamptz not null default now()
);

create index on change_request_approval_steps (change_request_id, status);
create index on change_request_approval_steps using gin (eligible_worker_ids);
create index on change_request_events (change_request_id, occurred_at);
