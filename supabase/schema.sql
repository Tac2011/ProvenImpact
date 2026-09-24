-- Full schema for the public tables, matching the live Supabase database
-- as of 2026-09-24. Changes after the initial setup live in migrations/.

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
  college      text not null,
  sport        text not null,
  sport_type   text not null check (sport_type in ('team', 'individual')),
  degree       text not null,
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
