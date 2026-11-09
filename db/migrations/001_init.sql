-- Torrey Tools client portal: multi-tenant HR schema.
-- Design notes: docs/hr-metrics-research.md. Every tenant row carries organization_id.
-- Worker data is effective-dated (Workday-style); fields mirror the Finch unified API where one exists.
-- Payroll is read-only (ingested from Finch); amounts are stored in cents like Finch.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ---------- Tenancy & org structure ----------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  industry_naics text,
  fiscal_year_start_month smallint not null default 1 check (fiscal_year_start_month between 1 and 12),
  annual_revenue_cents bigint,
  hr_department_name text not null default 'People',
  created_at timestamptz not null default now()
);

-- Finch /employer/company: legal_name, ein, entity type/subtype.
create table legal_entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  legal_name text not null,
  ein text,
  entity_type text,
  entity_subtype text,
  is_primary boolean not null default false
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  line1 text, line2 text, city text, state text, postal_code text,
  country text not null default 'US',
  is_remote boolean not null default false
);

-- Finch company.departments[] { name, parent }.
create table departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  parent_id uuid references departments(id),
  name text not null,
  cost_center text,
  unique (organization_id, name)
);

-- ---------- Jobs, pay structure, positions (portal-owned; Finch has no pay ranges) ----------
create table job_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  job_family text,
  job_level text,
  flsa_status text not null default 'unknown' check (flsa_status in ('exempt', 'non_exempt', 'unknown')),
  eeo_job_category text,
  is_people_manager boolean not null default false,
  unique (organization_id, title, job_level)
);

create table pay_ranges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_profile_id uuid not null references job_profiles(id) on delete cascade,
  location_id uuid references locations(id),
  currency text not null default 'usd',
  pay_basis text not null default 'yearly' check (pay_basis in ('yearly', 'hourly')),
  min_cents bigint not null,
  mid_cents bigint not null,
  max_cents bigint not null,
  effective_from date not null,
  effective_to date,
  check (min_cents <= mid_cents and mid_cents <= max_cents)
);

-- Budgeted seats: drives vacancy rate.
create table positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_profile_id uuid references job_profiles(id),
  department_id uuid references departments(id),
  location_id uuid references locations(id),
  budgeted_fte numeric(4, 2) not null default 1,
  status text not null default 'filled' check (status in ('filled', 'open', 'frozen', 'closed')),
  opened_on date,
  closed_on date
);

-- ---------- Workers ----------
-- Finch /employer/individual. One row per person; employment stints live in employment_periods.
create table workers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  legal_entity_id uuid references legal_entities(id),
  employee_number text,
  first_name text not null,
  middle_name text,
  last_name text not null,
  preferred_name text,
  residence_line1 text, residence_line2 text, residence_city text, residence_state text,
  residence_postal_code text, residence_country text,
  original_hire_date date,
  continuous_service_date date,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_number)
);

-- Finch emails[] / phone_numbers[] { data, type }.
create table worker_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  kind text not null check (kind in ('email', 'phone')),
  usage text not null check (usage in ('work', 'personal')),
  value text not null,
  is_primary boolean not null default false
);

-- Restricted: EEO / demographic data (Finch dob, gender, ethnicity). Never store SSN.
create table worker_demographics (
  worker_id uuid primary key references workers(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  date_of_birth date,
  gender text,
  ethnicity text,
  veteran_status text,
  disability_status text,
  self_identified_on date
);

create table emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  name text not null,
  relationship text,
  phone text,
  email text
);

-- Finch start_date / end_date / latest_rehire_date; one row per stint (rehires add rows).
create table employment_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  hire_date date not null,
  termination_date date,
  is_rehire boolean not null default false,
  probation_end_date date,
  check (termination_date is null or termination_date >= hire_date),
  exclude using gist (worker_id with =, daterange(hire_date, termination_date, '[]') with &&)
);

-- Effective-dated job data (Finch employment + Workday job history).
create table job_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  employment_period_id uuid not null references employment_periods(id) on delete cascade,
  position_id uuid references positions(id),
  job_profile_id uuid references job_profiles(id),
  title text not null,
  department_id uuid references departments(id),
  location_id uuid references locations(id),
  manager_worker_id uuid references workers(id),
  worker_type text not null check (worker_type in ('employee', 'contractor')),
  worker_subtype text check (worker_subtype in ('full_time', 'part_time', 'intern', 'temp', 'seasonal', 'individual_contractor')),
  employment_status text not null default 'active'
    check (employment_status in ('active', 'deceased', 'leave', 'onboarding', 'prehire', 'retired', 'terminated')),
  flsa_status text not null default 'unknown' check (flsa_status in ('exempt', 'non_exempt', 'unknown')),
  fte numeric(4, 3) not null default 1 check (fte > 0 and fte <= 1),
  scheduled_weekly_hours numeric(5, 2) not null default 40,
  work_arrangement text check (work_arrangement in ('onsite', 'hybrid', 'remote')),
  work_state text,
  class_code text,
  union_code text,
  union_local text,
  benefit_eligibility_class text,
  highly_compensated_employee boolean,
  key_employee boolean,
  change_reason text not null default 'hire' check (change_reason in
    ('hire', 'rehire', 'promotion', 'lateral_transfer', 'demotion', 'title_change', 'manager_change',
     'schedule_change', 'status_change', 'reorganization', 'correction', 'data_sync')),
  effective_from date not null,
  effective_to date,
  check (effective_to is null or effective_to >= effective_from),
  exclude using gist (worker_id with =, daterange(effective_from, effective_to, '[]') with &&)
);

-- Finch income / income_history { unit, amount (cents), currency, effective_date }.
create table compensation_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  pay_unit text not null check (pay_unit in
    ('yearly', 'quarterly', 'monthly', 'semi_monthly', 'bi_weekly', 'weekly', 'daily', 'hourly', 'fixed')),
  amount_cents bigint not null,
  currency text not null default 'usd',
  annualized_cents bigint not null,
  effective_from date not null,
  effective_to date,
  change_reason text check (change_reason in ('hire', 'merit', 'promotion', 'market_adjustment', 'equity_adjustment', 'correction', 'data_sync')),
  check (effective_to is null or effective_to >= effective_from),
  exclude using gist (worker_id with =, daterange(effective_from, effective_to, '[]') with &&)
);

-- Separation detail Finch does not provide. Category follows BLS JOLTS.
create table separations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employment_period_id uuid not null unique references employment_periods(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  separation_date date not null,
  category text not null check (category in ('quit', 'layoff_discharge', 'other')),
  reason_code text not null check (reason_code in
    ('better_opportunity', 'compensation', 'relocation', 'personal', 'career_change', 'manager', 'job_abandonment',
     'performance', 'misconduct', 'position_eliminated', 'reduction_in_force', 'contract_end',
     'retirement', 'death', 'disability', 'transfer', 'other')),
  regrettable boolean,
  eligible_for_rehire boolean,
  exit_interview_completed boolean not null default false,
  notes text
);

create table leaves_of_absence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  leave_type text not null check (leave_type in ('fmla', 'medical', 'parental', 'military', 'personal', 'workers_comp', 'other')),
  is_protected boolean not null default false,
  start_date date not null,
  expected_return_date date,
  actual_return_date date
);

-- ---------- Time off, absence, performance, workflows ----------
create table pto_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  pto_type text not null check (pto_type in ('vacation', 'sick', 'personal', 'holiday')),
  start_date date not null,
  end_date date not null,
  days numeric(5, 2) not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'cancelled')),
  note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- Absence events for absence rate; planned = approved in advance.
create table absences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  absence_date date not null,
  days numeric(4, 2) not null check (days > 0),
  planned boolean not null,
  reason text not null,
  pto_request_id uuid references pto_requests(id)
);

create table performance_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  reviewer_worker_id uuid references workers(id),
  cycle text not null,
  due_date date,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'complete')),
  rating text check (rating in ('exceeds', 'meets', 'needs_improvement')),
  completed_at timestamptz
);

create table onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  label text not null,
  due_date date,
  completed_at timestamptz
);

create table hr_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid references workers(id) on delete cascade,
  title text not null,
  category text not null,
  storage_key text,
  requires_acknowledgement boolean not null default false,
  updated_at timestamptz not null default now()
);

create table change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  change_type text not null check (change_type in ('title', 'compensation', 'department', 'schedule', 'manager', 'status')),
  current_value text,
  requested_value text not null,
  effective_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table viz_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  metric text not null,
  chart_type text not null,
  description text not null,
  submitted_by text,
  status text not null default 'pending' check (status in ('pending', 'planned', 'done', 'declined')),
  created_at timestamptz not null default now()
);

-- ---------- Read-only payroll (Finch /employer/payment and /employer/pay-statement) ----------
create table pay_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  external_payment_id text,
  pay_date date not null,
  period_start date,
  period_end date,
  pay_frequency text,
  gross_pay_cents bigint,
  net_pay_cents bigint,
  employer_taxes_cents bigint,
  employee_taxes_cents bigint,
  company_debit_cents bigint,
  unique (organization_id, external_payment_id)
);

create table pay_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  pay_run_id uuid not null references pay_runs(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  statement_type text check (statement_type in ('regular_payroll', 'off_cycle_payroll', 'one_time_payment')),
  payment_method text check (payment_method in ('check', 'direct_deposit', 'other')),
  total_hours numeric(8, 2),
  gross_pay_cents bigint not null,
  net_pay_cents bigint,
  unique (pay_run_id, worker_id, statement_type)
);

-- Earnings, taxes, employee deductions and employer contributions, one row per line item.
create table pay_statement_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  pay_statement_id uuid not null references pay_statements(id) on delete cascade,
  item_class text not null check (item_class in ('earning', 'tax', 'employee_deduction', 'employer_contribution')),
  item_type text,
  name text,
  amount_cents bigint not null,
  currency text not null default 'usd',
  hours numeric(8, 2),
  is_employer boolean not null default false,
  pre_tax boolean
);

-- ---------- Integrations, access, audit ----------
-- Tokens live in the secret manager, never here.
create table integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null,
  finch_connection_id text,
  products text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'reauth_required', 'disconnected')),
  last_synced_at timestamptz
);

-- Finch individual id + provider source_id per worker, so re-syncs update instead of duplicating.
create table external_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  connection_id uuid not null references integration_connections(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  external_id text not null,
  source_id text,
  raw jsonb,
  last_synced_at timestamptz not null default now(),
  unique (connection_id, external_id)
);

create table portal_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('consultant', 'client_admin', 'manager', 'employee')),
  worker_id uuid references workers(id),
  can_view_compensation boolean not null default false,
  can_view_demographics boolean not null default false,
  unique (organization_id, email)
);

create table audit_log (
  id bigserial primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  actor text not null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  occurred_at timestamptz not null default now()
);

-- Metric catalog and point-in-time snapshots for ISO 30414-style reporting history.
create table metric_definitions (
  id text primary key,
  name text not null,
  formula text not null,
  definition text not null,
  sources text[] not null default '{}'
);

create table metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  metric_id text not null references metric_definitions(id),
  period_start date not null,
  period_end date not null,
  dimension text,
  dimension_value text,
  value numeric,
  numerator numeric,
  denominator numeric,
  computed_at timestamptz not null default now()
);

-- ---------- Indexes ----------
create index on employment_periods (organization_id, hire_date, termination_date);
create index on job_assignments (organization_id, effective_from);
create index on job_assignments (manager_worker_id);
create index on compensation_history (organization_id, worker_id, effective_from);
create index on separations (organization_id, separation_date);
create index on absences (organization_id, absence_date);
create index on pto_requests (organization_id, start_date);
create index on pay_runs (organization_id, pay_date);
create index on pay_statements (organization_id, worker_id);
create index on pay_statement_items (pay_statement_id);
create index on metric_snapshots (organization_id, metric_id, period_end);

-- ---------- Analytics view: one row per employment period, latest assignment/comp ----------
create view workforce_people as
select
  ep.id as employment_period_id,
  w.organization_id,
  w.id as worker_id,
  coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as name,
  d.name as department,
  l.name as location,
  ja.manager_worker_id,
  ja.worker_type,
  ja.fte,
  ep.hire_date,
  ep.termination_date,
  s.category as separation_category,
  s.regrettable,
  ch.annualized_cents,
  pr.min_cents as pay_range_min_cents,
  pr.mid_cents as pay_range_mid_cents,
  pr.max_cents as pay_range_max_cents
from employment_periods ep
join workers w on w.id = ep.worker_id
left join lateral (
  select * from job_assignments j
  where j.employment_period_id = ep.id
  order by j.effective_from desc limit 1
) ja on true
left join departments d on d.id = ja.department_id
left join locations l on l.id = ja.location_id
left join separations s on s.employment_period_id = ep.id
left join lateral (
  select * from compensation_history c
  where c.worker_id = w.id and c.effective_from <= coalesce(ep.termination_date, current_date)
  order by c.effective_from desc limit 1
) ch on true
left join lateral (
  select * from pay_ranges r
  where r.job_profile_id = ja.job_profile_id and r.pay_basis = 'yearly'
    and r.effective_from <= coalesce(ep.termination_date, current_date)
  order by r.effective_from desc limit 1
) pr on true;
