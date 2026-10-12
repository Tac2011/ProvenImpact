# Proven Impact: Education Pick-Lists Design

**Date:** 2026-10-12
**Status:** Draft, awaiting Todd's review

## Purpose

College and degree are free text today. Athletes type "UNO" or
"University of Nebraska Omaha", "BS - Computer Science" or "Bachelors of
Sci Comp Sci", so no report can group athletes by school or field of
study. Reports are expected to be key to Proven Impact's success: both
universities and employers want data they can slice and trust.

This piece replaces the free text with standard lists, keeps a history of
every school an athlete attended (transfers are common, and a junior
college to Division I path is itself a story worth telling), and records
where every list came from, so the answer to "where did you get this
data?" lives in the system itself.

Target: shipped by Thursday 2026-10-15, ahead of the investor demo on
Monday 2026-10-19.

Decided with Todd during brainstorming:

| Question | Decision |
|---|---|
| Which schools? | Nebraska, Kansas, Iowa, North Dakota, South Dakota only for now. Only schools that belong to an athletic association (NCAA, NAIA, NJCAA, and the smaller ones). 141 schools. Nationwide comes later by re-running the build script. |
| School not on the list? | "My school isn't listed" plus a text box. Nobody gets stuck. |
| Degree | Split into degree type (fixed list) and field of study (standard list). |
| Fields of study | A primary (required) and a secondary (optional). Not labeled major or minor; if the secondary is a minor, so be it. One degree type covers both. |
| Field list | The federal CIP list at the 4-digit level, minus families that aren't college majors. 414 entries. "Not listed" fallback. |
| Graduation | Month and year, not a full date. Two dropdowns, not the browser's month picker (Firefox and desktop Safari show a plain text box). |
| Transfers | Keep every school attended, with one current. Each school has its own degree, fields, and dates. |
| Audit | Every insert, edit, and delete of education data is recorded automatically: who, when, before, after. |
| Storage | Lists live in database tables, keyed by federal IDs, not in app code. |
| Provenance | A `data_sources` table names every source; each list row points to its source. This spec's Data Sources section is the written record. |

## Data Sources

All reference data comes from the U.S. Department of Education's National
Center for Education Statistics (NCES). Athletic association membership is
what each school reports to the Department of Education in IPEDS; it is
not data from the NCAA, NAIA, or NJCAA themselves.

| Source | Publisher | Edition | Download | Retrieved | SHA-256 |
|---|---|---|---|---|---|
| IPEDS Institutional Characteristics: Directory Information (HD2024) | NCES, U.S. Department of Education | 2024-25 collection | https://nces.ed.gov/ipeds/datacenter/data/HD2024.zip | 2026-10-12 | `d98425c123d7c0e872aec6e83960dfb501884818bf17385c340790f3d1f28345` |
| IPEDS Institutional Characteristics: Educational offerings, organization, services and athletic associations (IC2024) | NCES, U.S. Department of Education | 2024-25 collection | https://nces.ed.gov/ipeds/datacenter/data/IC2024.zip | 2026-10-12 | `924f04f0afd953633a34bbc2ad1beaa65fdbf2a7ba25ebe364bac7469a976288` |
| Classification of Instructional Programs (CIP) | NCES, U.S. Department of Education | CIP 2020 | https://nces.ed.gov/ipeds/cipcode/Files/CIPCode2020.csv | 2026-10-12 | `6cf0882c1f5beb94981d0a1a72285ab5cf633759f45433fb909afbfb6d6b2657` |
| School nicknames | Proven Impact (hand-kept) | v1 | `supabase/reference/college-nicknames.json` | 2026-10-12 | n/a |

The checksums identify the exact files used, so anyone can confirm a
rebuild used the same data. The raw downloads are not committed (about
6 MB); the URLs and checksums are enough to fetch and verify them.

### How the college list is built

From HD2024 (one row per institution) joined to IC2024 on `UNITID`:

- `STABBR` is one of `NE`, `KS`, `IA`, `ND`, `SD`.
- `ATHASSOC = 1` in IC2024 (the school reports membership in a national
  athletic association).
- Athletic associations come from IC2024 `ASSOC1` to `ASSOC6`: NCAA, NAIA,
  NJCAA, NSCAA, NCCAA, Other.
- Kept per school: `UNITID` (the federal ID, used as our key), `INSTNM`
  (official name), `CITY`, `STABBR`, the associations, and nicknames.
- Nicknames: `IALIAS` from HD2024, split on `|` and on runs of two or more
  spaces, trimmed, blanks dropped, merged with our hand-kept file. The
  federal aliases are spotty (UNO is listed only as "UNOMAHA"; UNL has
  none), so the hand-kept file adds common ones like UNO, UNL, UNK.

Result on 2026-10-12: 141 schools (NE 21, KS 47, IA 44, ND 17, SD 12).

### How the field of study list is built

From CIPCode2020.csv:

- 4-digit codes only (`NN.NN`, for example `11.07` Computer Science). The
  2-digit families are too broad and the 6-digit programs (2,325) too many
  to pick from.
- Codes whose `Action` is `Deleted` or `Moved to` are dropped (they no
  longer exist under that code in CIP 2020).
- Families that are not college majors are dropped: 21 and 55 (reserved),
  32 to 37 (basic skills, citizenship, health-related knowledge,
  interpersonal skills, leisure, personal awareness), 53 (high school
  diplomas), 60 and 61 (medical residencies).
- The trailing period on each title is removed. Excel-style `="..."`
  wrapping on codes is removed.

Result on 2026-10-12: 414 fields of study.

## Data

New tables and changes, in one migration file
`supabase/migrations/2026-10-12-education.sql`, mirrored into
`supabase/schema.sql`.

### `data_sources`

| Column | Type | Notes |
|---|---|---|
| `id` | text primary key | e.g. `ipeds-2024`, `cip-2020`, `pi-nicknames-v1` |
| `publisher` | text not null | "NCES, U.S. Department of Education" |
| `dataset` | text not null | full dataset name |
| `edition` | text not null | "2024-25 collection", "CIP 2020" |
| `url` | text | download link |
| `retrieved_on` | date not null | |
| `checksum` | text | SHA-256 of the downloaded file(s) |
| `notes` | text | the filters used, in plain words |

### `colleges`

| Column | Type | Notes |
|---|---|---|
| `id` | integer primary key | IPEDS `UNITID`. Permanent, so other federal data (enrollment, graduation rates, NCAA division) can be joined later. |
| `name` | text not null | official name |
| `city` | text not null | |
| `state` | char(2) not null | |
| `athletic_associations` | text[] not null | e.g. `{NCAA}`, `{NAIA,NCCAA}` |
| `nicknames` | text[] not null default `{}` | used only for search |
| `source_id` | text not null references `data_sources` | |

### `fields_of_study`

| Column | Type | Notes |
|---|---|---|
| `code` | text primary key | CIP code, e.g. `11.07` |
| `title` | text not null | e.g. "Computer Science" |
| `family_code` | text not null | e.g. `11`, for grouping in reports later |
| `source_id` | text not null references `data_sources` | |

### `athlete_education`

One row per school an athlete attended.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid primary key default `gen_random_uuid()` | |
| `athlete_id` | uuid not null references `profiles(id)` on delete cascade | |
| `college_id` | integer references `colleges` | |
| `college_other` | text | "not listed" answer |
| `degree_type` | text not null | `AA`, `AS`, `AAS`, `BA`, `BS`, `BFA`, `BBA`, `OTHER`, `NONE` |
| `degree_other` | text | required when `degree_type = 'OTHER'` |
| `primary_field_code` | text references `fields_of_study` | |
| `primary_field_other` | text | |
| `secondary_field_code` | text references `fields_of_study` | |
| `secondary_field_other` | text | |
| `start_month`, `start_year` | smallint not null | |
| `end_month`, `end_year` | smallint not null | expected graduation for the current school; graduated or left for a previous one |
| `is_current` | boolean not null default false | |
| `created_at`, `updated_at` | timestamptz not null default now() | |

Rules enforced by the database (check constraints and one index):

- Exactly one of `college_id` or a non-blank `college_other`.
- Primary field: exactly one of `primary_field_code` or a non-blank
  `primary_field_other`, except when `degree_type = 'NONE'`, where both may
  be empty.
- Secondary field: at most one of `secondary_field_code` or
  `secondary_field_other`.
- `degree_other` is non-blank when `degree_type = 'OTHER'`, and null
  otherwise.
- `degree_type = 'NONE'` ("No degree", for example transferred after a
  year) only when `is_current` is false.
- Months are 1 to 12; years are 1990 to 2100.
- End is not before start (`end_year * 12 + end_month >=
  start_year * 12 + start_month`).
- At most one current school per athlete: unique index on `athlete_id`
  where `is_current`.

Degree type labels in the app:

| Value | Label |
|---|---|
| `AA` | Associate of Arts (AA) |
| `AS` | Associate of Science (AS) |
| `AAS` | Associate of Applied Science (AAS) |
| `BA` | Bachelor of Arts (BA) |
| `BS` | Bachelor of Science (BS) |
| `BFA` | Bachelor of Fine Arts (BFA) |
| `BBA` | Bachelor of Business Administration (BBA) |
| `OTHER` | Other (type it in) |
| `NONE` | No degree (previous schools only) |

### `athlete_education_history` (audit trail)

| Column | Type | Notes |
|---|---|---|
| `id` | bigint generated always as identity primary key | |
| `education_id` | uuid not null | no foreign key, so history survives a delete |
| `athlete_id` | uuid not null | |
| `action` | text not null | `insert`, `update`, `delete` |
| `changed_by` | uuid | `auth.uid()` at the time; null when run from the SQL editor |
| `changed_at` | timestamptz not null default now() | |
| `old_row` | jsonb | null on insert |
| `new_row` | jsonb | null on delete |

Written only by an `after insert or update or delete` trigger on
`athlete_education` (`security definer`, `search_path = public`). The
trigger also sets `updated_at` on updates (via a `before update` trigger).

### `profiles` changes

- `college` and `degree` become nullable (`drop not null`). They are kept,
  read-only in the app, until existing profiles are moved over; dropping
  them is a later cleanup.
- No new profile columns. The current school is the `athlete_education`
  row with `is_current = true`.

### Saving the profile and current school together

`save_profile(p jsonb, current_education jsonb, transfer jsonb default
null)`, `security invoker` (so the normal row-level rules apply), runs in
one transaction:

1. Upserts the caller's `profiles` row (id forced to `auth.uid()`).
2. If `transfer` is given (`{ "end_month": 5, "end_year": 2025 }`): sets
   the existing current row's end date to it and `is_current = false`.
3. Updates the current row if one exists (and no transfer), otherwise
   inserts a new one with `is_current = true`.

Errors raise, so nothing is half-saved. The function returns nothing; the
page refreshes to show what was saved.

Previous schools are single-row changes, so they use plain inserts,
updates, and deletes through the row-level rules; no function needed. The
current school cannot be deleted from the app, only edited or replaced by
a transfer.

### Who can see and change what

| Table | Athletes | Platform Admins | Everyone signed in |
|---|---|---|---|
| `data_sources`, `colleges`, `fields_of_study` | read | read | read |
| `athlete_education` | read, insert, update, delete own rows | read all | none |
| `athlete_education_history` | none | read all | none |

No insert, update, or delete policies exist on the three list tables or
the history table, so the app can't change them. The lists change only by
running the generated SQL in Supabase. Same known gap as elsewhere: an
athlete whose deletion was approved can still write their own rows through
the API (logged in Parking Lot "Deletion requests: follow-ups").

## Reference Data Script

`scripts/build-reference-data.ts`, run with
`npm run build-reference-data -- <folder with HD2024.csv, IC2024.csv, CIPCode2020.csv>`.

- The states list is one constant at the top of the script.
- Pure functions in `src/lib/referenceData.ts` do the work: a small CSV
  parser (handles quoted fields with commas), `buildColleges`,
  `buildFieldsOfStudy`, `splitAliases`, and `toSql`. The script only reads
  files, computes checksums, and writes output.
- Writes `supabase/reference/reference-data-v1.sql`: inserts the
  `data_sources` rows (with checksums and retrieved date), then
  `colleges` and `fields_of_study`, using `insert ... on conflict do
  update` so re-running it (for example with more states) updates names
  and adds new rows without breaking existing athlete links.
- Prints counts by state and the field count, so a rebuild can be checked
  against this spec.

## Profile Form

`/profile` keeps its single page and its single Save Profile button for
the common case.

### About you and Current school (one form, one Save)

- First name, last name, sport, positions or disciplines: unchanged.
- **School:** searchable picker.
- **Degree:** dropdown with the labels above, minus "No degree". "Other"
  shows a text box.
- **Primary field of study:** searchable picker.
- **Secondary field of study (optional):** hidden behind "Add a secondary
  field of study"; a "Remove" link hides it again.
- **Started:** [Month] [Year].
- **Expected graduation:** [Month] [Year].
- **I transferred** (button next to the Current school heading, only when
  a current school is saved): asks "When did you leave?" [Month] [Year],
  then shows the old school as "Moving to previous schools: ..." and
  clears the Current school fields. Nothing changes in the database until
  Save Profile, which calls `save_profile` with the transfer. Cancel puts
  the old values back.

### Previous schools (below the form)

- Each shown as one line: "Iowa Western Community College · Council
  Bluffs, IA · AA · Aug 2023 to May 2025", with Edit and Remove (Remove
  asks to confirm).
- "Add a previous school" opens the same fields inline, with "Graduated or
  left" instead of "Expected graduation", "No degree" allowed, and its own
  Save and Cancel.
- Hidden until the athlete has a saved current school.

### The searchable picker

`src/components/SearchPicker.tsx`, used for schools and fields of study.

- A text box with a list under it. Typing filters the list; matching is in
  `src/lib/pickerSearch.ts` (pure, tested):
  - Ignores case, punctuation, and extra spaces ("U.N.O." matches "uno").
  - Matches if every typed word appears in the name, city, or a nickname.
  - Order: exact nickname match first, then names starting with the typed
    text, then the rest alphabetically. At most 50 shown.
- School rows show "Name · City, ST". Field rows show the title only.
- The last row is always "My school isn't listed" (or "My field isn't
  listed"). Choosing it shows a text box for the answer.
- Keyboard: Down and Up move, Enter picks, Escape closes. ARIA combobox
  pattern (`role="combobox"`, `aria-expanded`, `aria-controls`,
  `aria-activedescendant`, `role="listbox"` and `role="option"`).
- The picked value shows in the box; clearing the box clears the pick.
- Lists are loaded once by the server page (about 40 KB) and passed as
  props. No requests while typing.

### Month and year dropdowns

`src/components/MonthYear.tsx`: two `select`s, months by name, years from
10 years before this year to 6 years after.

### Validation

`src/lib/validateEducation.ts` (pure, tested), used by both forms and
alongside `validateProfile` (which drops its college and degree checks):

- School: picked, or "not listed" with text.
- Degree: chosen; "Other" needs text; "No degree" only on previous schools.
- Primary field: picked or "not listed" with text, unless "No degree".
- Secondary field: if shown, picked or "not listed" with text.
- Start and end month and year all chosen; end not before start.
- Messages appear under each field, like today.

The database checks the same rules, so a bypassed form can't store bad
data.

### Existing athletes

If a profile has no education row yet but has the old typed text, the
form shows above the School picker: "You entered *UNO*. Please pick your
school from the list." Same for degree above the Degree dropdown. The
note goes away once they save.

## Reports

### Student Athletes

`admin_report_athletes()` is dropped and recreated (its return columns
change). It joins each athlete's current education row (left join, so
athletes without one still appear) and returns, in place of `college` and
`degree`:

`college_name`, `college_city`, `college_state`, `college_other`,
`degree_type`, `degree_other`, `primary_field_title`,
`primary_field_other`, `grad_month`, `grad_year`, and the old `college`
and `degree` text (shown only when there is no education row yet, as
"UNO (not yet picked)").

Columns on the page: Name, School, Degree, Field of study, Graduation
("May 2027"), Sport, Joined.

### Student Athlete Experience Report

Header line per athlete: "University of Nebraska at Omaha · BS, Computer
Science · Graduating May 2027 · Football". A "not listed" answer shows as
typed.

### "Not listed" answers

New table at the bottom of `/admin/reports`, from a new
`admin_report_not_listed()` SQL function (`security definer`, returns no
rows for non-admins, same filters as the athlete list):

| Type | Answer | Athletes | Who |
|---|---|---|---|
| School | Iowa Western CC | 2 | Smith, Jane; Doe, John |

- Covers schools, primary fields, and secondary fields, from current and
  previous schools.
- Answers grouped ignoring case and extra spaces.
- None: "Every athlete picked from the lists."

Formatting lives in `src/lib/reports.ts` (school line, degree and field
line, graduation line), tested.

Reports by university and sport stay out of scope; this work unblocks
them. Parking Lot "Reports at scale" is updated to say the Colleges
pick-list is done.

## Moving Existing Data

Only test and demo profiles exist today.

1. The migration makes `profiles.college` and `profiles.degree` nullable.
2. Claude lists every existing profile's college and degree text. Todd
   and Claude agree what each maps to (for example "BS - Computer
   Science" becomes Bachelor of Science, Computer Science `11.07`).
3. Claude writes `supabase/migrations/2026-10-12-education-backfill.sql`
   creating one current `athlete_education` row per mapped profile. Start
   and graduation dates for demo athletes are agreed with Todd. The audit
   trail records these inserts with `changed_by` null (SQL editor).
4. Anything not mapped keeps its typed text and gets the "You entered..."
   note.

## Release Order

1. Todd runs `2026-10-12-education.sql` (tables, rules, trigger,
   functions, report functions).
2. Todd runs `supabase/reference/reference-data-v1.sql`.
3. Todd runs `2026-10-12-education-backfill.sql`.
4. Push the code to `master` (Vercel deploys).

SQL first, so the live site never runs code ahead of the database. The
current live code keeps working after steps 1 to 3: it still reads and
writes `profiles.college` and `profiles.degree`, which remain.

## Errors

- Save fails (network, rule violation): the existing red message under
  the Save button, with the database message. Nothing is half-saved.
- Lists fail to load on the profile page: the page shows "We couldn't
  load the school and field lists. Please refresh." in place of the
  education fields, and the form can't be saved, so no one saves an empty
  school.
- Report functions fail: the existing Reports error message.

## Code Structure

| File | Change |
|---|---|
| `supabase/migrations/2026-10-12-education.sql` | new |
| `supabase/migrations/2026-10-12-education-backfill.sql` | new |
| `supabase/schema.sql` | mirror the migration |
| `supabase/reference/college-nicknames.json` | new, hand-kept |
| `supabase/reference/reference-data-v1.sql` | new, generated |
| `scripts/build-reference-data.ts` | new |
| `scripts/education-check.ts` | new |
| `src/lib/referenceData.ts` (+ test) | new |
| `src/lib/pickerSearch.ts` (+ test) | new |
| `src/lib/validateEducation.ts` (+ test) | new |
| `src/lib/education.ts` | new: types, degree labels, month names, formatting |
| `src/lib/validateProfile.ts` (+ test) | drop college and degree |
| `src/lib/reports.ts` (+ test) | new columns, not-listed rows |
| `src/components/SearchPicker.tsx` | new |
| `src/components/MonthYear.tsx` | new |
| `src/app/profile/page.tsx` | load lists and education rows |
| `src/app/profile/ProfileForm.tsx` | current school, transfer, `save_profile` |
| `src/app/profile/PreviousSchools.tsx` | new |
| `src/app/admin/reports/page.tsx` | new columns, Not listed table |
| `package.json` | `build-reference-data`, `education-check` scripts |

## Testing

### Unit tests (Vitest)

- `pickerSearch`: name, city, and nickname matches; case and punctuation
  ignored; every typed word must match; exact nickname first; cap of 50.
- `validateEducation`: each rule above, for current and previous schools.
- `referenceData`: tiny sample CSVs in `src/lib/__fixtures__/`. Keeps only
  the five states and `ATHASSOC = 1`; maps `ASSOC1` to `ASSOC6`; splits
  aliases and merges nicknames; drops excluded CIP families and
  deleted or moved codes; strips trailing periods and `="..."`; quoted
  commas parse correctly; generated SQL escapes quotes.
- `reports`: school, degree and field, and graduation lines; "not yet
  picked" fallback; not-listed grouping.
- `validateProfile`: updated for the removed fields.

### Database check script

`npm run education-check`, modeled on `rubric-check`. Signs in as two test
athletes (`+debug` addresses, credentials from `.env.local`) against the
real database and confirms:

- Athlete A can't read, edit, or delete athlete B's education rows.
- Neither can insert, edit, or delete history rows.
- Each insert, edit, and delete leaves one history row with the right
  action, `changed_by`, and before and after values.
- A second current school is rejected.
- `save_profile` with a transfer moves the old current row to previous
  and inserts the new one together.
- A row breaking a rule (no school, end before start) is rejected.

It removes the rows it created when done. History rows it created stay,
which is the point of an audit trail; they belong to test accounts.

### Browser walkthrough

Claude drives it with Playwright on the local dev server, then on the
live site after release; Todd does his own pass.

- New athlete fills in the whole profile.
- Existing athlete sees the "You entered..." note, picks, saves; note
  goes away.
- Picker with keyboard only; "UNO" finds University of Nebraska at Omaha;
  "not listed" path.
- Add, edit, remove a previous school; transfer, then cancel a transfer.
- Phone width (375 px): no sideways scrolling.
- Admin Reports: new columns, Not listed table.

## Done Means

1. Unit tests pass; `education-check` passes.
2. Browser walkthrough is clean on the live site.
3. Demo athletes show a real school, degree, field, and graduation in
   Reports.
4. The Data Sources section and the `data_sources` table both name every
   source.
5. One final code review, then push.

## Out of Scope

- Reports broken down by university and sport (Parking Lot "Reports at
  scale", now unblocked).
- States beyond NE, KS, IA, ND, SD.
- NCAA division (I, II, III) per school; can be joined later on `UNITID`.
- Admin editing of athlete education (Table Editor is the fallback).
- Admins adding "not listed" answers to the lists from the app.
- Linking an experience to the school where it happened (logged in the
  Parking Lot).
- Dropping `profiles.college` and `profiles.degree`.
- Audit history for other profile fields.
