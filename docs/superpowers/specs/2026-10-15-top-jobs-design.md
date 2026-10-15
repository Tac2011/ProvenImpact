# Proven Impact: My Top Jobs Design

**Date:** 2026-10-15
**Status:** Draft, awaiting Todd's review

## Purpose

Step 4 of the primary student flow: using everything a student has told us
(profile, education, self-assessment, experiences, honors, bio), show the 10
occupations they fit best and explain why, in their own words.

The bigger goal: college athletics builds specialized strengths over 4 to 5
intense years. Matching must let those strengths put a job on the list by
themselves, not only break ties between degree-related jobs, so employers can
see what this group of people brings.

### Decisions made while brainstorming

- A "job" is an **occupation** (O\*NET), not a live posting or an employer
  opening. Employer opportunities come later with the employer side.
- **Data scores, the AI explains.** Code ranks occupations; the AI only writes
  "why you" for each. Same inputs always give the same list.
- Candidates come from **two places**: occupations linked to the student's
  fields of study, and a curated **open-to-any-degree** list that any athlete
  can reach.
- **Every field of study counts**: primary and secondary fields at the current
  school and at previous schools, weighted. A Business Administration major
  with a Mathematics minor reaches analyst and technical project roles.
- **Todd and Maggi approve** the open-to-any-degree list and both translation
  tables before the page goes live, like the rubric.
- Results are **saved and versioned**. The AI runs only for jobs whose
  explanation is new or stale.
- Every student always gets 10 jobs. Each shows a **match level**; thin data
  shows an encouraging **early results** note naming what to add.

### Out of scope

- Live job postings and employer opportunities.
- More than 10 jobs on the page (Parking Lot: "Show more than 10 job
  matches"; every scored candidate is saved, so it's a display change later).
- "What to build next" (skills or certifications to strengthen a fit).
- The PDF report (step 5), which will read the saved results.
- Programming-language-level detail (Java vs COBOL). These are skills within
  an occupation; explanations may mention them when the student's own words do.

## What the Student Sees

### Menu

A new **My Top Jobs** item for athletes, after My Experiences. Like My
Experiences, it appears only when a rubric is published and the top jobs
tables are published (see Release Gate).

### Before results

- **Profile or self-assessment not complete:** "Finish your profile and
  self-assessment to see your top jobs," with links to each.
- **Ready:** a **Generate my top 10 jobs** button and "The more experiences you
  add, the better your matches."
- With fewer than 3 counted experiences, also: "You have 1 experience. Matches
  will lean on your degree until you add more." (Count and plural adjust.)
- With in-progress experiences: "Finish your 2 in-progress experiences to
  include them."

Generating shows "Finding your matches... this can take up to a minute."

### Results

**Header:**
- "Your top jobs, [date]."
- "Based on your profile, self-assessment, 7 experiences, 8 honors, and your
  bio." Parts with nothing are left out.
- **Up to date:** "Your results are up to date."
- **Changed since:** "You've added 3 experiences since these results." (or
  "Your profile has changed since these results.") with **Update my results**.
- After an update with new jobs: "2 new matches since your last results."
- **Early results note** (see Match Levels): "These are early results. Add
  [what's missing] and your matches will sharpen."

**Ten cards, ranked.** Each card:
- Title, and a **New** badge if it wasn't in the previous results.
- Match level: **Strong match**, **Good match**, or **Possible match**.
- Two-sentence description (O\*NET).
- Typical pay (national median annual wage) and outlook (for example "Growing
  faster than average").
- **Why you:** two or three sentences quoting the student's own experiences,
  honors, or bio.
- Strength tags: the rubric competencies that drive the fit (up to three).
- Degree link: "Linked to your Business Administration degree" (field names
  joined with "and" when several) or "Open to any major."

**When an explanation couldn't be written:** the card shows "Fits your
strengths in Leadership and Resilience." (from its strength tags) and the page
shows **Try again** for the missing explanations.

## Matching

Everything is translated into the **rubric competencies** (v1: Leadership,
Discipline, Resilience, Adaptability, Communication, Execution), the language
the experience evidence already uses.

### Reference data (loaded once, versioned)

| Data | Source | Used for |
|---|---|---|
| Occupations: code, title, description, job zone | O\*NET database (current release), CC BY 4.0 | Cards; candidates limited to job zones 3 to 5 |
| Work style importance per occupation | O\*NET Work Styles file | What each job needs |
| CIP to SOC crosswalk | NCES CIP 2020 to SOC 2018 crosswalk | Degree candidates |
| Median annual wage | BLS Occupational Employment and Wage Statistics, national | Pay |
| Projected growth | BLS Employment Projections | Outlook wording |

- O\*NET codes (for example `15-1252.00`) join to SOC 2018 codes on their
  first 7 characters. Occupations are kept at the O\*NET-SOC level.
- Fields of study are stored as 4-digit CIP codes (`52.02`); the crosswalk's
  6-digit codes are rolled up to 4 digits.
- Every dataset gets a `data_sources` row (publisher, edition, retrieved date,
  checksum), like the education lists.
- A build script, like `build-reference-data`, reads the downloaded files and
  writes a SQL file Todd runs. The plan confirms the exact file and column
  names of the current releases before writing the script.

### The approved tables (Todd and Maggi)

Kept as versioned JSON files in the repo and loaded with the reference data:

1. **Work styles to competencies:** each O\*NET work style maps to one or more
   rubric competencies with a weight. Example: Stress Tolerance and
   Persistence count toward Resilience.
2. **Self-assessment to competencies:** each of the 24 self-assessment items
   maps to one or more rubric competencies. Example: Work Ethic, Consistency,
   and Dependability count toward Discipline.
3. **Open to any degree:** 30 to 40 O\*NET occupations, each with a one-line
   reason. Drafted from O\*NET (degree-level job zones, high importance on
   athlete-type work styles), including roles like Project Management
   Specialists, Information Technology Project Managers, Management Analysts,
   Business Intelligence Analysts, Sales Managers, and operations roles.

A **review document** (`Proven/Top_Jobs_Tables_v1.md`) shows all three in plain
language for markup. Changes go back into the JSON files; nothing in code.

### Job needs

For each occupation, its need for each rubric competency (0 to 1) comes from
its work style importance ratings passed through table 1, then normalized so
the competencies sum to 1. Computed in the build script and stored.

### Student strength profile

Each rubric competency gets a strength from 0 to 1:

- **Evidence** from counted experiences (status `mapped` or `confirmed`),
  using included evidence items: strong = 1.0, moderate = 0.5 per item,
  combined with diminishing returns: `evidence = 1 - exp(-points / 2)`.
- **Self-assessment** (1 to 5 per item) passed through table 2 and scaled to
  0 to 1.
- **Blend:** `strength = 0.75 * evidence + 0.25 * self` once the student has
  any counted evidence for that competency; otherwise `0.5 * self` (a
  self-rating alone can't reach the top of the scale).

### Candidates and degree fit

- **Fields:** every field on `athlete_education` rows: current primary (1.0),
  current secondary (0.6), previous primary (0.8), previous secondary (0.5).
  "Not listed" fields (typed text) have no code and add no candidates.
- **Degree fit** for an occupation: the highest weight among the student's
  fields that link to it, plus 0.15 for each additional linked field, capped at
  1.0.
- **Candidates:** every degree-linked occupation (job zone 3 to 5) plus every
  occupation on the open list (degree fit 0 unless also degree-linked).

### Score

- **Strength fit** = sum over competencies of `need * strength` (0 to 1).
- **Proof weight** grows with counted experiences:
  `w = min(0.7, 0.15 + 0.11 * experiences)` (0 experiences: 0.15; 5 or more:
  0.7).
- **Score** = `(1 - w) * degreeFit + w * strengthFit`, reported 0 to 100.
- **Rank** by score, ties by title. The top 10 are shown; all are saved.
- **Strength tags:** the three competencies with the largest `need * strength`
  for that occupation, shown only if their product is above 0.05.
- **Degree link** text: the linked fields' titles, or "Open to any major."

All constants above live in one file (`src/lib/topJobs/constants.ts`) so tuning
is one edit, checked by the check script.

### Match levels and early results

- **Strong match:** score 70 or above. **Good match:** 50 to 69. **Possible
  match:** below 50. (Starting thresholds; tuned with the check script report.)
- **Early results** when fewer than 4 of the 10 are Strong or Good. The note
  lists what's missing, in this order, at most two:
  - "your field of study" (no coded field)
  - "a few more experiences" (fewer than 5 counted)
  - "finish your in-progress experiences" (any in progress)
  - otherwise "more experiences" generally.

## Saving and Freshness

### `top_jobs_tables`

One row per approved version of the three tables: `id`, `version` (1, 2,
...), `rubric_version_id` (the rubric its competencies belong to),
`published_at` (null = draft), `created_at`. The job needs, competency maps,
and open list rows reference it, so publishing a v2 never changes saved v1
results. Signed-in users can read it; only SQL run by Todd writes it.

### `top_job_results`

| Column | Notes |
|---|---|
| `id` | uuid primary key |
| `athlete_id` | references `auth.users` |
| `created_at` | |
| `fingerprint` | text: hash of every input (see below) |
| `inputs_summary` | jsonb: counts for the header and the "changed since" line |
| `versions` | jsonb: rubric version id, tables version, reference data version, scoring version |
| `ranked` | jsonb: every candidate with code, score, level, strength tags, degree link, in rank order |
| `explanations` | jsonb: for the top 10, `{ code: { why, quoted_experience_ids } }`; missing when not written |

Row level security: athletes insert and read their own rows. No update or
delete (each run is a new version); filling missing explanations on Try again
inserts a new row with the same ranking.

### Fingerprint and "changed since"

The fingerprint hashes: profile sport and positions, every education field
code, every self-assessment score, each counted experience's id and
`updated_at`, its included evidence, honor titles, the current bio import id,
and the versions. Equal fingerprints mean "up to date": the button shows the
saved results without scoring again or calling the AI.

The "changed since" line compares the saved `inputs_summary` counts to current
counts (experiences, honors) and falls back to "Your profile has changed" for
other differences.

### Generating

Server action `generateTopJobs()`:
1. Signed in; profile and self-assessment complete; tables published.
2. Load inputs, compute the fingerprint. Same as the latest saved: return it.
3. Score (pure, no AI).
4. For each top 10 job, reuse the latest saved explanation if that job was in
   the latest results and every experience it quotes still exists with the
   same `updated_at`. The rest need explanations.
5. If any need explanations: the daily AI limit check (shared, one try), then
   one Claude call for all of them.
6. Save the new row and return it.

### Explanations (Claude)

One structured call with, per job: title, description, and its top
competency needs; and once, the student's material: each counted
experience's id, title, and included evidence quotes (the athlete's own
words, already validated), honors, and the cleaned bio.

Returns per job: `why` (2 to 3 sentences, second person, no invented facts)
and the experience ids it draws on. Checks:
- `why` non-empty, up to 600 characters.
- Every quoted phrase in `why` (text inside quotation marks) must appear in
  the student's material; otherwise that explanation is dropped (card falls
  back).
- Unknown experience ids are dropped.

Timeout 60 seconds. A failed call saves the results with the explanations
that did succeed (possibly none).

## Release Gate

1. Build the reference data and the review document; Todd and Maggi mark up
   and approve the three tables.
2. Todd runs the reference data SQL and the tables migration.
3. A `top_jobs_tables` version row is published (`published_at` set), like
   rubric publishing. The menu item and page require a published version;
   locally `ALLOW_DRAFT_RUBRIC=true` also shows a draft.
4. Push.

## Errors

| Situation | Message |
|---|---|
| Not signed in | Please log in again. |
| Profile or self-assessment incomplete | Finish your profile and self-assessment to see your top jobs. |
| Daily limit | The existing daily limit message. |
| Scoring or save fails | We couldn't find your matches. Please try again. |
| Explanations fail | Results show; cards fall back; "We couldn't write some explanations. Try again." |

## Testing

### Unit tests (Vitest, pure)

- Strength profile: evidence weights and diminishing returns; self-assessment
  mapping; blend with and without evidence.
- Degree fit: field weights, the multi-field bonus and cap, not-listed fields.
- Proof weight at 0, 1, 5, and 10 experiences; score and ranking with ties.
- Strength tags and degree link text.
- Match levels and the early results note (each missing item).
- Fingerprint changes when each input changes and not otherwise.
- Explanation reuse rules; explanation checks (quotes, ids, length).

### Check script

`npm run top-jobs-check -- <report.md>` runs four test students through
scoring and the real explanation call and writes a report for Todd and Maggi:
each student's top 10 with scores, levels, tags, degree links, explanations,
and the early results note.

1. Cale Jacobsen: Business Administration (previous), Master's (current), 8
   honors, several experiences written from his bio.
2. Charlie Thorne: sophomore, no field of study, 2 experiences.
3. Business Administration major, Mathematics minor, 5 experiences.
4. English major, Russian Literature minor, 6 experiences with strong
   leadership and execution evidence.

Success looks like: 3 includes analyst or technical project roles; 4 includes
program or project management roles from the open list; 2 shows the early
results note.

### Browser checks (Todd)

A checklist in the plan: not ready, first generate, up to date, add an
experience then update (with New badges), explanation fallback, and the menu
hidden until published.

## Code Structure

| File | Change |
|---|---|
| `supabase/migrations/2026-10-15-top-jobs.sql` | new: reference tables, `top_jobs_tables`, `top_job_results`, policies |
| `supabase/schema.sql` | mirror |
| `supabase/reference/top-jobs/*.json` | new: the three approved tables |
| `scripts/build-top-jobs-data.ts` | new: O\*NET, crosswalk, BLS files to SQL |
| `supabase/reference/top-jobs-data-v1.sql` | new, generated |
| `src/lib/topJobs/constants.ts` | new: weights and thresholds |
| `src/lib/topJobs/score.ts` (+ test) | new: strength profile, degree fit, score, rank, levels, early note |
| `src/lib/topJobs/fingerprint.ts` (+ test) | new |
| `src/lib/topJobs/explain.ts` (+ test) | new: prompt, output checks, reuse rules |
| `src/lib/claude.ts` | `requestJobExplanations` |
| `src/app/top-jobs/page.tsx`, `TopJobsView.tsx`, `actions.ts` | new |
| `src/lib/navigation.ts` (+ test) | My Top Jobs item |
| `scripts/top-jobs-check.ts`, `package.json` | new script |
| `Proven/Top_Jobs_Tables_v1.md` | review document (outside the repo) |
