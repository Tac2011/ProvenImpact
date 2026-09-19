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
