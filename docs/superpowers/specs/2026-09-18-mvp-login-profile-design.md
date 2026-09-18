# Proven Impact — MVP Design: Login + Athlete Profile

**Date:** 2026-09-18
**Status:** Approved for implementation

## Purpose & Scope

MVP for Proven Impact (working title — company name may change). Establishes
the foundation of the platform described in the full technical
specification (`Technical_Specification_V1.md` in the `Proven` workspace):
a two-sided athlete/employer platform. This MVP covers only the first slice:

- Athlete account creation and login
- Athlete creates and edits a basic profile

Explicitly out of scope for this MVP: resume upload, competency scoring,
employer portal, matching engine, admin console. Those follow in later
phases per the full technical spec's phased approach.

## Tech Stack

- **Frontend + backend:** Next.js (React, TypeScript) — single codebase,
  API routes for any server-side logic.
- **Database, Auth, Storage:** Supabase (managed Postgres, built-in
  email/password auth, row-level security, file storage available for
  later phases).
- **Hosting:** Vercel, auto-deploy from GitHub on push.
- **Source control:** GitHub (new repo).

Rationale: one provider (Supabase) covers DB + auth + storage, avoiding
separate services to wire together for an MVP. TypeScript was chosen over
Java specifically because the user's prior experience is C#, and
TypeScript is the closer analog (static typing, interfaces, generics,
async/await) — Java would also require a separate frontend framework
anyway, doubling the new surface area to learn alongside Git/GitHub.

## Data Model

Single table for MVP, a subset of the full spec's `Athlete` entity:

```sql
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
```

Row-level security restricts every user to their own row from day one,
matching the RBAC posture the full spec calls for later.

## Pages / Components

- `/signup` — email + password signup via Supabase Auth
- `/login` — email + password login
- `/profile` — single form:
  - First Name, Last Name, College, Degree (always shown)
  - Sport (text) + Sport Type toggle (Team / Individual)
  - If Team: Positions (multi-value input, e.g. tag list)
  - If Individual: Disciplines (multi-value input, e.g. tag list)
  - After login, this is the landing page for MVP (no separate dashboard)
- Shared header with the Proven Impact logo (`ProvenImpact.png`)

## Validation & Error Handling

- Required fields: first name, last name, college, sport, degree
- Conditional requirement: at least one Position (team) or one Discipline
  (individual), based on the selected sport type
- Auth errors (invalid credentials, duplicate signup email) surfaced
  inline on the relevant form
- Validation implemented client-side for immediate feedback and
  server-side (in the API route / Supabase policy) as the source of truth

## Testing

MVP-scale only:
- Manual walkthrough of signup → create profile → edit profile
- Unit tests on the profile form validation logic (required fields,
  conditional positions/disciplines rule)
- No e2e test infrastructure for this phase (YAGNI)

## Deployment

1. New GitHub repo (`ProvenImpact` or similar)
2. Vercel project connected to that repo, auto-deploy on push to main
3. Supabase project (free tier) for Postgres + Auth
4. Environment variables (Supabase URL + anon key) set in Vercel

## Prerequisites Before Implementation

1. Supabase account + new project created
2. Vercel account, connected to GitHub
3. GitHub repo created (user has GitHub access, new to the workflow —
   plan to walk through init/commit/push as part of implementation)
4. `ProvenImpact.png` logo file location confirmed for inclusion in the
   project
