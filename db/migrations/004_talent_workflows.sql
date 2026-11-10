alter table surveys
  add column if not exists include_contingent_workers boolean not null default false;

alter table departments
  drop constraint if exists departments_organization_id_name_key;

create unique index if not exists departments_organization_parent_name_key
  on departments (
    organization_id,
    (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    name
  );
