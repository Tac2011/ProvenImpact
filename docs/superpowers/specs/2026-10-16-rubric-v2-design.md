# Rubric v2: Results, Achievement, Analytical, Captains

**Date:** 2026-10-16. **Target:** published before the investor demo, Monday 2026-10-19.
**Decided by:** Todd, cleared with Maggi.

## Why

Demo student Mary Theater's freshman course record (-4, beat the record by 3 strokes, after 4 months of winter simulator rounds) earned only Discipline, Moderate. Her "voted as captain by my teammates" story earned no Leadership. Rubric v1 credits behaviors, not results; has no competency for performing under pressure; and its Leadership text excludes being named captain. Students end up repeating the same training in several stories to get credit.

Todd: answers should follow Problem, Action, Result, and "the result should be a key factor. Elite athletes pride themselves in not just trying hard but accomplishing what they set out to do." On captains: "It's almost always about who SHOWS they are the best and leader at the same time."

## Decisions

1. **Results count (PAR).** In every competency, the line between Moderate and Strong is a specific result the athlete's own actions produced. Discipline and Adaptability Strong text changes; Execution's "Doesn't count" line points personal athletic results to Achievement.
2. **New competency: Achievement** (key `achievement`). Goal or standard, preparation, a personal result that met or beat it. Includes performance under pressure (from Partner_Thoughts.md). One event counts when the preparation is described.
3. **New competency: Analytical** (key `analytical`). Decided 2026-10-15.
4. **Captains.** Elected or selected captain is Moderate Leadership on its own; Strong with actions or a result. This reverses the v1 Leadership "Doesn't count" line and Maggi's v1 blind rating of story 2; Todd cleared the change with her.
5. **Stories rated under v1 keep their v1 strengths.** No re-rating. Todd will show v1 and v2 results side by side in the demo as evidence the system improves. New and Try again stories use v2 once it is published.
6. **The AI prompt does not change.** The rules live in the versioned rubric text, so v1 results and checks are untouched.

Rubric text: `Proven/Rubric_v2_Draft.md`. Todd and Maggi mark it up; the approved file is the source of the SQL.

## Pieces

### 1. Rubric v2 SQL generated from the draft file

`scripts/build-rubric-sql.ts <version> <draft.md> <out.sql>` parses the draft's format (`## N. Label`, `**Definition:**`, `**Strong:**`, `**Moderate:**`, `**Doesn't count:**`, `**Examples:**` bullets with `*Why:*`) and writes `supabase/rubric/rubric-v2.sql`: one `rubric_versions` row (draft) and eight `rubric_competencies` rows. It strips review-only marks: `**[CHANGED]**`, `**[NEW]**`, italic `*(v1 said: ...)*` / `*(No change: ...)*` notes, and the `**Question for you both:**` paragraph. Keys are the label lowercased. The file uses `$q$` quoting like v1 and is safe to rerun only while v2 is a draft (delete and reinsert v2 competencies when `published_at is null`). Because markups may arrive late Saturday, regenerating must be one command.

### 2. Top jobs tables v2

- New map files `supabase/reference/top-jobs/v2/style-map.json` and `v2/self-map.json`. The open list and excluded list are shared with v1.
  - Work styles: Achievement Orientation to `achievement` 1. Perseverance to resilience 0.6, achievement 0.4. Intellectual Curiosity to analytical 0.8, adaptability 0.2. Innovation to analytical 0.5, adaptability 0.4. Attention to Detail to discipline 0.4, execution 0.3, analytical 0.3. Initiative unchanged. All other v1 rows unchanged.
  - Self-assessment: analytical_thinking to analytical 1. problem_solving to analytical 0.5, execution 0.5. competitive_drive to achievement 1. decision_making_under_pressure to achievement 0.5, leadership 0.5. stress_pressure_tolerance to achievement 0.5, resilience 0.5. focus to achievement 0.5, discipline 0.5. Others unchanged.
- `scripts/build-top-jobs-data.ts` takes the tables version as an argument (`-- <version> <review.md>`), reads maps from `v<version>/` when present (v1 keeps the current files), and gets the competency keys from `v<version>/competencies.json` (version 1 has no such folder and keeps its six keys). For version 2 it writes only the `top_jobs_tables` row (referencing rubric version 2) and `occupation_needs`; occupations and field links are already loaded. Output: `supabase/reference/top-jobs-data-v2-partN.sql`, and the review doc `Proven/Top_Jobs_Tables_v2.md`.
- `src/lib/topJobs/tables.test.ts` checks every version's maps against that version's competency list. `scripts/top-jobs-check.ts` reads keys from the tables' rubric.
- **Results line:** when the saved result was made with different tables or rubric versions than the current ones, the header says "We've improved how we match jobs since these results." instead of "Your profile has changed since these results."

### 3. Checks before publishing

- **Rubric check:** `npm run rubric-check -- 2 Proven/Rubric_Check_v2.md` on the rubric's own examples (target: all agree), plus a regression file `Proven/Rubric_v2_Regression_Stories.md` with Mary's three stories and Joe's lifting group story, each with the rating v2 should give (Mary's course record: Achievement Strong; her captain story: Leadership at least Moderate; Joe's: Leadership Strong).
- **Blind check:** Todd and Maggi rate `Proven/Blind_Rating_Stories_v2.md` (12 stories). Run with the same script. Target: 11 of 12 or better, with any miss reviewed by Todd.
- **Top jobs check:** rerun `npm run top-jobs-check` on tables v2; report `Proven/Top_Jobs_Check_v2.md`. Watch item: the Business Administration plus Mathematics student should now reach data roles.

### 4. Publish (Todd, Sunday, only if the checks pass)

```sql
update rubric_versions set published_at = now() where version = 2 and published_at is null;
update top_jobs_tables set published_at = now() where version = 2 and published_at is null;
```

Run both together: tables v2 needs rubric v2's competencies. If the checks don't pass by Sunday night, nothing is published and v1 runs the demo.

## Out of scope

- Re-rating v1 stories (Parking Lot: per-story "Re-check with the new rubric" button before real athletes join).
- Changing the self-assessment items.
- Prompt changes.

## Risks

- **Time.** Markups and blind ratings depend on Todd and Maggi on Saturday. The build does not wait on them: it runs against the current draft and regenerates in one command.
- **Achievement vs Execution overlap.** Both reward finishing. The draft separates them (Execution: work deliverables; Achievement: personal goals and results). The rubric check and blind check show whether the AI keeps them apart.
