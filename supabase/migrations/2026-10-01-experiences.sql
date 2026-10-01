-- Experience evidence: rubric, athlete experiences, evidence, and the run log
-- used for the daily limit. Run once in the Supabase SQL editor.

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
                       check (status in ('draft', 'needs_followup', 'mapped', 'failed', 'confirmed')),
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
