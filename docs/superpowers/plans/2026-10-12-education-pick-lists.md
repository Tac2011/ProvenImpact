# Education Pick-Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text college and degree with standard lists (schools, degree types, fields of study, graduation month and year), keep every school an athlete attended with an automatic audit trail, and record where the lists came from.

**Architecture:** Federal data (IPEDS, CIP) is turned into SQL by a script and loaded into `colleges`, `fields_of_study`, and `data_sources` tables. Each school an athlete attended is a row in `athlete_education`; a trigger writes every change to `athlete_education_history`. The profile page saves the profile and current school together through one SQL function, `save_profile`. A shared searchable picker handles schools and fields; reports read the current school through `admin_report_athletes()`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Supabase (Postgres, row-level security), Vitest, tsx for scripts.

**Spec:** `docs/superpowers/specs/2026-10-12-education-pick-lists-design.md`

## Global Constraints

- Never use em dashes in any copy, comments, or docs. Use a comma, period, colon, or " · ".
- States in scope: `NE`, `KS`, `IA`, `ND`, `SD`. Colleges only where IC2024 `ATHASSOC = 1`.
- Excluded CIP families: `21`, `32`, `33`, `34`, `35`, `36`, `37`, `53`, `55`, `60`, `61`. Codes with `Action` `Deleted` or `Moved to` are dropped.
- Degree types, exactly: `AA`, `AS`, `AAS`, `BA`, `BS`, `BFA`, `BBA`, `OTHER`, `NONE`. `NONE` only on previous schools.
- Year menus: 10 years before this year to 6 years after, plus any saved year outside that range. Database allows years 1990 to 2100.
- "This year" is computed in Central time (`America/Chicago`) on the server, like `formatReportDate`.
- Copy: "My school isn't listed", "My field isn't listed", "Add a secondary field of study", "I transferred", "Add a previous school", "Expected graduation", "Graduated or left", "Every athlete picked from the lists."
- The database enforces the same rules as the forms; a bypassed form can't store bad data.
- SQL runs in Supabase before the code that needs it is pushed. The migration must not break the code currently live (it still reads and writes `profiles.college` and `profiles.degree`).
- The check script uses test accounts only.
- Follow existing patterns: Tailwind classes as in `ProfileForm.tsx`, red error text `text-sm text-red-600`, pure logic in `src/lib` with a `.test.ts` beside it.

## Review Focus

- **A saved year outside the menu range** (an athlete who started in 2012): the year menu must still show and keep 2012, not silently blank it. Pinned in Task 4 (`yearOptions` test).
- **Whitespace-only "not listed" answers or "Other" degree text**: rejected by validation, trimmed before saving. Pinned in Task 4 (`validateEducation` and `formToEducationPayload` tests) and by the database checks in Task 1.
- **Transfer leave date before the old school's start date**: a clear message, not a raw database error. Pinned in Task 4 (`validateTransfer` test).
- **Secondary field the same as the primary**: rejected with "Pick a different field than your primary". Pinned in Task 4.
- **School names with apostrophes and quoted commas in the federal CSVs**: parsed correctly and escaped in SQL. Pinned in Task 2 (`parseCsv` and `toSql` tests).

---

## File Map

| File | Responsibility |
|---|---|
| `supabase/migrations/2026-10-12-education.sql` | Tables, rules, audit trigger, `save_profile`, report functions |
| `supabase/schema.sql` | Mirror of the live schema |
| `src/lib/referenceData.ts` (+ test) | CSV parsing and building colleges, fields, and SQL from federal files |
| `scripts/build-reference-data.ts` | Reads files, checksums, writes the SQL |
| `supabase/reference/college-nicknames.json` | Hand-kept nicknames |
| `supabase/reference/reference-data-v1.sql` | Generated list data |
| `src/lib/education.ts` (+ test) | Types, degree labels, months, form/row conversion, formatting |
| `src/lib/validateEducation.ts` (+ test) | Education and transfer validation |
| `src/lib/validateProfile.ts` (+ test) | Drops college and degree |
| `src/lib/pickerSearch.ts` (+ test) | Search matching and ranking |
| `src/components/SearchPicker.tsx` | Searchable combobox |
| `src/components/MonthYear.tsx` | Month and year dropdowns |
| `src/app/profile/EducationFields.tsx` | One school's fields, shared by current and previous |
| `src/app/profile/CurrentSchool.tsx` | Current school section with transfer |
| `src/app/profile/PreviousSchools.tsx` | Previous schools list, add, edit, remove |
| `src/app/profile/ProfileForm.tsx` | Profile plus current school, `save_profile` |
| `src/app/profile/page.tsx` | Loads lists and education rows |
| `src/lib/reports.ts` (+ test) | Report text and "not listed" grouping |
| `src/app/admin/reports/page.tsx` | New columns, Not listed table |
| `scripts/education-check.ts` | Database rule checks against the real database |
| `supabase/migrations/2026-10-12-education-backfill.sql` | Existing profiles moved over |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/2026-10-12-education.sql`
- Modify: `supabase/schema.sql` (profiles table, `admin_report_athletes`, append new sections)

**Interfaces:**
- Produces: tables `data_sources`, `colleges`, `fields_of_study`, `athlete_education`, `athlete_education_history`; functions `save_profile(p jsonb, current_education jsonb, transfer jsonb default null) returns void`, `admin_report_athletes()` (new columns), `admin_report_not_listed()`.
- `save_profile` JSON keys: `p` = `{ first_name, last_name, sport, sport_type, positions, disciplines }` (`positions`/`disciplines` are arrays or null); `current_education` = `{ college_id, college_other, degree_type, degree_other, primary_field_code, primary_field_other, secondary_field_code, secondary_field_other, start_month, start_year, end_month, end_year }`; `transfer` = `{ end_month, end_year }` or null.

No unit tests for SQL; Task 10's `education-check` script tests these rules against the real database. This task is verified by Todd running it cleanly.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/2026-10-12-education.sql`:

```sql
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
```

- [ ] **Step 2: Mirror it in `supabase/schema.sql`**

1. Line 2: change "as of 2026-10-05" to "as of 2026-10-12".
2. In `create table profiles`, change `college      text not null,` to `college      text,  -- old free text, replaced by athlete_education` and `degree       text not null,` to `degree       text,  -- old free text, replaced by athlete_education`.
3. Replace the whole `create function admin_report_athletes()` block and its two `revoke`/`grant` lines with the new `admin_report_athletes()` definition from Step 1 (without the `drop function` line).
4. Append everything in Step 1 from `-- Reference lists` to the end, except the two `alter table profiles` lines, the `drop function admin_report_athletes();` line, and the new `admin_report_athletes()` block (already placed in item 3), under a heading comment `-- Education (2026-10-12) ------------------------------------------------`.

- [ ] **Step 3: Check for em dashes**

Run: `grep -n "—" supabase/migrations/2026-10-12-education.sql supabase/schema.sql`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-10-12-education.sql supabase/schema.sql
git commit -m "Add education tables, audit trail, save_profile, and report functions"
```

- [ ] **Step 5: Todd runs the migration**

Todd pastes `supabase/migrations/2026-10-12-education.sql` into Supabase → SQL Editor and runs it. Expected: "Success. No rows returned". Then the live site's Reports page still loads (it reads the old columns, which are still returned).

---

### Task 2: Reference data library

**Files:**
- Create: `src/lib/referenceData.ts`
- Test: `src/lib/referenceData.test.ts`

**Interfaces:**
- Produces:
  - `parseCsv(text: string): Record<string, string>[]`
  - `splitAliases(alias: string): string[]`
  - `buildColleges(hd: Record<string, string>[], ic: Record<string, string>[], states: string[], extraNicknames: Record<string, string[]>): CollegeRow[]`
  - `buildFieldsOfStudy(cip: Record<string, string>[]): FieldRow[]`
  - `toSql(input: { sources: SourceRow[]; colleges: CollegeRow[]; fields: FieldRow[]; collegeSourceId: string; fieldSourceId: string; header: string }): string`
  - `interface CollegeRow { id: number; name: string; city: string; state: string; athleticAssociations: string[]; nicknames: string[] }`
  - `interface FieldRow { code: string; title: string; familyCode: string }`
  - `interface SourceRow { id: string; publisher: string; dataset: string; edition: string; url: string | null; retrievedOn: string; checksum: string | null; notes: string }`
  - `EXCLUDED_CIP_FAMILIES: string[]`

Sample CSV text is written inline in the test, which keeps each case next to its assertion (the spec mentioned a fixtures folder; inline strings do the same job with less indirection).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/referenceData.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildColleges,
  buildFieldsOfStudy,
  parseCsv,
  splitAliases,
  toSql,
  type CollegeRow,
  type FieldRow,
  type SourceRow,
} from './referenceData';

describe('parseCsv', () => {
  it('reads a header row and quoted fields with commas and doubled quotes', () => {
    const rows = parseCsv(
      '\uFEFFUNITID,INSTNM,CITY\r\n1,"Saint Mary\'s College, Omaha","Say ""Hi"""\r\n'
    );
    expect(rows).toEqual([
      { UNITID: '1', INSTNM: "Saint Mary's College, Omaha", CITY: 'Say "Hi"' },
    ]);
  });

  it('keeps newlines inside quoted fields and skips blank lines', () => {
    const rows = parseCsv('A,B\n"line one\nline two",x\n\n');
    expect(rows).toEqual([{ A: 'line one\nline two', B: 'x' }]);
  });

  it('reads Excel-style ="..." cells as the text with a leading =', () => {
    const rows = parseCsv('CIPCode,CIPTitle\n="11.07","Computer Science."\n');
    expect(rows[0].CIPCode).toBe('=11.07');
  });
});

describe('splitAliases', () => {
  it('splits on | and on runs of two or more spaces, dropping blanks', () => {
    expect(splitAliases('UNK|University of Nebraska - Kearney|Nebraska Kearney|')).toEqual([
      'UNK',
      'University of Nebraska - Kearney',
      'Nebraska Kearney',
    ]);
    expect(splitAliases('Concordia Teachers College  Concordia College')).toEqual([
      'Concordia Teachers College',
      'Concordia College',
    ]);
    expect(splitAliases(' ')).toEqual([]);
  });
});

const HD = parseCsv(
  [
    'UNITID,INSTNM,IALIAS,CITY,STABBR',
    '181394,University of Nebraska at Omaha,UNOMAHA,Omaha,NE',
    '153630,Iowa Western Community College, ,Council Bluffs,IA',
    '999001,Beauty School of Lincoln, ,Lincoln,NE',
    '100654,Alabama A & M University,AAMU,Normal,AL',
  ].join('\n')
);

const IC = parseCsv(
  [
    'UNITID,ATHASSOC,ASSOC1,ASSOC2,ASSOC3,ASSOC4,ASSOC5,ASSOC6',
    '181394,1,1,2,2,2,2,2',
    '153630,1,2,2,1,2,2,2',
    '999001,2,-2,-2,-2,-2,-2,-2',
    '100654,1,1,2,2,2,2,2',
  ].join('\n')
);

describe('buildColleges', () => {
  const colleges = buildColleges(HD, IC, ['NE', 'KS', 'IA', 'ND', 'SD'], {
    '181394': ['UNO', 'unomaha', 'Omaha'],
  });

  it('keeps only schools in the given states with an athletic association', () => {
    expect(colleges.map((c) => c.id)).toEqual([153630, 181394]);
  });

  it('sorts by state, then name', () => {
    expect(colleges.map((c) => c.state)).toEqual(['IA', 'NE']);
  });

  it('maps ASSOC1 to ASSOC6 to association names', () => {
    expect(colleges.find((c) => c.id === 181394)?.athleticAssociations).toEqual(['NCAA']);
    expect(colleges.find((c) => c.id === 153630)?.athleticAssociations).toEqual(['NJCAA']);
  });

  it('merges federal aliases with hand-kept nicknames, ignoring case duplicates', () => {
    expect(colleges.find((c) => c.id === 181394)?.nicknames).toEqual(['UNOMAHA', 'UNO', 'Omaha']);
    expect(colleges.find((c) => c.id === 153630)?.nicknames).toEqual([]);
  });
});

describe('buildFieldsOfStudy', () => {
  const cip = parseCsv(
    [
      'CIPFamily,CIPCode,Action,CIPTitle',
      '="11",="11","No substantive changes","COMPUTER AND INFORMATION SCIENCES."',
      '="11",="11.07","No substantive changes","Computer Science."',
      '="11",="11.0701","No substantive changes","Computer Science."',
      '="52",="52.03","New","Accounting and Related Services."',
      '="32",="32.01","No substantive changes","Basic Skills and Developmental/Remedial Education, General."',
      '="60",="60.01","No substantive changes","Dental Residency/Fellowship Programs."',
      '="13",="13.99","Deleted","Old Education Code."',
      '="13",="13.98","Moved to","Moved Education Code."',
    ].join('\n')
  );
  const fields = buildFieldsOfStudy(cip);

  it('keeps only 4-digit codes outside excluded families, minus deleted and moved codes', () => {
    expect(fields.map((f) => f.code)).toEqual(['11.07', '52.03']);
  });

  it('strips the = wrapper and the trailing period, and records the family', () => {
    expect(fields[0]).toEqual({ code: '11.07', title: 'Computer Science', familyCode: '11' });
  });
});

describe('toSql', () => {
  const sources: SourceRow[] = [
    {
      id: 'ipeds-2024',
      publisher: 'NCES, U.S. Department of Education',
      dataset: "IPEDS Directory (HD2024)",
      edition: '2024-25 collection',
      url: 'https://example.gov/HD2024.zip',
      retrievedOn: '2026-10-12',
      checksum: 'abc',
      notes: "Schools' data",
    },
  ];
  const colleges: CollegeRow[] = [
    {
      id: 1,
      name: "Saint Mary's College",
      city: 'Omaha',
      state: 'NE',
      athleticAssociations: ['NAIA', 'NCCAA'],
      nicknames: [],
    },
  ];
  const fields: FieldRow[] = [{ code: '11.07', title: 'Computer Science', familyCode: '11' }];
  const sql = toSql({
    sources,
    colleges,
    fields,
    collegeSourceId: 'ipeds-2024',
    fieldSourceId: 'cip-2020',
    header: '-- test header',
  });

  it('escapes single quotes', () => {
    expect(sql).toContain("'Saint Mary''s College'");
    expect(sql).toContain("'Schools'' data'");
  });

  it('writes arrays and empty arrays as text[]', () => {
    expect(sql).toContain("array['NAIA', 'NCCAA']::text[]");
    expect(sql).toContain("'{}'::text[]");
  });

  it('upserts so it can be re-run', () => {
    expect(sql).toContain('on conflict (id) do update set');
    expect(sql).toContain('on conflict (code) do update set');
  });

  it('starts with the header and inserts sources before the lists that point to them', () => {
    expect(sql.startsWith('-- test header')).toBe(true);
    expect(sql.indexOf('insert into data_sources')).toBeLessThan(sql.indexOf('insert into colleges'));
    expect(sql).toContain("'11.07', 'Computer Science', '11', 'cip-2020'");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/lib/referenceData.test.ts`
Expected: FAIL, "Failed to resolve import './referenceData'".

- [ ] **Step 3: Write the library**

Create `src/lib/referenceData.ts`:

```ts
// Turns the federal downloads (IPEDS HD and IC, CIP 2020) into the colleges and
// fields of study lists, and the SQL that loads them. Used by
// scripts/build-reference-data.ts; the filters are described in the education spec.

export interface CollegeRow {
  id: number;
  name: string;
  city: string;
  state: string;
  athleticAssociations: string[];
  nicknames: string[];
}

export interface FieldRow {
  code: string;
  title: string;
  familyCode: string;
}

export interface SourceRow {
  id: string;
  publisher: string;
  dataset: string;
  edition: string;
  url: string | null;
  retrievedOn: string;
  checksum: string | null;
  notes: string;
}

const ASSOCIATION_COLUMNS: [string, string][] = [
  ['ASSOC1', 'NCAA'],
  ['ASSOC2', 'NAIA'],
  ['ASSOC3', 'NJCAA'],
  ['ASSOC4', 'NSCAA'],
  ['ASSOC5', 'NCCAA'],
  ['ASSOC6', 'Other'],
];

// Families that aren't college majors: reserved, personal and basic skills,
// high school diplomas, medical residencies.
export const EXCLUDED_CIP_FAMILIES = ['21', '32', '33', '34', '35', '36', '37', '53', '55', '60', '61'];

export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header = [], ...body] = rows;
  const keys = header.map((h) => h.trim());
  return body
    .filter((values) => values.some((v) => v.trim() !== ''))
    .map((values) => Object.fromEntries(keys.map((key, j) => [key, values[j] ?? ''])));
}

export function splitAliases(alias: string): string[] {
  return alias
    .split(/\||\s{2,}/)
    .map((a) => a.trim())
    .filter(Boolean);
}

function uniqueIgnoringCase(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const key = v.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildColleges(
  hd: Record<string, string>[],
  ic: Record<string, string>[],
  states: string[],
  extraNicknames: Record<string, string[]>
): CollegeRow[] {
  const icById = new Map(ic.map((r) => [r.UNITID, r]));

  return hd
    .filter((r) => states.includes(r.STABBR) && icById.get(r.UNITID)?.ATHASSOC === '1')
    .map((r) => {
      const ic = icById.get(r.UNITID)!;
      return {
        id: Number(r.UNITID),
        name: r.INSTNM.trim(),
        city: r.CITY.trim(),
        state: r.STABBR,
        athleticAssociations: ASSOCIATION_COLUMNS.filter(([col]) => ic[col] === '1').map(
          ([, name]) => name
        ),
        nicknames: uniqueIgnoringCase([
          ...splitAliases(r.IALIAS ?? ''),
          ...(extraNicknames[r.UNITID] ?? []),
        ]),
      };
    })
    .sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
}

// CIP cells come wrapped as ="11.07" so Excel keeps the leading zero.
function cleanCipCode(value: string): string {
  return value.replace(/^=?"?/, '').replace(/"$/, '').trim();
}

export function buildFieldsOfStudy(cip: Record<string, string>[]): FieldRow[] {
  return cip
    .map((r) => ({ code: cleanCipCode(r.CIPCode), action: r.Action, title: r.CIPTitle }))
    .filter(
      (r) =>
        /^\d\d\.\d\d$/.test(r.code) &&
        !EXCLUDED_CIP_FAMILIES.includes(r.code.slice(0, 2)) &&
        r.action !== 'Deleted' &&
        r.action !== 'Moved to'
    )
    .map((r) => ({
      code: r.code,
      title: r.title.trim().replace(/\.$/, ''),
      familyCode: r.code.slice(0, 2),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function text(value: string | null): string {
  return value === null ? 'null' : `'${value.replace(/'/g, "''")}'`;
}

function textArray(values: string[]): string {
  return values.length === 0 ? "'{}'::text[]" : `array[${values.map(text).join(', ')}]::text[]`;
}

export function toSql(input: {
  sources: SourceRow[];
  colleges: CollegeRow[];
  fields: FieldRow[];
  collegeSourceId: string;
  fieldSourceId: string;
  header: string;
}): string {
  const sourceValues = input.sources.map(
    (s) =>
      `  (${text(s.id)}, ${text(s.publisher)}, ${text(s.dataset)}, ${text(s.edition)}, ${text(s.url)}, ${text(s.retrievedOn)}, ${text(s.checksum)}, ${text(s.notes)})`
  );
  const collegeValues = input.colleges.map(
    (c) =>
      `  (${c.id}, ${text(c.name)}, ${text(c.city)}, ${text(c.state)}, ${textArray(c.athleticAssociations)}, ${textArray(c.nicknames)}, ${text(input.collegeSourceId)})`
  );
  const fieldValues = input.fields.map(
    (f) => `  (${text(f.code)}, ${text(f.title)}, ${text(f.familyCode)}, ${text(input.fieldSourceId)})`
  );

  return [
    input.header,
    '',
    'insert into data_sources (id, publisher, dataset, edition, url, retrieved_on, checksum, notes) values',
    sourceValues.join(',\n'),
    'on conflict (id) do update set',
    '  publisher = excluded.publisher, dataset = excluded.dataset, edition = excluded.edition,',
    '  url = excluded.url, retrieved_on = excluded.retrieved_on, checksum = excluded.checksum,',
    '  notes = excluded.notes;',
    '',
    'insert into colleges (id, name, city, state, athletic_associations, nicknames, source_id) values',
    collegeValues.join(',\n'),
    'on conflict (id) do update set',
    '  name = excluded.name, city = excluded.city, state = excluded.state,',
    '  athletic_associations = excluded.athletic_associations, nicknames = excluded.nicknames,',
    '  source_id = excluded.source_id;',
    '',
    'insert into fields_of_study (code, title, family_code, source_id) values',
    fieldValues.join(',\n'),
    'on conflict (code) do update set',
    '  title = excluded.title, family_code = excluded.family_code, source_id = excluded.source_id;',
    '',
  ].join('\n');
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/lib/referenceData.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/referenceData.ts src/lib/referenceData.test.ts
git commit -m "Add reference data parsing and SQL building for colleges and fields of study"
```

---

### Task 3: Build script, nicknames, and generated list data

**Files:**
- Create: `scripts/build-reference-data.ts`
- Create: `supabase/reference/college-nicknames.json`
- Create (generated): `supabase/reference/reference-data-v1.sql`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: everything Task 2 produces.
- Produces: `supabase/reference/reference-data-v1.sql` with `data_sources` ids `ipeds-2024`, `cip-2020`, `pi-nicknames-v1`.

- [ ] **Step 1: Write the nicknames file**

Create `supabase/reference/college-nicknames.json` (keys are IPEDS UNITIDs):

```json
{
  "181464": ["UNL", "Huskers"],
  "181394": ["UNO", "Omaha"],
  "181215": ["UNK"],
  "153603": ["ISU", "Iowa State"],
  "154095": ["UNI"],
  "155317": ["KU"],
  "155399": ["K-State", "KSU"],
  "219356": ["SDSU"],
  "219471": ["USD"],
  "200332": ["NDSU"],
  "200280": ["UND"],
  "153630": ["IWCC", "Iowa Western"],
  "153214": ["DMACC"]
}
```

- [ ] **Step 2: Write the script**

Create `scripts/build-reference-data.ts`:

```ts
// Builds supabase/reference/reference-data-v1.sql from the federal downloads.
// The folder must hold HD2024.zip and IC2024.zip (for checksums), the HD2024.csv and
// IC2024.csv inside them, and CIPCode2020.csv. Download links are in the education spec.
// To add states, change STATES and re-run; the SQL upserts, so existing links survive.
// Usage: npm run build-reference-data -- <folder>

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildColleges,
  buildFieldsOfStudy,
  parseCsv,
  toSql,
  type SourceRow,
} from '../src/lib/referenceData';

const STATES = ['NE', 'KS', 'IA', 'ND', 'SD'];
const RETRIEVED_ON = '2026-10-12';
const OUTPUT = 'supabase/reference/reference-data-v1.sql';
const NICKNAMES = 'supabase/reference/college-nicknames.json';

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function main() {
  const folder = process.argv[2];
  if (!folder) {
    console.error('Usage: npm run build-reference-data -- <folder with the federal files>');
    process.exit(1);
  }

  const hd = parseCsv(readFileSync(join(folder, 'HD2024.csv'), 'utf8'));
  const ic = parseCsv(readFileSync(join(folder, 'IC2024.csv'), 'utf8'));
  const cip = parseCsv(readFileSync(join(folder, 'CIPCode2020.csv'), 'utf8'));
  const nicknames = JSON.parse(readFileSync(NICKNAMES, 'utf8')) as Record<string, string[]>;

  const colleges = buildColleges(hd, ic, STATES, nicknames);
  const fields = buildFieldsOfStudy(cip);

  const missing = Object.keys(nicknames).filter((id) => !colleges.some((c) => String(c.id) === id));
  if (missing.length > 0) {
    console.warn(`Nicknames for schools not in the list (check the IDs): ${missing.join(', ')}`);
  }

  const sources: SourceRow[] = [
    {
      id: 'ipeds-2024',
      publisher: 'NCES, U.S. Department of Education',
      dataset:
        'IPEDS Institutional Characteristics: Directory Information (HD2024) and Educational offerings, organization, services and athletic associations (IC2024)',
      edition: '2024-25 collection',
      url: 'https://nces.ed.gov/ipeds/datacenter/data/HD2024.zip; https://nces.ed.gov/ipeds/datacenter/data/IC2024.zip',
      retrievedOn: RETRIEVED_ON,
      checksum: `HD2024.zip ${sha256(join(folder, 'HD2024.zip'))}; IC2024.zip ${sha256(join(folder, 'IC2024.zip'))}`,
      notes: `States ${STATES.join(', ')}; schools reporting membership in a national athletic association (IC2024 ATHASSOC = 1). Associations from IC2024 ASSOC1 to ASSOC6 as reported by each school to the Department of Education, not from the associations themselves.`,
    },
    {
      id: 'cip-2020',
      publisher: 'NCES, U.S. Department of Education',
      dataset: 'Classification of Instructional Programs (CIP)',
      edition: 'CIP 2020',
      url: 'https://nces.ed.gov/ipeds/cipcode/Files/CIPCode2020.csv',
      retrievedOn: RETRIEVED_ON,
      checksum: `CIPCode2020.csv ${sha256(join(folder, 'CIPCode2020.csv'))}`,
      notes:
        '4-digit codes only. Dropped: codes marked Deleted or Moved to, and families 21, 32 to 37, 53, 55, 60, 61 (not college majors).',
    },
    {
      id: 'pi-nicknames-v1',
      publisher: 'Proven Impact',
      dataset: 'Hand-kept school nicknames for search (supabase/reference/college-nicknames.json)',
      edition: 'v1',
      url: null,
      retrievedOn: RETRIEVED_ON,
      checksum: null,
      notes: 'Added to the IPEDS aliases, which are incomplete (for example UNO is listed only as UNOMAHA).',
    },
  ];

  const header = [
    '-- Reference lists for the education pick-lists. GENERATED by',
    '-- scripts/build-reference-data.ts; do not edit by hand, re-run the script.',
    `-- ${colleges.length} colleges (${STATES.join(', ')}), ${fields.length} fields of study.`,
    '-- Safe to re-run: rows are upserted.',
  ].join('\n');

  writeFileSync(
    OUTPUT,
    toSql({ sources, colleges, fields, collegeSourceId: 'ipeds-2024', fieldSourceId: 'cip-2020', header })
  );

  for (const state of STATES) {
    console.log(`${state}: ${colleges.filter((c) => c.state === state).length} colleges`);
  }
  console.log(`Colleges: ${colleges.length}. Fields of study: ${fields.length}. Wrote ${OUTPUT}.`);
}

main();
```

- [ ] **Step 3: Add the npm scripts**

In `package.json` `"scripts"`, after `"rubric-check"`, add:

```json
    "build-reference-data": "tsx scripts/build-reference-data.ts",
    "education-check": "tsx --env-file=.env.local scripts/education-check.ts"
```

(`education-check` is written in Task 10; adding it now keeps `package.json` to one edit.)

- [ ] **Step 4: Download the federal files into the scratchpad and run the script**

Download into a new empty folder outside the repo (they are untrusted data and not committed):

```bash
D="<scratchpad>/ipeds"; mkdir -p "$D" && cd "$D"
curl -sL -o HD2024.zip https://nces.ed.gov/ipeds/datacenter/data/HD2024.zip
curl -sL -o IC2024.zip https://nces.ed.gov/ipeds/datacenter/data/IC2024.zip
curl -sL -o CIPCode2020.csv https://nces.ed.gov/ipeds/cipcode/Files/CIPCode2020.csv
unzip -o -q HD2024.zip && unzip -o -q IC2024.zip
sha256sum HD2024.zip IC2024.zip CIPCode2020.csv
```

Expected checksums (from the spec): HD2024.zip `d98425c1...28345`, IC2024.zip `924f04f0...6288`, CIPCode2020.csv `6cf0882c...2657`. If any differ, NCES has republished the file: stop and tell Todd, since the spec's counts may change.

Then from the repo: `npm run build-reference-data -- "<scratchpad>/ipeds"`

Expected output:
```
NE: 21 colleges
KS: 47 colleges
IA: 44 colleges
ND: 17 colleges
SD: 12 colleges
Colleges: 141. Fields of study: 418. Wrote supabase/reference/reference-data-v1.sql.
```
and no "Nicknames for schools not in the list" warning.

- [ ] **Step 5: Spot-check the SQL**

Run: `grep -n "University of Nebraska at Omaha\|'11.07'" supabase/reference/reference-data-v1.sql`
Expected: one line for UNO containing `array['NCAA']::text[]` and `array['UNOMAHA', 'UNO', 'Omaha']::text[]`; one line `('11.07', 'Computer Science', '11', 'cip-2020')`.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-reference-data.ts supabase/reference package.json
git commit -m "Add the reference data build script, school nicknames, and generated list data"
```

- [ ] **Step 7: Todd loads the lists**

Todd runs `supabase/reference/reference-data-v1.sql` in the Supabase SQL Editor. Then checks:

```sql
select state, count(*) from colleges group by state order by state;
select count(*) from fields_of_study;
select id, edition, retrieved_on from data_sources;
```

Expected: IA 44, KS 47, ND 17, NE 21, SD 12; 418; three source rows.

---

### Task 4: Education types, formatting, and validation

**Files:**
- Create: `src/lib/education.ts`, `src/lib/education.test.ts`
- Create: `src/lib/validateEducation.ts`, `src/lib/validateEducation.test.ts`
- Modify: `src/lib/validateProfile.ts`, `src/lib/validateProfile.test.ts`

**Interfaces:**
- Produces (`education.ts`):
  - `type DegreeType = 'AA' | 'AS' | 'AAS' | 'BA' | 'BS' | 'BFA' | 'BBA' | 'OTHER' | 'NONE'`
  - `DEGREE_TYPES: { value: DegreeType; label: string }[]`, `MONTHS: string[]`
  - `interface College { id: number; name: string; city: string; state: string; nicknames: string[] }`
  - `interface FieldOfStudy { code: string; title: string }`
  - `interface EducationRow` (snake_case columns of `athlete_education`)
  - `type EducationPayload = Omit<EducationRow, 'id' | 'athlete_id' | 'is_current'>`
  - `interface PickValue { id: string | null; other: string | null }`, `EMPTY_PICK`
  - `interface EducationFormValues { college; degreeType; degreeOther; primaryField; secondaryField; startMonth; startYear; endMonth; endYear }`
  - `emptyEducation()`, `educationToForm(row)`, `formToEducationPayload(values)`
  - `yearOptions(thisYear: number, saved?: (number | null)[]): number[]`
  - `formatMonthYear(month: number, year: number, style?: 'long' | 'short'): string`
  - `degreeShort(type: DegreeType, other: string | null): string`
  - `schoolName(row: EducationRow, colleges: Map<number, College>): string`
  - `educationLine(row: EducationRow, colleges: Map<number, College>): string`
- Produces (`validateEducation.ts`):
  - `type EducationErrorKey = 'college' | 'degreeType' | 'degreeOther' | 'primaryField' | 'secondaryField' | 'start' | 'end'`
  - `interface EducationValidation { valid: boolean; errors: Partial<Record<EducationErrorKey, string>> }`
  - `validateEducation(values: EducationFormValues, options: { isCurrent: boolean }): EducationValidation`
  - `validateTransfer(current: EducationRow, month: number | null, year: number | null): string | null`
- Changes: `ProfileFormValues` loses `college` and `degree`.

- [ ] **Step 1: Write the failing tests for `education.ts`**

Create `src/lib/education.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  degreeShort,
  educationLine,
  educationToForm,
  emptyEducation,
  formatMonthYear,
  formToEducationPayload,
  schoolName,
  yearOptions,
  type College,
  type EducationFormValues,
  type EducationRow,
} from './education';

const IOWA_WESTERN: College = {
  id: 153630,
  name: 'Iowa Western Community College',
  city: 'Council Bluffs',
  state: 'IA',
  nicknames: [],
};
const colleges = new Map([[IOWA_WESTERN.id, IOWA_WESTERN]]);

function row(overrides: Partial<EducationRow> = {}): EducationRow {
  return {
    id: 'e1',
    athlete_id: 'a1',
    college_id: 153630,
    college_other: null,
    degree_type: 'AA',
    degree_other: null,
    primary_field_code: '24.01',
    primary_field_other: null,
    secondary_field_code: null,
    secondary_field_other: null,
    start_month: 8,
    start_year: 2023,
    end_month: 5,
    end_year: 2025,
    is_current: false,
    ...overrides,
  };
}

describe('yearOptions', () => {
  it('runs from ten years back to six ahead, oldest first', () => {
    const years = yearOptions(2026);
    expect(years[0]).toBe(2016);
    expect(years[years.length - 1]).toBe(2032);
    expect(years).toHaveLength(17);
  });

  it('keeps a saved year outside the range so it still shows', () => {
    expect(yearOptions(2026, [2012, null])[0]).toBe(2012);
    expect(yearOptions(2026, [2012]).filter((y) => y === 2012)).toHaveLength(1);
  });
});

describe('formatMonthYear', () => {
  it('formats long and short', () => {
    expect(formatMonthYear(5, 2027)).toBe('May 2027');
    expect(formatMonthYear(8, 2023, 'short')).toBe('Aug 2023');
  });
});

describe('degreeShort', () => {
  it('uses the code, the typed text for Other, and words for No degree', () => {
    expect(degreeShort('BS', null)).toBe('BS');
    expect(degreeShort('OTHER', 'BSN')).toBe('BSN');
    expect(degreeShort('NONE', null)).toBe('No degree');
  });
});

describe('schoolName and educationLine', () => {
  it('describes a listed school with city, degree, and dates', () => {
    expect(educationLine(row(), colleges)).toBe(
      'Iowa Western Community College · Council Bluffs, IA · AA · Aug 2023 to May 2025'
    );
  });

  it('uses the typed name for a school that is not listed', () => {
    const typed = row({ college_id: null, college_other: 'Hometown CC' });
    expect(schoolName(typed, colleges)).toBe('Hometown CC');
    expect(educationLine(typed, colleges)).toBe('Hometown CC · AA · Aug 2023 to May 2025');
  });
});

describe('educationToForm and formToEducationPayload', () => {
  it('round-trips a row', () => {
    const original = row({ secondary_field_other: 'Coaching' });
    const payload = formToEducationPayload(educationToForm(original));
    // Every payload value matches the row, and the payload has all 12 editable columns.
    expect({ ...original, ...payload }).toEqual(original);
    expect(Object.keys(payload)).toHaveLength(12);
  });

  it('hides the secondary field when the row has none', () => {
    expect(educationToForm(row()).secondaryField).toBeNull();
  });

  it('trims typed answers and drops degree text unless the degree is Other', () => {
    const values: EducationFormValues = {
      ...emptyEducation(),
      college: { id: null, other: '  Hometown CC  ' },
      degreeType: 'BS',
      degreeOther: 'leftover',
      primaryField: { id: '11.07', other: null },
      startMonth: 8,
      startYear: 2023,
      endMonth: 5,
      endYear: 2027,
    };
    const payload = formToEducationPayload(values);
    expect(payload.college_other).toBe('Hometown CC');
    expect(payload.college_id).toBeNull();
    expect(payload.degree_other).toBeNull();
    expect(payload.secondary_field_code).toBeNull();
    expect(payload.secondary_field_other).toBeNull();
  });

  it('turns a picked school id back into a number', () => {
    const values: EducationFormValues = {
      ...emptyEducation(),
      college: { id: '181394', other: null },
      degreeType: 'BS',
      primaryField: { id: '11.07', other: null },
      startMonth: 8,
      startYear: 2023,
      endMonth: 5,
      endYear: 2027,
    };
    expect(formToEducationPayload(values).college_id).toBe(181394);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/education.test.ts`
Expected: FAIL, "Failed to resolve import './education'".

- [ ] **Step 3: Write `education.ts`**

Create `src/lib/education.ts`:

```ts
// Education pick-lists: types, labels, and formatting shared by the profile and reports.

export type DegreeType = 'AA' | 'AS' | 'AAS' | 'BA' | 'BS' | 'BFA' | 'BBA' | 'OTHER' | 'NONE';

export const DEGREE_TYPES: { value: DegreeType; label: string }[] = [
  { value: 'AA', label: 'Associate of Arts (AA)' },
  { value: 'AS', label: 'Associate of Science (AS)' },
  { value: 'AAS', label: 'Associate of Applied Science (AAS)' },
  { value: 'BA', label: 'Bachelor of Arts (BA)' },
  { value: 'BS', label: 'Bachelor of Science (BS)' },
  { value: 'BFA', label: 'Bachelor of Fine Arts (BFA)' },
  { value: 'BBA', label: 'Bachelor of Business Administration (BBA)' },
  { value: 'OTHER', label: 'Other (type it in)' },
  { value: 'NONE', label: 'No degree (previous schools only)' },
];

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface College {
  id: number;
  name: string;
  city: string;
  state: string;
  nicknames: string[];
}

export interface FieldOfStudy {
  code: string;
  title: string;
}

export interface EducationRow {
  id: string;
  athlete_id: string;
  college_id: number | null;
  college_other: string | null;
  degree_type: DegreeType;
  degree_other: string | null;
  primary_field_code: string | null;
  primary_field_other: string | null;
  secondary_field_code: string | null;
  secondary_field_other: string | null;
  start_month: number;
  start_year: number;
  end_month: number;
  end_year: number;
  is_current: boolean;
}

export type EducationPayload = Omit<EducationRow, 'id' | 'athlete_id' | 'is_current'>;

// A pick from a searchable list. `other` is non-null once "not listed" is chosen.
export interface PickValue {
  id: string | null;
  other: string | null;
}

export const EMPTY_PICK: PickValue = { id: null, other: null };

export interface EducationFormValues {
  college: PickValue;
  degreeType: DegreeType | '';
  degreeOther: string;
  primaryField: PickValue;
  secondaryField: PickValue | null; // null until "Add a secondary field of study"
  startMonth: number | null;
  startYear: number | null;
  endMonth: number | null;
  endYear: number | null;
}

export function emptyEducation(): EducationFormValues {
  return {
    college: EMPTY_PICK,
    degreeType: '',
    degreeOther: '',
    primaryField: EMPTY_PICK,
    secondaryField: null,
    startMonth: null,
    startYear: null,
    endMonth: null,
    endYear: null,
  };
}

function toPick(id: string | number | null, other: string | null): PickValue {
  return { id: id === null ? null : String(id), other };
}

export function educationToForm(row: EducationRow): EducationFormValues {
  const hasSecondary = row.secondary_field_code !== null || row.secondary_field_other !== null;
  return {
    college: toPick(row.college_id, row.college_other),
    degreeType: row.degree_type,
    degreeOther: row.degree_other ?? '',
    primaryField: toPick(row.primary_field_code, row.primary_field_other),
    secondaryField: hasSecondary
      ? toPick(row.secondary_field_code, row.secondary_field_other)
      : null,
    startMonth: row.start_month,
    startYear: row.start_year,
    endMonth: row.end_month,
    endYear: row.end_year,
  };
}

function pickedId(pick: PickValue | null): string | null {
  return pick && pick.other === null ? pick.id : null;
}

function typedAnswer(pick: PickValue | null): string | null {
  return pick && pick.other !== null ? pick.other.trim() || null : null;
}

// Call only after validateEducation passes, so the degree and dates are set.
export function formToEducationPayload(values: EducationFormValues): EducationPayload {
  const collegeId = pickedId(values.college);
  return {
    college_id: collegeId === null ? null : Number(collegeId),
    college_other: typedAnswer(values.college),
    degree_type: values.degreeType as DegreeType,
    degree_other: values.degreeType === 'OTHER' ? values.degreeOther.trim() : null,
    primary_field_code: pickedId(values.primaryField),
    primary_field_other: typedAnswer(values.primaryField),
    secondary_field_code: pickedId(values.secondaryField),
    secondary_field_other: typedAnswer(values.secondaryField),
    start_month: values.startMonth as number,
    start_year: values.startYear as number,
    end_month: values.endMonth as number,
    end_year: values.endYear as number,
  };
}

// Ten years back to six ahead, plus any saved year outside that range so it still shows.
export function yearOptions(thisYear: number, saved: (number | null)[] = []): number[] {
  const years = new Set<number>();
  for (let year = thisYear - 10; year <= thisYear + 6; year++) {
    years.add(year);
  }
  for (const year of saved) {
    if (year !== null) years.add(year);
  }
  return [...years].sort((a, b) => a - b);
}

export function formatMonthYear(month: number, year: number, style: 'long' | 'short' = 'long'): string {
  const name = MONTHS[month - 1] ?? '';
  return `${style === 'short' ? name.slice(0, 3) : name} ${year}`;
}

export function degreeShort(type: DegreeType, other: string | null): string {
  if (type === 'NONE') return 'No degree';
  if (type === 'OTHER') return other ?? 'Other';
  return type;
}

export function schoolName(row: EducationRow, colleges: Map<number, College>): string {
  if (row.college_id === null) return row.college_other ?? '';
  return colleges.get(row.college_id)?.name ?? 'Unknown school';
}

export function educationLine(row: EducationRow, colleges: Map<number, College>): string {
  const college = row.college_id === null ? undefined : colleges.get(row.college_id);
  const dates = `${formatMonthYear(row.start_month, row.start_year, 'short')} to ${formatMonthYear(row.end_month, row.end_year, 'short')}`;
  return [
    schoolName(row, colleges),
    college ? `${college.city}, ${college.state}` : '',
    degreeShort(row.degree_type, row.degree_other),
    dates,
  ]
    .filter(Boolean)
    .join(' · ');
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/lib/education.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for `validateEducation.ts`**

Create `src/lib/validateEducation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emptyEducation, type EducationFormValues, type EducationRow } from './education';
import { validateEducation, validateTransfer } from './validateEducation';

function values(overrides: Partial<EducationFormValues> = {}): EducationFormValues {
  return {
    ...emptyEducation(),
    college: { id: '181394', other: null },
    degreeType: 'BS',
    primaryField: { id: '11.07', other: null },
    startMonth: 8,
    startYear: 2023,
    endMonth: 5,
    endYear: 2027,
    ...overrides,
  };
}

const current = { isCurrent: true };
const previous = { isCurrent: false };

describe('validateEducation', () => {
  it('passes a complete current school', () => {
    expect(validateEducation(values(), current)).toEqual({ valid: true, errors: {} });
  });

  it('requires a school, and text when "not listed" is chosen', () => {
    expect(validateEducation(values({ college: { id: null, other: null } }), current).errors.college).toBe(
      'Pick your school'
    );
    expect(validateEducation(values({ college: { id: null, other: '   ' } }), current).errors.college).toBe(
      'Type your school'
    );
    expect(validateEducation(values({ college: { id: null, other: 'Hometown CC' } }), current).valid).toBe(true);
  });

  it('requires a degree, and text for Other', () => {
    expect(validateEducation(values({ degreeType: '' }), current).errors.degreeType).toBe('Select a degree');
    expect(
      validateEducation(values({ degreeType: 'OTHER', degreeOther: '  ' }), current).errors.degreeOther
    ).toBe('Type your degree');
  });

  it('allows No degree only on a previous school, where the field is optional', () => {
    const noDegree = values({ degreeType: 'NONE', primaryField: { id: null, other: null } });
    expect(validateEducation(noDegree, current).errors.degreeType).toBe(
      'Select the degree you are working toward'
    );
    expect(validateEducation(noDegree, previous).valid).toBe(true);
  });

  it('requires a primary field', () => {
    expect(
      validateEducation(values({ primaryField: { id: null, other: null } }), current).errors.primaryField
    ).toBe('Pick your field of study');
  });

  it('checks the secondary field only when it was added', () => {
    expect(validateEducation(values({ secondaryField: null }), current).valid).toBe(true);
    expect(
      validateEducation(values({ secondaryField: { id: null, other: null } }), current).errors.secondaryField
    ).toBe('Pick your secondary field of study');
  });

  it('rejects a secondary field that matches the primary', () => {
    expect(
      validateEducation(values({ secondaryField: { id: '11.07', other: null } }), current).errors.secondaryField
    ).toBe('Pick a different field than your primary');
    expect(
      validateEducation(
        values({ primaryField: { id: null, other: 'Esports' }, secondaryField: { id: null, other: ' esports ' } }),
        current
      ).errors.secondaryField
    ).toBe('Pick a different field than your primary');
  });

  it('requires both dates, with wording for current and previous schools', () => {
    expect(validateEducation(values({ startYear: null }), current).errors.start).toBe(
      'Select the month and year you started'
    );
    expect(validateEducation(values({ endMonth: null }), current).errors.end).toBe(
      'Select your expected graduation month and year'
    );
    expect(validateEducation(values({ endMonth: null }), previous).errors.end).toBe(
      'Select the month and year you graduated or left'
    );
  });

  it('rejects an end before the start, but allows the same month', () => {
    expect(validateEducation(values({ endYear: 2023, endMonth: 7 }), current).errors.end).toBe(
      "Graduation can't be before you started"
    );
    expect(validateEducation(values({ endYear: 2023, endMonth: 7 }), previous).errors.end).toBe(
      "This can't be before you started"
    );
    expect(validateEducation(values({ endYear: 2023, endMonth: 8 }), current).valid).toBe(true);
  });
});

describe('validateTransfer', () => {
  const saved = { start_month: 8, start_year: 2023 } as EducationRow;

  it('requires a month and year', () => {
    expect(validateTransfer(saved, null, 2025)).toBe('Select the month and year you left');
  });

  it('rejects leaving before starting', () => {
    expect(validateTransfer(saved, 7, 2023)).toBe("You can't leave before you started");
  });

  it('accepts a valid date', () => {
    expect(validateTransfer(saved, 5, 2025)).toBeNull();
  });
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `npx vitest run src/lib/validateEducation.test.ts`
Expected: FAIL, "Failed to resolve import './validateEducation'".

- [ ] **Step 7: Write `validateEducation.ts`**

Create `src/lib/validateEducation.ts`:

```ts
import type { EducationFormValues, EducationRow, PickValue } from './education';

export type EducationErrorKey =
  | 'college'
  | 'degreeType'
  | 'degreeOther'
  | 'primaryField'
  | 'secondaryField'
  | 'start'
  | 'end';

export interface EducationValidation {
  valid: boolean;
  errors: Partial<Record<EducationErrorKey, string>>;
}

function monthIndex(year: number, month: number): number {
  return year * 12 + month;
}

function pickError(pick: PickValue, what: string): string | undefined {
  if (pick.other !== null) return pick.other.trim() ? undefined : `Type your ${what}`;
  return pick.id ? undefined : `Pick your ${what}`;
}

function normalized(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function samePick(a: PickValue, b: PickValue): boolean {
  if (a.other === null && b.other === null) return a.id !== null && a.id === b.id;
  if (a.other !== null && b.other !== null) return normalized(a.other) === normalized(b.other);
  return false;
}

export function validateEducation(
  values: EducationFormValues,
  { isCurrent }: { isCurrent: boolean }
): EducationValidation {
  const errors: EducationValidation['errors'] = {};

  const college = pickError(values.college, 'school');
  if (college) errors.college = college;

  if (!values.degreeType) {
    errors.degreeType = 'Select a degree';
  } else if (values.degreeType === 'NONE' && isCurrent) {
    errors.degreeType = 'Select the degree you are working toward';
  } else if (values.degreeType === 'OTHER' && !values.degreeOther.trim()) {
    errors.degreeOther = 'Type your degree';
  }

  const primaryEmpty = values.primaryField.id === null && values.primaryField.other === null;
  if (!(values.degreeType === 'NONE' && primaryEmpty)) {
    const primary = pickError(values.primaryField, 'field of study');
    if (primary) errors.primaryField = primary;
  }

  if (values.secondaryField) {
    const secondary = pickError(values.secondaryField, 'secondary field of study');
    if (secondary) {
      errors.secondaryField = secondary;
    } else if (samePick(values.primaryField, values.secondaryField)) {
      errors.secondaryField = 'Pick a different field than your primary';
    }
  }

  const { startMonth, startYear, endMonth, endYear } = values;
  if (startMonth === null || startYear === null) {
    errors.start = 'Select the month and year you started';
  }
  if (endMonth === null || endYear === null) {
    errors.end = isCurrent
      ? 'Select your expected graduation month and year'
      : 'Select the month and year you graduated or left';
  } else if (
    startMonth !== null &&
    startYear !== null &&
    monthIndex(endYear, endMonth) < monthIndex(startYear, startMonth)
  ) {
    errors.end = isCurrent ? "Graduation can't be before you started" : "This can't be before you started";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateTransfer(
  current: EducationRow,
  month: number | null,
  year: number | null
): string | null {
  if (month === null || year === null) return 'Select the month and year you left';
  if (monthIndex(year, month) < monthIndex(current.start_year, current.start_month)) {
    return "You can't leave before you started";
  }
  return null;
}
```

- [ ] **Step 8: Run them to see them pass**

Run: `npx vitest run src/lib/validateEducation.test.ts`
Expected: PASS.

- [ ] **Step 9: Remove college and degree from `validateProfile`**

In `src/lib/validateProfile.ts`, delete the `college: string;` and `degree: string;` lines from `ProfileFormValues`, and delete these two lines from `validateProfile`:

```ts
  if (!values.college.trim()) errors.college = 'College is required';
```
```ts
  if (!values.degree.trim()) errors.degree = 'Degree is required';
```

In `src/lib/validateProfile.test.ts`, delete `college: 'State University',` and `degree: 'B.S. Kinesiology',` from `baseValues`, and add this test at the end of the `describe` block:

```ts
  it('no longer checks college or degree (they moved to education)', () => {
    const result = validateProfile(baseValues());
    expect(Object.keys(result.errors)).toEqual([]);
    expect('college' in baseValues()).toBe(false);
  });
```

- [ ] **Step 10: Run all tests**

Run: `npm test`
Expected: the `src/lib` tests PASS. TypeScript errors in `ProfileForm.tsx` are expected until Task 7, and Vitest does not type-check, so `npm test` passes.

- [ ] **Step 11: Commit**

```bash
git add src/lib/education.ts src/lib/education.test.ts src/lib/validateEducation.ts src/lib/validateEducation.test.ts src/lib/validateProfile.ts src/lib/validateProfile.test.ts
git commit -m "Add education types, formatting, and validation; drop college and degree from profile validation"
```

---

### Task 5: Picker search

**Files:**
- Create: `src/lib/pickerSearch.ts`, `src/lib/pickerSearch.test.ts`

**Interfaces:**
- Consumes: `College`, `FieldOfStudy` from `education.ts`.
- Produces:
  - `interface PickerOption { id: string; label: string; detail?: string; nicknames: string[] }`
  - `searchOptions(options: PickerOption[], query: string, limit?: number): PickerOption[]` (default limit 50)
  - `optionText(option: PickerOption): string` ("Name · City, ST" or the label)
  - `collegeOptions(colleges: College[]): PickerOption[]`
  - `fieldOptions(fields: FieldOfStudy[]): PickerOption[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/pickerSearch.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  collegeOptions,
  fieldOptions,
  optionText,
  searchOptions,
  type PickerOption,
} from './pickerSearch';

const options = collegeOptions([
  { id: 181394, name: 'University of Nebraska at Omaha', city: 'Omaha', state: 'NE', nicknames: ['UNOMAHA', 'UNO'] },
  { id: 181464, name: 'University of Nebraska-Lincoln', city: 'Lincoln', state: 'NE', nicknames: ['UNL'] },
  { id: 155399, name: 'Kansas State University', city: 'Manhattan', state: 'KS', nicknames: ['K-State', 'KSU'] },
  { id: 153158, name: 'Clarke University', city: 'Dubuque', state: 'IA', nicknames: [] },
  { id: 999, name: 'Unity College of Omaha', city: 'Omaha', state: 'NE', nicknames: [] },
]);

const ids = (results: PickerOption[]) => results.map((o) => o.id);

describe('searchOptions', () => {
  it('matches a nickname, ignoring case and punctuation, and lists the exact nickname first', () => {
    expect(ids(searchOptions(options, 'uno'))[0]).toBe('181394');
    expect(ids(searchOptions(options, 'U.N.O.'))[0]).toBe('181394');
  });

  it('matches on city', () => {
    expect(ids(searchOptions(options, 'manhattan'))).toEqual(['155399']);
  });

  it('requires every typed word to match somewhere', () => {
    expect(ids(searchOptions(options, 'nebraska lincoln'))).toEqual(['181464']);
    expect(ids(searchOptions(options, 'nebraska dubuque'))).toEqual([]);
  });

  it('matches words split by hyphens, and the hyphen-less spelling', () => {
    expect(ids(searchOptions(options, 'k-state'))).toEqual(['155399']);
    expect(ids(searchOptions(options, 'kstate'))).toEqual(['155399']);
  });

  it('puts names starting with the text before other matches', () => {
    const results = ids(searchOptions(options, 'uni'));
    // Unity, UNO, and UNL start with "uni"; Clarke and Kansas State only contain it.
    expect(results[0]).toBe('999');
    expect(results.slice(3)).toEqual(['153158', '155399']);
  });

  it('returns everything alphabetically for an empty query, up to the limit', () => {
    expect(ids(searchOptions(options, '  '))).toEqual(['153158', '155399', '999', '181394', '181464']);
    expect(searchOptions(options, '', 2)).toHaveLength(2);
  });
});

describe('optionText', () => {
  it('shows city and state for schools and just the title for fields', () => {
    expect(optionText(options[0])).toBe('University of Nebraska at Omaha · Omaha, NE');
    expect(optionText(fieldOptions([{ code: '11.07', title: 'Computer Science' }])[0])).toBe('Computer Science');
  });
});
```

Ties sort with `localeCompare`, which puts "Unity College of Omaha" before "University of Nebraska at Omaha" before "University of Nebraska-Lincoln" (checked in Node).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/pickerSearch.test.ts`
Expected: FAIL, "Failed to resolve import './pickerSearch'".

- [ ] **Step 3: Write `pickerSearch.ts`**

Create `src/lib/pickerSearch.ts`:

```ts
import type { College, FieldOfStudy } from './education';

export interface PickerOption {
  id: string;
  label: string;
  detail?: string; // "City, ST" for schools
  nicknames: string[];
}

// Lowercase; drop periods and apostrophes ("U.N.O." -> "uno"); other punctuation
// becomes a space ("K-State" -> "k state").
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.'\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function haystack(option: PickerOption): string {
  const text = normalize([option.label, option.detail ?? '', ...option.nicknames].join(' '));
  // Also a copy without spaces, so "kstate" finds "K-State".
  return `${text} ${text.replace(/ /g, '')}`;
}

function rank(option: PickerOption, query: string): number {
  if (option.nicknames.some((n) => normalize(n) === query)) return 0;
  if (normalize(option.label).startsWith(query)) return 1;
  return 2;
}

export function searchOptions(options: PickerOption[], query: string, limit = 50): PickerOption[] {
  const q = normalize(query);
  const words = q.split(' ').filter(Boolean);
  const byLabel = (a: PickerOption, b: PickerOption) => a.label.localeCompare(b.label);

  if (words.length === 0) {
    return [...options].sort(byLabel).slice(0, limit);
  }

  return options
    .filter((option) => {
      const text = haystack(option);
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => rank(a, q) - rank(b, q) || byLabel(a, b))
    .slice(0, limit);
}

export function optionText(option: PickerOption): string {
  return option.detail ? `${option.label} · ${option.detail}` : option.label;
}

export function collegeOptions(colleges: College[]): PickerOption[] {
  return colleges.map((c) => ({
    id: String(c.id),
    label: c.name,
    detail: `${c.city}, ${c.state}`,
    nicknames: c.nicknames,
  }));
}

export function fieldOptions(fields: FieldOfStudy[]): PickerOption[] {
  return fields.map((f) => ({ id: f.code, label: f.title, nicknames: [] }));
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/lib/pickerSearch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pickerSearch.ts src/lib/pickerSearch.test.ts
git commit -m "Add search matching and ranking for the school and field pickers"
```

---

### Task 6: Searchable picker and month-year components

**Files:**
- Create: `src/components/SearchPicker.tsx`
- Create: `src/components/MonthYear.tsx`

**Interfaces:**
- Consumes: `searchOptions`, `optionText`, `PickerOption` (Task 5); `PickValue`, `EMPTY_PICK`, `MONTHS` (Task 4).
- Produces:
  - `SearchPicker({ label, options, value, onChange, notListedLabel, otherLabel, error }: { label: string; options: PickerOption[]; value: PickValue; onChange: (value: PickValue) => void; notListedLabel: string; otherLabel: string; error?: string })`
  - `MonthYear({ label, month, year, years, onChange, error }: { label: string; month: number | null; year: number | null; years: number[]; onChange: (month: number | null, year: number | null) => void; error?: string })`

The project has no component test setup (no Testing Library); the logic these use is tested in Tasks 4 and 5, and the components are verified in the Task 12 browser walkthrough. This task is verified by type-checking and lint.

- [ ] **Step 1: Write `SearchPicker.tsx`**

Create `src/components/SearchPicker.tsx`:

```tsx
'use client';

import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { optionText, searchOptions, type PickerOption } from '@/lib/pickerSearch';
import { EMPTY_PICK, type PickValue } from '@/lib/education';

const NOT_LISTED = '__not_listed__';

// A text box that filters a list as you type (ARIA combobox pattern). The last row is
// always "not listed", which reveals a text box for the athlete's own answer.
export function SearchPicker({
  label,
  options,
  value,
  onChange,
  notListedLabel,
  otherLabel,
  error,
}: {
  label: string;
  options: PickerOption[];
  value: PickValue;
  onChange: (value: PickValue) => void;
  notListedLabel: string;
  otherLabel: string;
  error?: string;
}) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;

  // null while the athlete isn't typing, so the box shows the current pick.
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selected = value.id === null ? undefined : options.find((o) => o.id === value.id);
  const shownText = selected ? optionText(selected) : value.other !== null ? notListedLabel : '';

  const rows = useMemo(
    () => [
      ...searchOptions(options, query ?? '').map((o) => ({ id: o.id, text: optionText(o) })),
      { id: NOT_LISTED, text: notListedLabel },
    ],
    [options, query, notListedLabel]
  );

  function choose(id: string) {
    onChange(id === NOT_LISTED ? { id: null, other: value.other ?? '' } : { id, other: null });
    setQuery(null);
    setOpen(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
      } else {
        setActive((i) => Math.min(i + 1, rows.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      choose(rows[active].id);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery(null);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId}>{label}</label>
      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${baseId}-option-${active}` : undefined}
          autoComplete="off"
          placeholder="Start typing to search"
          value={query ?? shownText}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
            // Editing the box clears the earlier pick.
            if (value.id !== null || value.other !== null) onChange(EMPTY_PICK);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setQuery(null);
          }}
          onKeyDown={handleKeyDown}
          className="w-full rounded border px-3 py-2"
        />
        {open && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border bg-white shadow"
          >
            {rows.map((row, i) => (
              <li
                key={row.id}
                id={`${baseId}-option-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown, not click, so the input's blur doesn't close the list first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(row.id);
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-blue-50' : ''} ${
                  row.id === NOT_LISTED ? 'border-t text-gray-600' : ''
                }`}
              >
                {row.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      {value.other !== null && (
        <input
          aria-label={otherLabel}
          placeholder={otherLabel}
          value={value.other}
          onChange={(e) => onChange({ id: null, other: e.target.value })}
          className="rounded border px-3 py-2"
        />
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Write `MonthYear.tsx`**

Create `src/components/MonthYear.tsx`:

```tsx
import { MONTHS } from '@/lib/education';

export function MonthYear({
  label,
  month,
  year,
  years,
  onChange,
  error,
}: {
  label: string;
  month: number | null;
  year: number | null;
  years: number[];
  onChange: (month: number | null, year: number | null) => void;
  error?: string;
}) {
  const toNumber = (value: string) => (value ? Number(value) : null);

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1">{label}</legend>
      <div className="flex gap-2">
        <select
          aria-label={`${label}: month`}
          value={month ?? ''}
          onChange={(e) => onChange(toNumber(e.target.value), year)}
          className="rounded border px-3 py-2"
        >
          <option value="">Month</option>
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label}: year`}
          value={year ?? ''}
          onChange={(e) => onChange(month, toNumber(e.target.value))}
          className="rounded border px-3 py-2"
        >
          <option value="">Year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </fieldset>
  );
}
```

- [ ] **Step 3: Lint the new files**

Run: `npx eslint src/components/SearchPicker.tsx src/components/MonthYear.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/SearchPicker.tsx src/components/MonthYear.tsx
git commit -m "Add the searchable picker and month-year dropdowns"
```

---

### Task 7: Profile page with current school and transfer

**Files:**
- Create: `src/app/profile/EducationFields.tsx`
- Create: `src/app/profile/CurrentSchool.tsx`
- Modify: `src/app/profile/ProfileForm.tsx` (full replacement below)
- Modify: `src/app/profile/page.tsx`

**Interfaces:**
- Consumes: Tasks 4, 5, 6; `save_profile` (Task 1).
- Produces:
  - `EducationFields({ values, onChange, errors, colleges, fields, isCurrent, thisYear })`, used again by Task 8.
  - `ProfileForm` props: `{ userId: string; initialProfile: ProfileRow | null; showDeleteAccount: boolean; colleges: College[]; fields: FieldOfStudy[]; currentEducation: EducationRow | null; previousEducation: EducationRow[]; listsError: boolean; thisYear: number }`.
  - `ProfileForm` renders `<PreviousSchools>` (Task 8) after the form. Until Task 8 exists, Step 4 leaves that line out; Task 8 adds it.

- [ ] **Step 1: Write `EducationFields.tsx`**

Create `src/app/profile/EducationFields.tsx`:

```tsx
'use client';

import { MonthYear } from '@/components/MonthYear';
import { SearchPicker } from '@/components/SearchPicker';
import type { PickerOption } from '@/lib/pickerSearch';
import {
  DEGREE_TYPES,
  EMPTY_PICK,
  yearOptions,
  type DegreeType,
  type EducationFormValues,
} from '@/lib/education';
import type { EducationValidation } from '@/lib/validateEducation';

// One school's fields, shared by Current school and Previous schools.
export function EducationFields({
  values,
  onChange,
  errors,
  colleges,
  fields,
  isCurrent,
  thisYear,
}: {
  values: EducationFormValues;
  onChange: (values: EducationFormValues) => void;
  errors: EducationValidation['errors'];
  colleges: PickerOption[];
  fields: PickerOption[];
  isCurrent: boolean;
  thisYear: number;
}) {
  const set = (patch: Partial<EducationFormValues>) => onChange({ ...values, ...patch });
  const years = yearOptions(thisYear, [values.startYear, values.endYear]);
  const degreeChoices = DEGREE_TYPES.filter((d) => !isCurrent || d.value !== 'NONE');

  return (
    <div className="flex flex-col gap-4">
      <SearchPicker
        label="School"
        options={colleges}
        value={values.college}
        onChange={(college) => set({ college })}
        notListedLabel="My school isn't listed"
        otherLabel="Your school's name"
        error={errors.college}
      />

      <label className="flex flex-col gap-1">
        Degree
        <select
          value={values.degreeType}
          onChange={(e) => set({ degreeType: e.target.value as DegreeType | '' })}
          className="rounded border px-3 py-2"
        >
          <option value="">Select a degree</option>
          {degreeChoices.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        {errors.degreeType && <span className="text-sm text-red-600">{errors.degreeType}</span>}
      </label>

      {values.degreeType === 'OTHER' && (
        <label className="flex flex-col gap-1">
          Your degree
          <input
            value={values.degreeOther}
            onChange={(e) => set({ degreeOther: e.target.value })}
            placeholder="e.g. Bachelor of Science in Nursing (BSN)"
            className="rounded border px-3 py-2"
          />
          {errors.degreeOther && <span className="text-sm text-red-600">{errors.degreeOther}</span>}
        </label>
      )}

      <SearchPicker
        label={values.degreeType === 'NONE' ? 'Field of study (optional)' : 'Primary field of study'}
        options={fields}
        value={values.primaryField}
        onChange={(primaryField) => set({ primaryField })}
        notListedLabel="My field isn't listed"
        otherLabel="Your field of study"
        error={errors.primaryField}
      />

      {values.secondaryField === null ? (
        <button
          type="button"
          onClick={() => set({ secondaryField: EMPTY_PICK })}
          className="self-start text-sm text-blue-700 underline"
        >
          Add a secondary field of study
        </button>
      ) : (
        <div className="flex flex-col gap-1">
          <SearchPicker
            label="Secondary field of study"
            options={fields}
            value={values.secondaryField}
            onChange={(secondaryField) => set({ secondaryField })}
            notListedLabel="My field isn't listed"
            otherLabel="Your secondary field of study"
            error={errors.secondaryField}
          />
          <button
            type="button"
            onClick={() => set({ secondaryField: null })}
            className="self-start text-sm text-gray-600 underline"
          >
            Remove secondary field of study
          </button>
        </div>
      )}

      <MonthYear
        label="Started"
        month={values.startMonth}
        year={values.startYear}
        years={years}
        onChange={(startMonth, startYear) => set({ startMonth, startYear })}
        error={errors.start}
      />

      <MonthYear
        label={isCurrent ? 'Expected graduation' : 'Graduated or left'}
        month={values.endMonth}
        year={values.endYear}
        years={years}
        onChange={(endMonth, endYear) => set({ endMonth, endYear })}
        error={errors.end}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write `CurrentSchool.tsx`**

Create `src/app/profile/CurrentSchool.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { MonthYear } from '@/components/MonthYear';
import type { PickerOption } from '@/lib/pickerSearch';
import { formatMonthYear, yearOptions, type EducationFormValues, type EducationRow } from '@/lib/education';
import { validateTransfer, type EducationValidation } from '@/lib/validateEducation';
import { EducationFields } from './EducationFields';

export interface Transfer {
  month: number;
  year: number;
}

export function CurrentSchool({
  values,
  onChange,
  errors,
  colleges,
  fields,
  thisYear,
  saved,
  savedSchoolName,
  oldCollege,
  oldDegree,
  transfer,
  onTransferChange,
}: {
  values: EducationFormValues;
  onChange: (values: EducationFormValues) => void;
  errors: EducationValidation['errors'];
  colleges: PickerOption[];
  fields: PickerOption[];
  thisYear: number;
  saved: EducationRow | null;
  savedSchoolName: string;
  oldCollege: string | null;
  oldDegree: string | null;
  transfer: Transfer | null;
  onTransferChange: (transfer: Transfer | null) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [leftMonth, setLeftMonth] = useState<number | null>(null);
  const [leftYear, setLeftYear] = useState<number | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  function continueTransfer() {
    if (!saved) return;
    const error = validateTransfer(saved, leftMonth, leftYear);
    setTransferError(error);
    if (error || leftMonth === null || leftYear === null) return;
    setAsking(false);
    onTransferChange({ month: leftMonth, year: leftYear });
  }

  return (
    <section className="flex flex-col gap-4 border-t pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Current school</h2>
        {saved && !transfer && !asking && (
          <button type="button" onClick={() => setAsking(true)} className="text-sm text-blue-700 underline">
            I transferred
          </button>
        )}
      </div>

      {asking && saved && (
        <div className="flex flex-col gap-3 rounded border border-gray-300 bg-gray-50 p-4 text-sm">
          <MonthYear
            label={`When did you leave ${savedSchoolName}?`}
            month={leftMonth}
            year={leftYear}
            years={yearOptions(thisYear, [leftYear])}
            onChange={(month, year) => {
              setLeftMonth(month);
              setLeftYear(year);
            }}
            error={transferError ?? undefined}
          />
          <div className="flex gap-2">
            <button type="button" onClick={continueTransfer} className="rounded bg-blue-700 px-4 py-2 text-white">
              Continue
            </button>
            <button
              type="button"
              onClick={() => {
                setAsking(false);
                setTransferError(null);
              }}
              className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {transfer && (
        <div className="rounded border border-blue-200 bg-blue-50 p-4 text-sm">
          Moving to previous schools: {savedSchoolName} (left {formatMonthYear(transfer.month, transfer.year)}).
          Enter your new school below, then Save Profile to finish.{' '}
          <button type="button" onClick={() => onTransferChange(null)} className="underline">
            Cancel transfer
          </button>
        </div>
      )}

      {!saved && oldCollege && (
        <p className="text-sm text-gray-700">
          You entered <em>{oldCollege}</em>. Please pick your school from the list.
        </p>
      )}
      {!saved && oldDegree && (
        <p className="text-sm text-gray-700">
          You entered <em>{oldDegree}</em> for your degree. Please pick your degree and field of study from the
          lists.
        </p>
      )}

      <EducationFields
        values={values}
        onChange={onChange}
        errors={errors}
        colleges={colleges}
        fields={fields}
        isCurrent
        thisYear={thisYear}
      />
    </section>
  );
}
```

- [ ] **Step 3: Update `page.tsx`**

In `src/app/profile/page.tsx`, add imports:

```tsx
import type { College, EducationRow, FieldOfStudy } from '@/lib/education';
```

After the `role` line, add:

```tsx
  const [collegesResult, fieldsResult, educationResult] = await Promise.all([
    supabase.from('colleges').select('id, name, city, state, nicknames').order('name'),
    supabase.from('fields_of_study').select('code, title').order('title'),
    supabase
      .from('athlete_education')
      .select('*')
      .eq('athlete_id', user.id)
      .order('end_year', { ascending: false })
      .order('end_month', { ascending: false }),
  ]);

  const loadError = collegesResult.error ?? fieldsResult.error ?? educationResult.error;
  if (loadError) {
    console.error('Profile: could not load education data', loadError);
  }

  const educationRows = (educationResult.data ?? []) as EducationRow[];
  // Central time, so the year menus roll over at local midnight on New Year's.
  const thisYear = Number(
    new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'America/Chicago' }).format(new Date())
  );
```

Replace the `<ProfileForm ... />` element with:

```tsx
      <ProfileForm
        userId={user.id}
        initialProfile={profile}
        showDeleteAccount={canRequestDeletion(role)}
        colleges={(collegesResult.data ?? []) as College[]}
        fields={(fieldsResult.data ?? []) as FieldOfStudy[]}
        currentEducation={educationRows.find((r) => r.is_current) ?? null}
        previousEducation={educationRows.filter((r) => !r.is_current)}
        listsError={loadError !== null}
        thisYear={thisYear}
      />
```

- [ ] **Step 4: Replace `ProfileForm.tsx`**

Replace the top of `src/app/profile/ProfileForm.tsx` (everything from line 1 through the end of the `ProfileForm` function, i.e. up to but not including `function DeleteAccountSection`) with:

```tsx
'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { validateProfile, type ProfileFormValues, type SportType } from '@/lib/validateProfile';
import { validateEducation, type EducationValidation } from '@/lib/validateEducation';
import {
  educationToForm,
  emptyEducation,
  formToEducationPayload,
  schoolName,
  type College,
  type EducationFormValues,
  type EducationRow,
  type FieldOfStudy,
} from '@/lib/education';
import { collegeOptions, fieldOptions } from '@/lib/pickerSearch';
import { SPORTS, getSportType } from '@/lib/sports';
import { CurrentSchool, type Transfer } from './CurrentSchool';

interface ProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  college: string | null; // old free text, shown until the athlete picks from the list
  sport: string;
  sport_type: SportType;
  degree: string | null; // old free text
  positions: string[] | null;
  disciplines: string[] | null;
}

function toFormValues(profile: ProfileRow | null): ProfileFormValues {
  if (!profile) {
    return {
      firstName: '',
      lastName: '',
      sport: '',
      sportType: '',
      positions: [],
      disciplines: [],
    };
  }

  return {
    firstName: profile.first_name,
    lastName: profile.last_name,
    sport: profile.sport,
    sportType: profile.sport_type,
    positions: profile.positions ?? [],
    disciplines: profile.disciplines ?? [],
  };
}

function splitTags(text: string): string[] {
  return text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function ProfileForm({
  userId,
  initialProfile,
  showDeleteAccount,
  colleges,
  fields,
  currentEducation,
  listsError,
  thisYear,
}: {
  userId: string;
  initialProfile: ProfileRow | null;
  showDeleteAccount: boolean;
  colleges: College[];
  fields: FieldOfStudy[];
  currentEducation: EducationRow | null;
  previousEducation: EducationRow[];
  listsError: boolean;
  thisYear: number;
}) {
  const router = useRouter();
  const initialValues = toFormValues(initialProfile);
  const [values, setValues] = useState<ProfileFormValues>(initialValues);
  const [positionsText, setPositionsText] = useState(initialValues.positions.join(', '));
  const [disciplinesText, setDisciplinesText] = useState(initialValues.disciplines.join(', '));
  const [errors, setErrors] = useState<ReturnType<typeof validateProfile>['errors']>({});
  const [education, setEducation] = useState<EducationFormValues>(
    currentEducation ? educationToForm(currentEducation) : emptyEducation()
  );
  const [educationErrors, setEducationErrors] = useState<EducationValidation['errors']>({});
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const collegePicks = useMemo(() => collegeOptions(colleges), [colleges]);
  const fieldPicks = useMemo(() => fieldOptions(fields), [fields]);
  const collegesById = useMemo(() => new Map(colleges.map((c) => [c.id, c])), [colleges]);

  // Starting a transfer clears Current school for the new one; cancelling puts it back.
  function handleTransferChange(next: Transfer | null) {
    setTransfer(next);
    setEducation(next || !currentEducation ? emptyEducation() : educationToForm(currentEducation));
    setEducationErrors({});
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      setDeleting(false);
      setDeleteError('Could not confirm your account. Please log in again.');
      return;
    }

    const { error } = await supabase
      .from('deletion_requests')
      .insert({ user_id: userId, email: user.email });

    if (error) {
      setDeleting(false);
      setDeleteError(error.message);
      return;
    }

    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    setSaveError(null);

    if (listsError) {
      return;
    }

    const positions = splitTags(positionsText);
    const disciplines = splitTags(disciplinesText);
    const nextValues: ProfileFormValues = { ...values, positions, disciplines };

    const profileResult = validateProfile(nextValues);
    const educationResult = validateEducation(education, { isCurrent: true });
    setErrors(profileResult.errors);
    setEducationErrors(educationResult.errors);

    if (!profileResult.valid || !educationResult.valid) {
      return;
    }

    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase.rpc('save_profile', {
      p: {
        first_name: nextValues.firstName,
        last_name: nextValues.lastName,
        sport: nextValues.sport,
        sport_type: nextValues.sportType,
        positions: nextValues.sportType === 'team' ? positions : null,
        disciplines: nextValues.sportType === 'individual' ? disciplines : null,
      },
      current_education: formToEducationPayload(education),
      transfer: transfer ? { end_month: transfer.month, end_year: transfer.year } : null,
    });

    setSaving(false);

    if (error) {
      setSaveError(error.message);
      return;
    }

    setValues(nextValues);
    setTransfer(null);
    setSaved(true);
    router.refresh();
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        First Name
        <input
          value={values.firstName}
          onChange={(e) => setValues({ ...values, firstName: e.target.value })}
          className="rounded border px-3 py-2"
        />
        {errors.firstName && <span className="text-sm text-red-600">{errors.firstName}</span>}
      </label>

      <label className="flex flex-col gap-1">
        Last Name
        <input
          value={values.lastName}
          onChange={(e) => setValues({ ...values, lastName: e.target.value })}
          className="rounded border px-3 py-2"
        />
        {errors.lastName && <span className="text-sm text-red-600">{errors.lastName}</span>}
      </label>

      <label className="flex flex-col gap-1">
        Sport
        <select
          value={values.sport}
          onChange={(e) => {
            const sport = e.target.value;
            setValues({ ...values, sport, sportType: getSportType(sport) });
          }}
          className="rounded border px-3 py-2"
        >
          <option value="">Select a sport</option>
          {SPORTS.map((sport) => (
            <option key={sport.name} value={sport.name}>
              {sport.name}
            </option>
          ))}
        </select>
        {errors.sport && <span className="text-sm text-red-600">{errors.sport}</span>}
      </label>

      {values.sportType === 'team' && (
        <label className="flex flex-col gap-1">
          Positions (comma-separated)
          <input
            value={positionsText}
            onChange={(e) => setPositionsText(e.target.value)}
            placeholder="e.g. Midfielder, Defender"
            className="rounded border px-3 py-2"
          />
          {errors.positions && <span className="text-sm text-red-600">{errors.positions}</span>}
        </label>
      )}

      {values.sportType === 'individual' && (
        <label className="flex flex-col gap-1">
          Disciplines (comma-separated)
          <input
            value={disciplinesText}
            onChange={(e) => setDisciplinesText(e.target.value)}
            placeholder="e.g. Long Jump, 100m Dash"
            className="rounded border px-3 py-2"
          />
          {errors.disciplines && (
            <span className="text-sm text-red-600">{errors.disciplines}</span>
          )}
        </label>
      )}

      {listsError ? (
        <p className="border-t pt-4 text-sm text-red-600">
          We couldn&apos;t load the school and field lists. Please refresh.
        </p>
      ) : (
        <CurrentSchool
          values={education}
          onChange={setEducation}
          errors={educationErrors}
          colleges={collegePicks}
          fields={fieldPicks}
          thisYear={thisYear}
          saved={currentEducation}
          savedSchoolName={currentEducation ? schoolName(currentEducation, collegesById) : ''}
          oldCollege={initialProfile?.college ?? null}
          oldDegree={initialProfile?.degree ?? null}
          transfer={transfer}
          onTransferChange={handleTransferChange}
        />
      )}

      <button
        type="submit"
        disabled={saving || listsError}
        className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Profile'}
      </button>
      {saved && <p className="text-sm text-green-700">Profile saved.</p>}
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
    </form>

    {showDeleteAccount && (
      <DeleteAccountSection
        confirmingDelete={confirmingDelete}
        setConfirmingDelete={setConfirmingDelete}
        deleting={deleting}
        deleteError={deleteError}
        onDelete={handleDelete}
      />
    )}
    </>
  );
}
```

`previousEducation` is in the props type but not destructured yet, so lint stays clean; Task 8 destructures and uses it.

- [ ] **Step 5: Type-check, lint, and test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type errors, no lint errors, all tests pass.

- [ ] **Step 6: Try it in the browser**

Start the dev server (`npm run dev`; if one is already running from before Task 1, restart it). Sign in as `toddtest1@gmail.com`, open `/profile`:
- The "You entered ..." notes show above the school fields.
- Typing "uno" in School lists "University of Nebraska at Omaha · Omaha, NE" first.
- Save with School empty: "Pick your school" appears and nothing saves.
- Fill everything, Save Profile: "Profile saved.", and after the refresh the notes are gone and the fields keep their values.
- I transferred → pick a leaving month before the start: "You can't leave before you started". Pick a valid month → Continue → the blue "Moving to previous schools" box shows and the fields are blank. Cancel transfer → the old values come back.

- [ ] **Step 7: Commit**

```bash
git add src/app/profile/EducationFields.tsx src/app/profile/CurrentSchool.tsx src/app/profile/ProfileForm.tsx src/app/profile/page.tsx
git commit -m "Pick school, degree, fields of study, and dates on the profile; save with save_profile; add transfers"
```

---

### Task 8: Previous schools

**Files:**
- Create: `src/app/profile/PreviousSchools.tsx`
- Modify: `src/app/profile/ProfileForm.tsx` (render it)

**Interfaces:**
- Consumes: `EducationFields` (Task 7); `educationLine`, `educationToForm`, `emptyEducation`, `formToEducationPayload` (Task 4); `validateEducation` (Task 4).
- Produces: `PreviousSchools({ athleteId, rows, collegesById, colleges, fields, thisYear }: { athleteId: string; rows: EducationRow[]; collegesById: Map<number, College>; colleges: PickerOption[]; fields: PickerOption[]; thisYear: number })`.

- [ ] **Step 1: Write `PreviousSchools.tsx`**

Create `src/app/profile/PreviousSchools.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { PickerOption } from '@/lib/pickerSearch';
import {
  educationLine,
  educationToForm,
  emptyEducation,
  formToEducationPayload,
  type College,
  type EducationFormValues,
  type EducationRow,
} from '@/lib/education';
import { validateEducation, type EducationValidation } from '@/lib/validateEducation';
import { EducationFields } from './EducationFields';

export function PreviousSchools({
  athleteId,
  rows,
  collegesById,
  colleges,
  fields,
  thisYear,
}: {
  athleteId: string;
  rows: EducationRow[];
  collegesById: Map<number, College>;
  colleges: PickerOption[];
  fields: PickerOption[];
  thisYear: number;
}) {
  const router = useRouter();
  // A row id while editing that row, 'new' while adding, null otherwise.
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<EducationFormValues>(emptyEducation());
  const [errors, setErrors] = useState<EducationValidation['errors']>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);

  function startEditing(id: string, start: EducationFormValues) {
    setEditing(id);
    setValues(start);
    setErrors({});
    setError(null);
    setConfirmingRemove(null);
  }

  async function save() {
    const result = validateEducation(values, { isCurrent: false });
    setErrors(result.errors);
    if (!result.valid || editing === null) return;

    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = formToEducationPayload(values);
    const { error: saveError } =
      editing === 'new'
        ? await supabase.from('athlete_education').insert({ ...payload, athlete_id: athleteId, is_current: false })
        : await supabase.from('athlete_education').update(payload).eq('id', editing);
    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function remove(id: string) {
    setSaving(true);
    setError(null);
    const { error: removeError } = await createClient().from('athlete_education').delete().eq('id', id);
    setSaving(false);

    if (removeError) {
      setError(removeError.message);
      return;
    }
    setConfirmingRemove(null);
    router.refresh();
  }

  const form = (
    <div className="flex flex-col gap-4 rounded border p-4">
      <EducationFields
        values={values}
        onChange={setValues}
        errors={errors}
        colleges={colleges}
        fields={fields}
        isCurrent={false}
        thisYear={thisYear}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save school'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <section className="mt-10 flex flex-col gap-3 border-t pt-6">
      <h2 className="text-lg font-semibold">Previous schools</h2>
      {rows.length === 0 && editing !== 'new' && (
        <p className="text-sm text-gray-600">No previous schools.</p>
      )}

      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id} className="text-sm">
            {editing === row.id ? (
              form
            ) : (
              <div className="flex flex-col gap-1">
                <span>{educationLine(row, collegesById)}</span>
                {confirmingRemove === row.id ? (
                  <span className="flex gap-3">
                    Remove this school?
                    <button
                      type="button"
                      onClick={() => remove(row.id)}
                      disabled={saving}
                      className="text-red-600 underline"
                    >
                      Yes, remove
                    </button>
                    <button type="button" onClick={() => setConfirmingRemove(null)} className="underline">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => startEditing(row.id, educationToForm(row))}
                      className="text-blue-700 underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingRemove(row.id)}
                      className="text-red-600 underline"
                    >
                      Remove
                    </button>
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {editing === 'new' ? (
        form
      ) : (
        <button
          type="button"
          onClick={() => startEditing('new', emptyEducation())}
          className="self-start text-sm text-blue-700 underline"
        >
          Add a previous school
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 2: Render it from `ProfileForm.tsx`**

Add the import:

```tsx
import { PreviousSchools } from './PreviousSchools';
```

Add `previousEducation,` to the `ProfileForm` destructuring list (after `currentEducation,`).

Between `</form>` and `{showDeleteAccount && (`, insert:

```tsx
    {currentEducation && !listsError && (
      <PreviousSchools
        athleteId={userId}
        rows={previousEducation}
        collegesById={collegesById}
        colleges={collegePicks}
        fields={fieldPicks}
        thisYear={thisYear}
      />
    )}
```

- [ ] **Step 3: Type-check, lint, and test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

- [ ] **Step 4: Try it in the browser**

As `toddtest1@gmail.com` on `/profile`:
- "Previous schools" shows "No previous schools." and "Add a previous school".
- Add one with "No degree" and no field: saves, shows a line like "Iowa Western Community College · Council Bluffs, IA · No degree · Aug 2022 to May 2023".
- Edit it, change the degree to AA and add a field, Save school: the line updates.
- Remove → "Remove this school?" → Cancel keeps it; Yes, remove deletes it.
- Do a full transfer (I transferred, pick a new school, Save Profile): the old school now appears under Previous schools.

- [ ] **Step 5: Commit**

```bash
git add src/app/profile/PreviousSchools.tsx src/app/profile/ProfileForm.tsx
git commit -m "Add previous schools: add, edit, and remove"
```

---

### Task 9: Reports

**Files:**
- Modify: `src/lib/reports.ts`, `src/lib/reports.test.ts`
- Modify: `src/app/admin/reports/page.tsx`
- Modify: `C:\development\Claude Code\Proven\Parking_Lot.md` (outside the repo; not committed)

**Interfaces:**
- Consumes: `admin_report_athletes()` new columns and `admin_report_not_listed()` (Task 1); `degreeShort`, `formatMonthYear`, `DegreeType` (Task 4).
- Produces (`reports.ts`):
  - `ReportAthlete` gains `college_name`, `college_city`, `college_state`, `college_other`, `degree_type`, `degree_other`, `primary_field_title`, `primary_field_other`, `grad_month`, `grad_year`; `college` and `degree` become `string | null`.
  - `schoolText(a)`, `degreeText(a)`, `fieldText(a)`, `graduationText(a)`, `athleteSummary(a)`: all `(a: ReportAthlete) => string`.
  - `interface NotListedRow { kind: 'School' | 'Field of study'; answer: string; athlete_id: string; first_name: string; last_name: string }`
  - `interface NotListedGroup { kind: 'School' | 'Field of study'; answer: string; athletes: string[] }`
  - `groupNotListed(rows: NotListedRow[]): NotListedGroup[]`

- [ ] **Step 1: Update the test helper and write the failing tests**

In `src/lib/reports.test.ts`, change the imports to:

```ts
import {
  athleteSummary,
  buildExperienceReport,
  degreeText,
  experienceStatusLabel,
  fieldText,
  formatReportDate,
  graduationText,
  groupNotListed,
  schoolText,
  type NotListedRow,
  type ReportAthlete,
  type ReportExperienceRow,
  type ReportLabel,
} from './reports';
```

Replace the `athlete` helper with:

```ts
function athlete(id: string, first: string, last: string, overrides: Partial<ReportAthlete> = {}): ReportAthlete {
  return {
    id,
    first_name: first,
    last_name: last,
    college: null,
    degree: null,
    sport: 'Football',
    created_at: '2026-10-06T15:00:00Z',
    college_name: 'University of Nebraska at Omaha',
    college_city: 'Omaha',
    college_state: 'NE',
    college_other: null,
    degree_type: 'BS',
    degree_other: null,
    primary_field_title: 'Computer Science',
    primary_field_other: null,
    grad_month: 5,
    grad_year: 2027,
    ...overrides,
  };
}
```

Append:

```ts
describe('athlete education text', () => {
  it('describes a picked school, degree, field, and graduation', () => {
    const a = athlete('a1', 'Todd', 'Campbell');
    expect(schoolText(a)).toBe('University of Nebraska at Omaha');
    expect(degreeText(a)).toBe('BS');
    expect(fieldText(a)).toBe('Computer Science');
    expect(graduationText(a)).toBe('May 2027');
    expect(athleteSummary(a)).toBe(
      'University of Nebraska at Omaha · BS, Computer Science · Graduating May 2027 · Football'
    );
  });

  it('shows "not listed" answers as typed', () => {
    const a = athlete('a1', 'Todd', 'Campbell', {
      college_name: null,
      college_city: null,
      college_state: null,
      college_other: 'Hometown CC',
      degree_type: 'OTHER',
      degree_other: 'BSN',
      primary_field_title: null,
      primary_field_other: 'Esports Management',
    });
    expect(athleteSummary(a)).toBe('Hometown CC · BSN, Esports Management · Graduating May 2027 · Football');
  });

  it('falls back to the old typed text for athletes who have not picked yet', () => {
    const a = athlete('a1', 'Todd', 'Campbell', {
      college: 'UNO',
      degree: 'BS - Computer Science',
      college_name: null,
      college_city: null,
      college_state: null,
      degree_type: null,
      primary_field_title: null,
      grad_month: null,
      grad_year: null,
    });
    expect(schoolText(a)).toBe('UNO (not yet picked)');
    expect(degreeText(a)).toBe('BS - Computer Science (not yet picked)');
    expect(graduationText(a)).toBe('');
    expect(athleteSummary(a)).toBe('UNO (not yet picked) · BS - Computer Science (not yet picked) · Football');
  });
});

describe('groupNotListed', () => {
  function row(kind: NotListedRow['kind'], answer: string, id: string, last: string): NotListedRow {
    return { kind, answer, athlete_id: id, first_name: 'A', last_name: last };
  }

  it('groups answers ignoring case and extra spaces, schools first, most athletes first', () => {
    const groups = groupNotListed([
      row('Field of study', 'Esports', 'a1', 'Smith'),
      row('School', 'Iowa Western CC', 'a2', 'Doe'),
      row('School', ' iowa  western cc ', 'a3', 'Adams'),
      row('School', 'Hometown CC', 'a4', 'Brown'),
    ]);
    expect(groups).toEqual([
      { kind: 'School', answer: 'Iowa Western CC', athletes: ['Adams, A', 'Doe, A'] },
      { kind: 'School', answer: 'Hometown CC', athletes: ['Brown, A'] },
      { kind: 'Field of study', answer: 'Esports', athletes: ['Smith, A'] },
    ]);
  });

  it('counts an athlete once per answer, even if typed for primary and secondary', () => {
    const groups = groupNotListed([
      row('Field of study', 'Esports', 'a1', 'Smith'),
      row('Field of study', 'esports', 'a1', 'Smith'),
    ]);
    expect(groups[0].athletes).toEqual(['Smith, A']);
  });
});
```

The existing tests that call `athlete('a1', 'Todd', 'Campbell')` keep working with the new helper.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/reports.test.ts`
Expected: FAIL, the new imports are not exported.

- [ ] **Step 3: Update `reports.ts`**

Add at the top of `src/lib/reports.ts`:

```ts
import { degreeShort, formatMonthYear, type DegreeType } from './education';
```

Replace the `ReportAthlete` interface with:

```ts
export interface ReportAthlete {
  id: string;
  first_name: string;
  last_name: string;
  college: string | null; // old free text, shown until the athlete picks from the list
  degree: string | null; // old free text
  sport: string;
  created_at: string;
  college_name: string | null;
  college_city: string | null;
  college_state: string | null;
  college_other: string | null;
  degree_type: DegreeType | null; // null when the athlete has no current school yet
  degree_other: string | null;
  primary_field_title: string | null;
  primary_field_other: string | null;
  grad_month: number | null;
  grad_year: number | null;
}
```

Append to the end of the file:

```ts
const NOT_PICKED = ' (not yet picked)';

export function schoolText(a: ReportAthlete): string {
  if (a.degree_type !== null) return a.college_name ?? a.college_other ?? '';
  return a.college ? `${a.college}${NOT_PICKED}` : '';
}

export function degreeText(a: ReportAthlete): string {
  if (a.degree_type !== null) return degreeShort(a.degree_type, a.degree_other);
  return a.degree ? `${a.degree}${NOT_PICKED}` : '';
}

export function fieldText(a: ReportAthlete): string {
  return a.primary_field_title ?? a.primary_field_other ?? '';
}

export function graduationText(a: ReportAthlete): string {
  return a.grad_month !== null && a.grad_year !== null ? formatMonthYear(a.grad_month, a.grad_year) : '';
}

export function athleteSummary(a: ReportAthlete): string {
  const degreeAndField = [degreeText(a), fieldText(a)].filter(Boolean).join(', ');
  const graduation = graduationText(a);
  return [schoolText(a), degreeAndField, graduation && `Graduating ${graduation}`, a.sport]
    .filter(Boolean)
    .join(' · ');
}

export interface NotListedRow {
  kind: 'School' | 'Field of study';
  answer: string;
  athlete_id: string;
  first_name: string;
  last_name: string;
}

export interface NotListedGroup {
  kind: 'School' | 'Field of study';
  answer: string;
  athletes: string[];
}

export function groupNotListed(rows: NotListedRow[]): NotListedGroup[] {
  const groups = new Map<string, { kind: NotListedRow['kind']; answer: string; athletes: Map<string, string> }>();

  for (const row of rows) {
    const answer = row.answer.trim().replace(/\s+/g, ' ');
    if (!answer) continue;
    const key = `${row.kind}|${answer.toLowerCase()}`;
    const group = groups.get(key) ?? { kind: row.kind, answer, athletes: new Map<string, string>() };
    group.athletes.set(row.athlete_id, `${row.last_name}, ${row.first_name}`);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((g) => ({
      kind: g.kind,
      answer: g.answer,
      athletes: [...g.athletes.values()].sort((a, b) => a.localeCompare(b)),
    }))
    .sort(
      (a, b) =>
        Number(b.kind === 'School') - Number(a.kind === 'School') ||
        b.athletes.length - a.athletes.length ||
        a.answer.localeCompare(b.answer)
    );
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/lib/reports.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the Reports page**

In `src/app/admin/reports/page.tsx`:

1. Add to the `@/lib/reports` import: `athleteSummary`, `degreeText`, `fieldText`, `graduationText`, `groupNotListed`, `schoolText`, `type NotListedRow`.

2. After `const report = await loadExperienceReport(supabase, athletes);`, add:

```tsx
  const { data: notListedData, error: notListedError } = await supabase.rpc('admin_report_not_listed');
  if (notListedError) {
    console.error('Reports: could not load not listed answers', notListedError);
  }
  const notListed = groupNotListed((notListedData ?? []) as NotListedRow[]);
```

3. Replace the Student Athletes `<thead>` row and `<tbody>` with (this also adds `scope="col"`, resolving the Parking Lot item):

```tsx
              <thead className="border-b bg-gray-50 text-gray-600">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Name</th>
                  <th scope="col" className="px-3 py-2 font-medium">School</th>
                  <th scope="col" className="px-3 py-2 font-medium">Degree</th>
                  <th scope="col" className="px-3 py-2 font-medium">Field of study</th>
                  <th scope="col" className="px-3 py-2 font-medium">Graduation</th>
                  <th scope="col" className="px-3 py-2 font-medium">Sport</th>
                  <th scope="col" className="px-3 py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {athletes.map((a) => (
                  <tr key={a.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {a.last_name}, {a.first_name}
                    </td>
                    <td className="px-3 py-2">{schoolText(a)}</td>
                    <td className="px-3 py-2">{degreeText(a)}</td>
                    <td className="px-3 py-2">{fieldText(a)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{graduationText(a)}</td>
                    <td className="px-3 py-2">{a.sport}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatReportDate(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
```

4. In the experience report, replace

```tsx
                    <span className="text-sm text-gray-500">
                      {' '}
                      · {athlete.college} · {athlete.sport}
                    </span>
```

with

```tsx
                    <span className="text-sm text-gray-500"> · {athleteSummary(athlete)}</span>
```

5. Just before the closing `</main>` of the main return, add:

```tsx
      <section className="mt-10">
        <h2 className="text-lg font-semibold">&ldquo;Not listed&rdquo; answers</h2>
        {notListedError ? (
          <p className="mt-3 text-sm text-red-600">
            Couldn&rsquo;t load the &ldquo;not listed&rdquo; answers. Refresh to try again.
          </p>
        ) : notListed.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">Every athlete picked from the lists.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-gray-600">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Type</th>
                  <th scope="col" className="px-3 py-2 font-medium">Answer</th>
                  <th scope="col" className="px-3 py-2 font-medium">Athletes</th>
                  <th scope="col" className="px-3 py-2 font-medium">Who</th>
                </tr>
              </thead>
              <tbody>
                {notListed.map((g) => (
                  <tr key={`${g.kind}|${g.answer}`} className="border-b last:border-b-0">
                    <td className="px-3 py-2 whitespace-nowrap">{g.kind}</td>
                    <td className="px-3 py-2">{g.answer}</td>
                    <td className="px-3 py-2">{g.athletes.length}</td>
                    <td className="px-3 py-2">{g.athletes.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
```

- [ ] **Step 6: Type-check, lint, and test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

- [ ] **Step 7: Try it in the browser**

Sign in as `toddacampbell2011@gmail.com`, open `/admin/reports`: the athlete table shows School, Degree, Field of study, Graduation; toddtest1 shows the school picked in Task 7; athletes who haven't picked show "UNO (not yet picked)"; the experience report header reads like "University of Nebraska at Omaha · BS, Computer Science · Graduating May 2027 · Golf"; the "Not listed" section shows either the table or "Every athlete picked from the lists."

- [ ] **Step 8: Update the Parking Lot (not in the repo)**

In `C:\development\Claude Code\Proven\Parking_Lot.md`:
- Under "Reports at scale", in "Depends on", change the Colleges pick-list bullet to start with "**Done 2026-10-1x:** the Colleges pick-list (education pick-lists spec)." keeping the explanation.
- In "Admin reports: follow-ups from review", delete the `scope="col"` bullet; if that leaves the entry empty, move it to Resolved with "Resolved: 2026-10-1x. Added `scope=\"col\"` to report table headers."

- [ ] **Step 9: Commit**

```bash
git add src/lib/reports.ts src/lib/reports.test.ts src/app/admin/reports/page.tsx
git commit -m "Show school, degree, field, and graduation in Reports; add the Not listed answers table"
```

---

### Task 10: Database check script

**Files:**
- Create: `scripts/education-check.ts`

**Interfaces:**
- Consumes: `save_profile`, the education tables and policies (Task 1); the reference data (Task 3). `npm run education-check` was added in Task 3.
- Env (in `.env.local`, gitignored): `EDUCATION_CHECK_A_EMAIL`, `EDUCATION_CHECK_A_PASSWORD`, `EDUCATION_CHECK_B_EMAIL`, `EDUCATION_CHECK_B_PASSWORD`, `EDUCATION_CHECK_ADMIN_EMAIL`, `EDUCATION_CHECK_ADMIN_PASSWORD`.

- [ ] **Step 1: Todd sets up the test accounts**

1. On the local site, sign up `nsxdude82+check1@gmail.com` and `nsxdude82+check2@gmail.com` (Confirm email is off, so no email step). Don't fill in a profile.
2. In the Supabase SQL Editor, keep them out of Reports and the Dashboard by giving them a non-athlete role:

```sql
insert into user_roles (id, role, name)
select id, 'university_user', 'Education check account'
from auth.users
where email in ('nsxdude82+check1@gmail.com', 'nsxdude82+check2@gmail.com');
```

3. Add the six `EDUCATION_CHECK_*` lines to `.env.local` (check1 as A, check2 as B, and an admin login for ADMIN: Todd's own, or a dedicated test admin).

- [ ] **Step 2: Write the script**

Create `scripts/education-check.ts`:

```ts
// Checks the education tables' rules against the real database, signed in as two test
// athletes (A and B) and an admin. Use test accounts only; the plan's Task 10 sets them up.
// A's education rows are removed at the end. Audit rows stay, which is the point of them.
// Usage: npm run education-check

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` (${detail})` : ''}`);
  if (!ok) failures += 1;
}

async function signIn(prefix: string): Promise<{ client: SupabaseClient; id: string }> {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) {
    console.error(`Set ${prefix}_EMAIL and ${prefix}_PASSWORD in .env.local.`);
    process.exit(1);
  }
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    console.error(`Could not sign in as ${email}: ${error?.message}`);
    process.exit(1);
  }
  return { client, id: data.user.id };
}

const PROFILE = {
  first_name: 'Check',
  last_name: 'Account',
  sport: 'Golf',
  sport_type: 'individual',
  positions: null,
  disciplines: ['Stroke play'],
};

function education(collegeId: number, overrides: Record<string, unknown> = {}) {
  return {
    college_id: collegeId,
    college_other: null,
    degree_type: 'BS',
    degree_other: null,
    primary_field_code: '11.07',
    primary_field_other: null,
    secondary_field_code: null,
    secondary_field_other: null,
    start_month: 8,
    start_year: 2023,
    end_month: 5,
    end_year: 2027,
    ...overrides,
  };
}

async function main() {
  const a = await signIn('EDUCATION_CHECK_A');
  const b = await signIn('EDUCATION_CHECK_B');
  const admin = await signIn('EDUCATION_CHECK_ADMIN');

  const { data: colleges } = await a.client.from('colleges').select('id').order('id').limit(2);
  if (!colleges || colleges.length < 2) {
    console.error('No colleges found. Run supabase/reference/reference-data-v1.sql first.');
    process.exit(1);
  }
  const [firstCollege, secondCollege] = colleges.map((c) => c.id as number);

  // Start clean in case an earlier run stopped partway.
  await a.client.from('athlete_education').delete().eq('athlete_id', a.id);

  // 1. Profile and current school save together.
  const saved = await a.client.rpc('save_profile', { p: PROFILE, current_education: education(firstCollege) });
  check('save_profile saves the profile and current school', !saved.error, saved.error?.message);

  const { data: current } = await a.client
    .from('athlete_education')
    .select('*')
    .eq('athlete_id', a.id)
    .eq('is_current', true)
    .maybeSingle();
  check('the athlete can read their current school', current !== null);
  if (!current) {
    process.exit(1);
  }

  // 2. Another athlete can't see or change it.
  const bRead = await b.client.from('athlete_education').select('id').eq('id', current.id);
  check('another athlete cannot read it', (bRead.data ?? []).length === 0);
  const bUpdate = await b.client.from('athlete_education').update({ start_year: 2020 }).eq('id', current.id).select('id');
  check('another athlete cannot change it', (bUpdate.data ?? []).length === 0);
  const bDelete = await b.client.from('athlete_education').delete().eq('id', current.id).select('id');
  check('another athlete cannot delete it', (bDelete.data ?? []).length === 0);

  // 3. The audit trail is write-protected.
  const historyInsert = await a.client
    .from('athlete_education_history')
    .insert({ education_id: current.id, athlete_id: a.id, action: 'insert' });
  check('an athlete cannot write to the audit trail', historyInsert.error !== null);
  const historyRead = await a.client.from('athlete_education_history').select('id').eq('athlete_id', a.id);
  check('an athlete cannot read the audit trail', (historyRead.data ?? []).length === 0);
  const adminUpdate = await admin.client
    .from('athlete_education_history')
    .update({ action: 'delete' })
    .eq('education_id', current.id)
    .select('id');
  check('an admin cannot change audit rows', (adminUpdate.data ?? []).length === 0);
  const adminDelete = await admin.client
    .from('athlete_education_history')
    .delete()
    .eq('education_id', current.id)
    .select('id');
  check('an admin cannot delete audit rows', (adminDelete.data ?? []).length === 0);

  // 4. An edit (recorded below).
  const edit = await a.client.from('athlete_education').update({ start_year: 2022 }).eq('id', current.id);
  check('the athlete can edit their school', !edit.error, edit.error?.message);

  // 5. Rules.
  const secondCurrent = await a.client
    .from('athlete_education')
    .insert({ ...education(secondCollege), athlete_id: a.id, is_current: true });
  check('a second current school is rejected', secondCurrent.error !== null);
  const noSchool = await a.client
    .from('athlete_education')
    .insert({ ...education(firstCollege), college_id: null, athlete_id: a.id });
  check('a school with no college is rejected', noSchool.error !== null);
  const blankSchool = await a.client
    .from('athlete_education')
    .insert({ ...education(firstCollege), college_id: null, college_other: '   ', athlete_id: a.id });
  check('a blank "not listed" school is rejected', blankSchool.error !== null);
  const backwards = await a.client
    .from('athlete_education')
    .insert({ ...education(firstCollege, { start_year: 2027, end_year: 2023 }), athlete_id: a.id });
  check('an end before the start is rejected', backwards.error !== null);
  const currentNoDegree = await a.client.rpc('save_profile', {
    p: PROFILE,
    current_education: education(firstCollege, { degree_type: 'NONE' }),
  });
  check('"No degree" on the current school is rejected', currentNoDegree.error !== null);

  // 6. Transfer: the old school becomes previous and the new one is current, together.
  const moved = await a.client.rpc('save_profile', {
    p: PROFILE,
    current_education: education(secondCollege, { degree_type: 'BA', start_year: 2025 }),
    transfer: { end_month: 5, end_year: 2025 },
  });
  check('save_profile with a transfer succeeds', !moved.error, moved.error?.message);
  const { data: afterTransfer } = await a.client.from('athlete_education').select('*').eq('athlete_id', a.id);
  const old = afterTransfer?.find((r) => r.id === current.id);
  const now = afterTransfer?.find((r) => r.is_current);
  check(
    'the old school is now previous, ending May 2025',
    old?.is_current === false && old?.end_month === 5 && old?.end_year === 2025
  );
  check('the new school is current', now?.college_id === secondCollege && now?.id !== current.id);

  // 7. Remove the previous school (recorded below).
  const removed = await a.client.from('athlete_education').delete().eq('id', current.id);
  check('the athlete can remove a previous school', !removed.error, removed.error?.message);

  // 8. The audit trail recorded insert, edit, transfer, and delete for that school.
  const { data: history } = await admin.client
    .from('athlete_education_history')
    .select('*')
    .eq('education_id', current.id)
    .order('id');
  const actions = (history ?? []).map((h) => h.action);
  check(
    'every change left an audit row',
    JSON.stringify(actions) === JSON.stringify(['insert', 'update', 'update', 'delete']),
    `got ${JSON.stringify(actions)}`
  );
  const editRow = history?.[1];
  check(
    'the edit row shows who, before, and after',
    editRow?.changed_by === a.id && editRow?.old_row?.start_year === 2023 && editRow?.new_row?.start_year === 2022
  );
  const deleteRow = history?.[3];
  check('the delete row keeps the removed values', deleteRow?.old_row !== null && deleteRow?.new_row === null);

  // Clean up A's rows.
  await a.client.from('athlete_education').delete().eq('athlete_id', a.id);

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
```

- [ ] **Step 3: Run it**

Run: `npm run education-check`
Expected: every line `PASS`, then "All checks passed." If a line fails, fix the SQL (new migration file with the fix, Todd runs it) or the script, whichever is wrong, and re-run.

- [ ] **Step 4: Commit**

```bash
git add scripts/education-check.ts
git commit -m "Add the education database check script"
```

---

### Task 11: Move existing profiles over

**Files:**
- Create: `supabase/migrations/2026-10-12-education-backfill.sql`

**Interfaces:**
- Consumes: the tables and lists from Tasks 1 and 3.

The mappings depend on what's in the live database, so this task gathers them with Todd before writing the file.

- [ ] **Step 1: Todd lists the existing profiles**

Todd runs in the SQL Editor and pastes the result into the chat:

```sql
select p.id, p.first_name, p.last_name, p.college, p.degree,
       exists (select 1 from athlete_education e where e.athlete_id = p.id) as has_education
from profiles p
order by p.last_name, p.first_name;
```

- [ ] **Step 2: Agree on each mapping**

For each profile with `has_education = false`, look up the school and field:

```sql
select id, name, city, state from colleges where name ilike '%omaha%';
select code, title from fields_of_study where title ilike '%computer%';
```

Agree with Todd, per athlete: college id (or "not listed" text), degree type, primary field code (and secondary if any), start month and year, expected graduation month and year. Demo athletes need all of these, so their Reports rows look complete.

- [ ] **Step 3: Write the backfill file**

Create `supabase/migrations/2026-10-12-education-backfill.sql` with one row per agreed athlete. The shape (this example row is Todd's "BS - Computer Science" at UNO; replace with the agreed values):

```sql
-- Moves existing test and demo profiles from the old free-text college and degree to
-- athlete_education, as agreed with Todd on 2026-10-1x. Safe to re-run: athletes who
-- already have a current school are skipped. The audit trail records these inserts
-- with changed_by null (run from the SQL editor).

insert into athlete_education (
  athlete_id, is_current, college_id, college_other, degree_type, degree_other,
  primary_field_code, primary_field_other, secondary_field_code, secondary_field_other,
  start_month, start_year, end_month, end_year
) values
  -- Campbell, Todd: "UNO", "BS - Computer Science"
  ('00000000-0000-0000-0000-000000000000', true, 181394, null, 'BS', null, '11.07', null, null, null, 8, 2023, 5, 2027)
on conflict (athlete_id) where is_current do nothing;
```

Each row gets a comment with the athlete's name and the old typed text, so the file explains itself.

- [ ] **Step 4: Commit, then Todd runs it**

```bash
git add supabase/migrations/2026-10-12-education-backfill.sql
git commit -m "Move existing profiles to the education pick-lists"
```

Todd runs the file in the SQL Editor, then re-runs the Step 1 query: every mapped athlete shows `has_education = true`.

---

### Task 12: Release and verify

**Files:** none new. Uses Playwright (browser automation) for the walkthrough.

- [ ] **Step 1: Full local check**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all clean; the build succeeds.

- [ ] **Step 2: Browser walkthrough on the local dev server**

With Playwright, against `http://localhost:3000`:
1. **New athlete:** sign in as `nsxdude82+debug1@gmail.com` / `DebugPass123!` (no profile). Fill the whole profile with the keyboard only in the pickers (Tab to School, type "uno", Down, Enter). Save. Expected: "Profile saved."
2. **Not listed:** for Primary field, choose "My field isn't listed", leave it blank, Save: "Type your field of study". Type an answer, Save: saved.
3. **Previous school and transfer:** add a previous school, edit it, remove it; do a transfer and cancel it; do a transfer and save it.
4. **Phone width:** resize to 375 px wide; no sideways scrolling on `/profile`, and the picker list fits.
5. **Admin:** sign in as the admin; `/admin/reports` shows the new columns and the debug1 "not listed" field in the Not listed table.
6. Afterwards, the debug1 account now has a profile and will show in Reports. Tell Todd so he can decide whether to keep it as a demo athlete or give it a non-athlete role like the check accounts.

- [ ] **Step 3: Final code review**

Use superpowers:requesting-code-review for the whole branch (all commits since `64a7caa`). Fix what it finds, re-run Step 1.

- [ ] **Step 4: Confirm the SQL order, then push**

Confirm with Todd that all three SQL files have been run (migration, reference data, backfill). Then:

```bash
git push origin master
```

Vercel deploys `master`.

- [ ] **Step 5: Walkthrough on the live site**

Repeat Step 2 items 1, 3, and 5 on https://proven-impact.vercel.app with a fresh `+` test address (sign up), then give that address a non-athlete role as in Task 10 Step 1 so it stays out of the demo's Reports. Todd does his own pass.

- [ ] **Step 6: Update memory and the Parking Lot**

Record in memory that the education pick-lists shipped (commit range, live date) and that the old `profiles.college`/`degree` columns are waiting for a cleanup. Add a Parking Lot entry "Drop profiles.college and profiles.degree" with the condition: after every athlete has a current school.
