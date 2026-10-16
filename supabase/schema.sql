-- Full schema for the public tables, matching the live Supabase database
-- as of 2026-10-12. Changes after the initial setup live in migrations/.

-- Roles ---------------------------------------------------------------

create table user_roles (
  id                 uuid primary key references auth.users(id),
  role               text not null default 'student_athlete'
                       check (role in ('platform_admin', 'corporate_admin', 'corporate_user',
                                       'university_admin', 'university_user', 'student_athlete')),
  organization_id    uuid,
  name               text,
  organization_name  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table user_roles enable row level security;

create policy "Users can view own role"
  on user_roles for select
  using (auth.uid() = id);

-- Used by policies below. Runs as its owner so it can read user_roles
-- without granting everyone read access to that table.
create function is_platform_admin() returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from user_roles
    where id = auth.uid() and role = 'platform_admin'
  );
$$;

-- Profiles ------------------------------------------------------------

create table profiles (
  id           uuid primary key references auth.users(id),
  first_name   text not null,
  last_name    text not null,
  college      text,  -- old free text, replaced by athlete_education
  sport        text not null,
  sport_type   text not null check (sport_type in ('team', 'individual')),
  degree       text,  -- old free text, replaced by athlete_education
  positions    text[],  -- populated when sport_type = 'team'
  disciplines  text[],  -- populated when sport_type = 'individual'
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Platform admins can view all profiles"
  on profiles for select
  using (is_platform_admin());

-- Competency scores ---------------------------------------------------

create table competency_scores (
  athlete_id      uuid not null references auth.users(id),
  competency_key  text not null,
  category        text not null
                    check (category in ('cognitive', 'behavioral', 'interpersonal', 'performance')),
  score           smallint not null check (score >= 1 and score <= 5),
  updated_at      timestamptz not null default now(),
  primary key (athlete_id, competency_key)
);

alter table competency_scores enable row level security;

create policy "Users can view own competency scores"
  on competency_scores for select
  using (auth.uid() = athlete_id);

create policy "Users can insert own competency scores"
  on competency_scores for insert
  with check (auth.uid() = athlete_id);

create policy "Users can update own competency scores"
  on competency_scores for update
  using (auth.uid() = athlete_id);

-- Deletion requests ---------------------------------------------------

create table deletion_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id),
  email         text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'restored')),
  requested_at  timestamptz not null default now(),
  resolved_by   uuid references auth.users(id),
  resolved_at   timestamptz
);

-- At most one open (pending or approved) request per user.
create unique index deletion_requests_one_open_per_user
  on deletion_requests (user_id)
  where status in ('pending', 'approved');

alter table deletion_requests enable row level security;

create policy "Users can request own deletion"
  on deletion_requests for insert
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and resolved_by is null
    and resolved_at is null
    and email = (auth.jwt() ->> 'email')
  );

create policy "Users can view own deletion requests"
  on deletion_requests for select
  using (auth.uid() = user_id);

create policy "Platform admins can view all deletion requests"
  on deletion_requests for select
  using (is_platform_admin());

create policy "Platform admins can resolve deletion requests"
  on deletion_requests for update
  using (is_platform_admin())
  with check (is_platform_admin());

-- Dashboard -----------------------------------------------------------

-- Dashboard counts for Platform Admins. Returns null for anyone else.
-- Runs as its owner so admins get counts without read access to every score.

create function admin_dashboard_stats(competency_count int) returns json
language sql security definer stable
set search_path = public
as $$
  with athletes as (
    select p.id
    from profiles p
    left join user_roles r on r.id = p.id
    where coalesce(r.role, 'student_athlete') = 'student_athlete'
      and not exists (
        select 1 from deletion_requests d
        where d.user_id = p.id and d.status = 'approved'
      )
  )
  select case when not is_platform_admin() then null else json_build_object(
    'athletes', (select count(*) from athletes),
    'assessments_complete', (
      select count(*) from (
        select s.athlete_id
        from competency_scores s
        join athletes a on a.id = s.athlete_id
        group by s.athlete_id
        having count(*) >= competency_count
      ) done
    ),
    'pending_deletions', (select count(*) from deletion_requests where status = 'pending')
  ) end;
$$;

-- admin_report_athletes() is in the Education section below, after the tables it reads.

-- Experience evidence -------------------------------------------------

-- Rubric --------------------------------------------------------------

create table rubric_versions (
  id            uuid primary key default gen_random_uuid(),
  version       int not null unique,
  notes         text,
  published_at  timestamptz,           -- null = draft, not used on the live site
  created_at    timestamptz not null default now()
);

create table rubric_competencies (
  id                 uuid primary key default gen_random_uuid(),
  rubric_version_id  uuid not null references rubric_versions(id),
  key                text not null,    -- e.g. 'confidence'
  label              text not null,    -- e.g. 'Confidence'
  definition         text not null,
  strong_evidence    text not null,
  moderate_evidence  text not null,
  not_evidence       text not null,
  examples           jsonb not null default '[]',  -- [{ "story": "...", "rating": "strong", "why": "..." }]
  unique (rubric_version_id, key)
);

alter table rubric_versions enable row level security;
alter table rubric_competencies enable row level security;

-- Rubric wording isn't private, and the rubric check script reads it without
-- signing in. The app ignores drafts unless ALLOW_DRAFT_RUBRIC is set locally.
-- Only the SQL editor writes these tables.
create policy "Anyone can read rubric versions"
  on rubric_versions for select
  using (true);

create policy "Anyone can read rubric competencies"
  on rubric_competencies for select
  using (true);

-- Experiences ---------------------------------------------------------

create table experiences (
  id                 uuid primary key default gen_random_uuid(),
  athlete_id         uuid not null references auth.users(id),
  title              text not null,
  what_you_did       text not null,
  frequency          text not null,
  result             text not null,
  obstacle           text not null,
  followups          jsonb not null default '[]',  -- [{ "question": "...", "answer": "..." | null }]
  status             text not null default 'draft'
                       check (status in ('in_progress', 'draft', 'needs_followup', 'mapped', 'failed', 'confirmed')),
  rubric_version_id  uuid references rubric_versions(id),
  behaviors          text[],
  resume_bullet      text,
  interview_line     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index experiences_athlete_created on experiences (athlete_id, created_at desc);

alter table experiences enable row level security;

create policy "Athletes can add own experiences"
  on experiences for insert
  with check (auth.uid() = athlete_id);

create policy "Athletes can view own experiences"
  on experiences for select
  using (auth.uid() = athlete_id);

create policy "Athletes can update own experiences"
  on experiences for update
  using (auth.uid() = athlete_id)
  with check (auth.uid() = athlete_id);

-- Evidence goes with the experience (on delete cascade); the run log is untouched.
create policy "Athletes can delete own experiences"
  on experiences for delete
  using (auth.uid() = athlete_id);

create policy "Platform admins can view all experiences"
  on experiences for select
  using (is_platform_admin());

-- Evidence ------------------------------------------------------------

create table experience_evidence (
  id              uuid primary key default gen_random_uuid(),
  experience_id   uuid not null references experiences(id) on delete cascade,
  competency_key  text not null,
  strength        text not null check (strength in ('strong', 'moderate')),
  quote           text not null,
  reason          text not null,
  included        boolean not null default true
);

create index experience_evidence_experience on experience_evidence (experience_id);

alter table experience_evidence enable row level security;

-- The mapping step runs as the athlete, so it needs insert and delete on their own rows.
create policy "Athletes can view own evidence"
  on experience_evidence for select
  using (exists (
    select 1 from experiences e
    where e.id = experience_id and e.athlete_id = auth.uid()
  ));

create policy "Athletes can add own evidence"
  on experience_evidence for insert
  with check (exists (
    select 1 from experiences e
    where e.id = experience_id and e.athlete_id = auth.uid()
  ));

create policy "Athletes can update own evidence"
  on experience_evidence for update
  using (exists (
    select 1 from experiences e
    where e.id = experience_id and e.athlete_id = auth.uid()
  ));

create policy "Athletes can delete own evidence"
  on experience_evidence for delete
  using (exists (
    select 1 from experiences e
    where e.id = experience_id and e.athlete_id = auth.uid()
  ));

create policy "Platform admins can view all evidence"
  on experience_evidence for select
  using (is_platform_admin());

-- Athletes may only change whether an item is included. Re-mapping replaces
-- rows (delete, then insert); it never edits the quote or reason.
revoke update on experience_evidence from anon, authenticated;
grant update (included) on experience_evidence to authenticated;

-- Run log for the daily limit -------------------------------------------

create table experience_runs (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

create index experience_runs_athlete_created on experience_runs (athlete_id, created_at);

alter table experience_runs enable row level security;

create policy "Athletes can log own runs"
  on experience_runs for insert
  with check (auth.uid() = athlete_id);

create policy "Athletes can view own runs"
  on experience_runs for select
  using (auth.uid() = athlete_id);

-- Education (2026-10-12) ------------------------------------------------

-- Reference lists -----------------------------------------------------

create table data_sources (
  id            text primary key,
  publisher     text not null,
  dataset       text not null,
  edition       text not null,
  url           text,
  retrieved_on  date not null,
  checksum      text,
  notes         text
);

create table colleges (
  id                     integer primary key,  -- IPEDS UNITID
  name                   text not null,
  city                   text not null,
  state                  char(2) not null,
  athletic_associations  text[] not null,
  nicknames              text[] not null default '{}',
  source_id              text not null references data_sources(id)
);

create table fields_of_study (
  code         text primary key,  -- CIP 2020 code, e.g. 11.07
  title        text not null,
  family_code  text not null,
  source_id    text not null references data_sources(id)
);

-- Read-only from the app. They change only by running the generated SQL.
alter table data_sources enable row level security;
alter table colleges enable row level security;
alter table fields_of_study enable row level security;

create policy "Signed-in users can read data sources"
  on data_sources for select to authenticated using (true);

create policy "Signed-in users can read colleges"
  on colleges for select to authenticated using (true);

create policy "Signed-in users can read fields of study"
  on fields_of_study for select to authenticated using (true);

-- Education history ---------------------------------------------------

create table athlete_education (
  id                     uuid primary key default gen_random_uuid(),
  athlete_id             uuid not null references profiles(id) on delete cascade,
  college_id             integer references colleges(id),
  college_other          text,
  degree_type            text not null
                           check (degree_type in ('AA', 'AS', 'AAS', 'BA', 'BS', 'BFA', 'BBA', 'OTHER', 'NONE')),
  degree_other           text,
  primary_field_code     text references fields_of_study(code),
  primary_field_other    text,
  secondary_field_code   text references fields_of_study(code),
  secondary_field_other  text,
  start_month            smallint not null check (start_month between 1 and 12),
  start_year             smallint not null check (start_year between 1990 and 2100),
  end_month              smallint not null check (end_month between 1 and 12),
  end_year               smallint not null check (end_year between 1990 and 2100),
  is_current             boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- coalesce() matters: a check that evaluates to null passes.
  constraint education_school check (
    (college_id is not null and college_other is null)
    or (college_id is null and coalesce(btrim(college_other), '') <> '')
  ),
  constraint education_degree_other check (
    (degree_type = 'OTHER' and coalesce(btrim(degree_other), '') <> '')
    or (degree_type <> 'OTHER' and degree_other is null)
  ),
  constraint education_no_degree_only_previous check (
    not (is_current and degree_type = 'NONE')
  ),
  constraint education_primary_field check (
    (primary_field_code is not null and primary_field_other is null)
    or (primary_field_code is null and coalesce(btrim(primary_field_other), '') <> '')
    or (degree_type = 'NONE' and primary_field_code is null and primary_field_other is null)
  ),
  constraint education_secondary_field check (
    (secondary_field_code is null or secondary_field_other is null)
    and (secondary_field_other is null or btrim(secondary_field_other) <> '')
  ),
  constraint education_dates check (
    end_year * 12 + end_month >= start_year * 12 + start_month
  )
);

create index athlete_education_athlete on athlete_education (athlete_id);

-- One current school per athlete.
create unique index athlete_education_one_current
  on athlete_education (athlete_id) where is_current;

alter table athlete_education enable row level security;

create policy "Athletes can add own education"
  on athlete_education for insert
  with check (auth.uid() = athlete_id);

create policy "Athletes can view own education"
  on athlete_education for select
  using (auth.uid() = athlete_id);

create policy "Athletes can update own education"
  on athlete_education for update
  using (auth.uid() = athlete_id)
  with check (auth.uid() = athlete_id);

create policy "Athletes can delete own education"
  on athlete_education for delete
  using (auth.uid() = athlete_id);

create policy "Platform admins can view all education"
  on athlete_education for select
  using (is_platform_admin());

create function touch_athlete_education() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger athlete_education_touch
  before update on athlete_education
  for each row execute function touch_athlete_education();

-- Audit trail ---------------------------------------------------------

-- No foreign key on education_id, so history survives a delete.
create table athlete_education_history (
  id            bigint generated always as identity primary key,
  education_id  uuid not null,
  athlete_id    uuid not null,
  action        text not null check (action in ('insert', 'update', 'delete')),
  changed_by    uuid,  -- null when run from the SQL editor
  changed_at    timestamptz not null default now(),
  old_row       jsonb,
  new_row       jsonb
);

create index athlete_education_history_education on athlete_education_history (education_id);

alter table athlete_education_history enable row level security;

-- Read-only for admins. No insert, update, or delete policies: only the trigger writes.
create policy "Platform admins can view education history"
  on athlete_education_history for select
  using (is_platform_admin());

-- Runs as its owner so it can write history the athlete can't.
create function log_athlete_education() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into athlete_education_history (education_id, athlete_id, action, changed_by, old_row)
    values (old.id, old.athlete_id, 'delete', auth.uid(), to_jsonb(old));
    return old;
  end if;

  insert into athlete_education_history (education_id, athlete_id, action, changed_by, old_row, new_row)
  values (
    new.id,
    new.athlete_id,
    lower(tg_op),
    auth.uid(),
    case when tg_op = 'UPDATE' then to_jsonb(old) end,
    to_jsonb(new)
  );
  return new;
end;
$$;

create trigger athlete_education_log
  after insert or update or delete on athlete_education
  for each row execute function log_athlete_education();

-- Saving the profile and current school together ----------------------

-- Runs as the caller, so the normal row-level rules apply. One transaction:
-- any error undoes the whole save.
create function save_profile(p jsonb, current_education jsonb, transfer jsonb default null)
returns void
language plpgsql security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  current_id uuid;
  e jsonb := current_education;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  insert into profiles (id, first_name, last_name, sport, sport_type, positions, disciplines, updated_at)
  values (
    uid,
    p->>'first_name',
    p->>'last_name',
    p->>'sport',
    p->>'sport_type',
    case when jsonb_typeof(p->'positions') = 'array'
      then array(select jsonb_array_elements_text(p->'positions')) end,
    case when jsonb_typeof(p->'disciplines') = 'array'
      then array(select jsonb_array_elements_text(p->'disciplines')) end,
    now()
  )
  on conflict (id) do update set
    first_name  = excluded.first_name,
    last_name   = excluded.last_name,
    sport       = excluded.sport,
    sport_type  = excluded.sport_type,
    positions   = excluded.positions,
    disciplines = excluded.disciplines,
    updated_at  = excluded.updated_at;

  select id into current_id
  from athlete_education
  where athlete_id = uid and is_current;

  -- Transfer: the old current school becomes a previous one, ending on the given date.
  if transfer is not null and current_id is not null then
    update athlete_education set
      end_month  = (transfer->>'end_month')::smallint,
      end_year   = (transfer->>'end_year')::smallint,
      is_current = false
    where id = current_id;
    current_id := null;
  end if;

  if current_id is null then
    insert into athlete_education (
      athlete_id, is_current, college_id, college_other, degree_type, degree_other,
      primary_field_code, primary_field_other, secondary_field_code, secondary_field_other,
      start_month, start_year, end_month, end_year
    ) values (
      uid, true,
      (e->>'college_id')::integer, e->>'college_other', e->>'degree_type', e->>'degree_other',
      e->>'primary_field_code', e->>'primary_field_other', e->>'secondary_field_code', e->>'secondary_field_other',
      (e->>'start_month')::smallint, (e->>'start_year')::smallint,
      (e->>'end_month')::smallint, (e->>'end_year')::smallint
    );
  else
    update athlete_education set
      college_id            = (e->>'college_id')::integer,
      college_other         = e->>'college_other',
      degree_type           = e->>'degree_type',
      degree_other          = e->>'degree_other',
      primary_field_code    = e->>'primary_field_code',
      primary_field_other   = e->>'primary_field_other',
      secondary_field_code  = e->>'secondary_field_code',
      secondary_field_other = e->>'secondary_field_other',
      start_month           = (e->>'start_month')::smallint,
      start_year            = (e->>'start_year')::smallint,
      end_month             = (e->>'end_month')::smallint,
      end_year              = (e->>'end_year')::smallint
    where id = current_id;
  end if;
end;
$$;

revoke execute on function save_profile(jsonb, jsonb, jsonb) from public, anon;
grant execute on function save_profile(jsonb, jsonb, jsonb) to authenticated;

-- Reports -------------------------------------------------------------

-- Student athletes for the admin reports, with their current school. Same filter as
-- admin_dashboard_stats, so the list matches the Athletes tile. Returns no rows for non-admins.
-- Still returns the old college and degree text for athletes who have not picked yet.

create function admin_report_athletes()
returns table (
  id                   uuid,
  first_name           text,
  last_name            text,
  college              text,
  degree               text,
  sport                text,
  created_at           timestamptz,
  college_name         text,
  college_city         text,
  college_state        text,
  college_other        text,
  degree_type          text,
  degree_other         text,
  primary_field_title  text,
  primary_field_other  text,
  grad_month           smallint,
  grad_year            smallint
)
language sql security definer stable
set search_path = public
as $$
  select p.id, p.first_name, p.last_name, p.college, p.degree, p.sport, p.created_at,
         c.name, c.city, c.state::text, e.college_other,
         e.degree_type, e.degree_other, f.title, e.primary_field_other,
         e.end_month, e.end_year
  from profiles p
  left join user_roles r on r.id = p.id
  left join athlete_education e on e.athlete_id = p.id and e.is_current
  left join colleges c on c.id = e.college_id
  left join fields_of_study f on f.code = e.primary_field_code
  where is_platform_admin()
    and coalesce(r.role, 'student_athlete') = 'student_athlete'
    and not exists (
      select 1 from deletion_requests d
      where d.user_id = p.id and d.status = 'approved'
    )
  order by lower(p.last_name), lower(p.first_name);
$$;

revoke execute on function admin_report_athletes() from public, anon;
grant execute on function admin_report_athletes() to authenticated;

-- Typed-in "not listed" answers, one row per answer per athlete, same athlete
-- filter as above. The app groups them. Returns no rows for non-admins.
create function admin_report_not_listed()
returns table (
  kind        text,
  answer      text,
  athlete_id  uuid,
  first_name  text,
  last_name   text
)
language sql security definer stable
set search_path = public
as $$
  select a.kind, a.answer, p.id, p.first_name, p.last_name
  from (
    select 'School' as kind, e.college_other as answer, e.athlete_id
    from athlete_education e where e.college_other is not null
    union all
    select 'Field of study', e.primary_field_other, e.athlete_id
    from athlete_education e where e.primary_field_other is not null
    union all
    select 'Field of study', e.secondary_field_other, e.athlete_id
    from athlete_education e where e.secondary_field_other is not null
  ) a
  join profiles p on p.id = a.athlete_id
  left join user_roles r on r.id = p.id
  where is_platform_admin()
    and coalesce(r.role, 'student_athlete') = 'student_athlete'
    and not exists (
      select 1 from deletion_requests d
      where d.user_id = p.id and d.status = 'approved'
    );
$$;

revoke execute on function admin_report_not_listed() from public, anon;
grant execute on function admin_report_not_listed() to authenticated;

-- Bio import ----------------------------------------------------------
create table bio_imports (
  id            uuid primary key default gen_random_uuid(),
  athlete_id    uuid not null references auth.users(id),
  cleaned_text  text not null,    -- the bio with birthdates and family details removed
  extracted     jsonb not null,   -- checked profile values, honors, and story ideas
  created_at    timestamptz not null default now(),
  applied_at    timestamptz       -- null until the student saves the profile
);

create index bio_imports_athlete_created on bio_imports (athlete_id, created_at desc);

alter table bio_imports enable row level security;

create policy "Athletes can add own bio imports"
  on bio_imports for insert
  with check (auth.uid() = athlete_id);

create policy "Athletes can view own bio imports"
  on bio_imports for select
  using (auth.uid() = athlete_id);

create policy "Athletes can update own bio imports"
  on bio_imports for update
  using (auth.uid() = athlete_id)
  with check (auth.uid() = athlete_id);

create table athlete_honors (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references auth.users(id),
  title       text not null check (char_length(title) between 1 and 200),
  years       text check (years is null or char_length(years) <= 100),
  source      text not null check (source in ('bio', 'manual')),
  created_at  timestamptz not null default now()
);

create index athlete_honors_athlete on athlete_honors (athlete_id, created_at);

alter table athlete_honors enable row level security;

create policy "Athletes can add own honors"
  on athlete_honors for insert
  with check (auth.uid() = athlete_id);

create policy "Athletes can view own honors"
  on athlete_honors for select
  using (auth.uid() = athlete_id);

create policy "Athletes can update own honors"
  on athlete_honors for update
  using (auth.uid() = athlete_id)
  with check (auth.uid() = athlete_id);

create policy "Athletes can delete own honors"
  on athlete_honors for delete
  using (auth.uid() = athlete_id);

create table story_ideas (
  id             uuid primary key default gen_random_uuid(),
  athlete_id     uuid not null references auth.users(id),
  bio_import_id  uuid not null references bio_imports(id),
  prompt         text not null check (char_length(prompt) between 1 and 500),
  source         text not null check (source in ('bio', 'honor')),
  status         text not null default 'open' check (status in ('open', 'used', 'dismissed')),
  experience_id  uuid references experiences(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index story_ideas_athlete_status on story_ideas (athlete_id, status, created_at desc);

alter table story_ideas enable row level security;

create policy "Athletes can add own story ideas"
  on story_ideas for insert
  with check (auth.uid() = athlete_id);

create policy "Athletes can view own story ideas"
  on story_ideas for select
  using (auth.uid() = athlete_id);

create policy "Athletes can update own story ideas"
  on story_ideas for update
  using (auth.uid() = athlete_id)
  with check (auth.uid() = athlete_id);

create function apply_bio_import(import_id uuid, honors jsonb)
returns void
language plpgsql security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  imp bio_imports%rowtype;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  select * into imp from bio_imports
    where id = import_id and athlete_id = uid
    for update;
  if not found then
    raise exception 'Bio import not found';
  end if;
  if imp.applied_at is not null then
    return;
  end if;

  insert into athlete_honors (athlete_id, title, years, source)
    select uid, h->>'title', nullif(h->>'years', ''), 'bio'
    from jsonb_array_elements(coalesce(honors, '[]'::jsonb)) as h;

  insert into story_ideas (athlete_id, bio_import_id, prompt, source)
    select uid, import_id, i->>'prompt', i->>'source'
    from jsonb_array_elements(coalesce(imp.extracted->'ideas', '[]'::jsonb)) as i;

  update bio_imports set applied_at = now() where id = import_id;
end;
$$;

revoke execute on function apply_bio_import(uuid, jsonb) from public, anon;
grant execute on function apply_bio_import(uuid, jsonb) to authenticated;

-- Top jobs ------------------------------------------------------------
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
