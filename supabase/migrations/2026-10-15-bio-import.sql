-- Bio import: a cleaned copy of each bio a student reads, their honors, and the story
-- ideas taken from both. Athletes can only see and change their own rows.
-- Run once in the Supabase SQL editor.

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
