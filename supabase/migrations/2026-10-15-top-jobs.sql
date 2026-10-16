-- My Top Jobs: occupation reference data (O*NET, NCES crosswalk, BLS), the approved
-- matching tables (versioned), and each student's saved results.
-- Run once in the Supabase SQL editor.

create table occupations (
  code          text primary key,          -- O*NET-SOC code, e.g. 15-1252.00
  title         text not null,
  description   text not null,
  job_zone      smallint not null check (job_zone between 1 and 5),
  median_wage   integer,                   -- national median annual wage, null if not published
  growth_pct    numeric(5, 1),             -- projected 10-year employment change, percent
  source_ids    text[] not null            -- data_sources ids
);

create table field_occupations (
  cip_code         text not null,          -- 4-digit CIP 2020, like fields_of_study.code
  occupation_code  text not null references occupations(code),
  primary key (cip_code, occupation_code)
);

create table top_jobs_tables (
  id                 uuid primary key default gen_random_uuid(),
  version            integer not null unique,
  rubric_version_id  uuid not null references rubric_versions(id),
  self_map           jsonb not null,       -- self-assessment item -> { competency: weight }
  open_list          jsonb not null,       -- [{ code, reason }]
  published_at       timestamptz,          -- null = draft
  created_at         timestamptz not null default now()
);

create table occupation_needs (
  tables_id        uuid not null references top_jobs_tables(id),
  occupation_code  text not null references occupations(code),
  needs            jsonb not null,         -- { competency: 0..1 }, sums to 1
  primary key (tables_id, occupation_code)
);

create table top_job_results (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  fingerprint     text not null,
  inputs_summary  jsonb not null,          -- { experiences, honors, hasBio }
  versions        jsonb not null,          -- { rubricVersionId, tablesVersionId, reference, scoring }
  ranked          jsonb not null,          -- every candidate, in rank order
  explanations    jsonb not null default '{}'  -- { code: { why, experiences: [{ id, updatedAt }] } }
);

create index top_job_results_athlete_created on top_job_results (athlete_id, created_at desc);

alter table occupations enable row level security;
alter table field_occupations enable row level security;
alter table top_jobs_tables enable row level security;
alter table occupation_needs enable row level security;
alter table top_job_results enable row level security;

create policy "Signed-in users can read occupations"
  on occupations for select to authenticated using (true);

create policy "Signed-in users can read field occupations"
  on field_occupations for select to authenticated using (true);

create policy "Signed-in users can read top jobs tables"
  on top_jobs_tables for select to authenticated using (true);

create policy "Signed-in users can read occupation needs"
  on occupation_needs for select to authenticated using (true);

-- Each run is a new row: no update or delete.
create policy "Athletes can add own top job results"
  on top_job_results for insert
  with check (auth.uid() = athlete_id);

create policy "Athletes can view own top job results"
  on top_job_results for select
  using (auth.uid() = athlete_id);
