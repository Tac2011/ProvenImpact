-- Education pick-lists (spec 2026-10-12-education-pick-lists-design.md).
-- Safe to run before the new code ships: profiles.college and profiles.degree stay,
-- and admin_report_athletes() still returns them.

-- Old free-text columns: kept for now, no longer required.
alter table profiles alter column college drop not null;
alter table profiles alter column degree drop not null;

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

-- Return columns change, so drop and recreate. Still returns college and degree,
-- so the code live before this release keeps working.
drop function admin_report_athletes();

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
