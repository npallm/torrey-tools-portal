alter table portal_users
  add column display_name text,
  add column is_active boolean not null default true,
  add column last_login_at timestamptz;

create table identity_providers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('okta', 'entra', 'google', 'oidc', 'saml')),
  display_name text not null,
  enabled boolean not null default false,
  email_domains text[] not null default '{}',
  oidc_issuer text,
  oidc_client_id text,
  oidc_client_secret_env text,
  saml_entry_point text,
  saml_idp_issuer text,
  saml_idp_cert text,
  jit_provisioning boolean not null default false,
  default_role text not null default 'employee'
    check (default_role in ('consultant', 'client_admin', 'manager', 'employee')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_identities (
  id uuid primary key default gen_random_uuid(),
  portal_user_id uuid not null references portal_users(id) on delete cascade,
  provider_id uuid not null references identity_providers(id) on delete cascade,
  subject text not null,
  created_at timestamptz not null default now(),
  unique (provider_id, subject)
);

create table auth_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  portal_user_id uuid not null references portal_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  user_agent text
);

create index auth_sessions_user_id_idx on auth_sessions(portal_user_id);

create table auth_requests (
  state text primary key,
  provider_id uuid not null references identity_providers(id) on delete cascade,
  nonce text,
  code_verifier text,
  return_to text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table feedback_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  requested_by_worker_id uuid not null references workers(id),
  subject_worker_id uuid not null references workers(id),
  message text not null,
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  min_responses integer not null default 3 check (min_responses > 0),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index feedback_requests_org_manager_idx
  on feedback_requests(organization_id, requested_by_worker_id, created_at desc);

create table feedback_request_recipients (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references feedback_requests(id) on delete cascade,
  peer_worker_id uuid not null references workers(id),
  token text not null unique,
  submitted_at timestamptz,
  unique (request_id, peer_worker_id)
);

create table feedback_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references feedback_requests(id) on delete cascade,
  recipient_id uuid not null unique references feedback_request_recipients(id) on delete cascade,
  collaboration_rating smallint not null check (collaboration_rating between 1 and 5),
  keep_doing text not null,
  do_differently text not null,
  anything_else text,
  created_at timestamptz not null default now()
);
