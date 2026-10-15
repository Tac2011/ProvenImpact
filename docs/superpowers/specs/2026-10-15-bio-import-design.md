# Proven Impact: Bio Import, Honors, and Story Ideas Design

**Date:** 2026-10-15
**Status:** Draft, awaiting Todd's review

## Purpose

The primary student flow is: profile, assessment, experiences, then top 10
jobs and a PDF report. The more a student tells us, the better the job
matches, so the product should make giving data easy and keep inviting more.

Every college athlete has a university bio written by the athletic
department. It already holds most of the profile (name, sport, position,
school, degree), a list of honors, and the moments that make good
experiences (a torn ACL, a walk-on decision, graduating in three years).
This piece lets a student paste that bio and get:

1. A profile filled in for them to review, instead of a blank form.
2. An **Honors and awards** list on the profile.
3. **Story ideas** on My Experiences: questions about real moments from
   their bio and honors, to start experiences from.

It also delivers Maggi's "upload athlete bio" idea (`Proven/Partner_Thoughts.md`).

### Decisions made while brainstorming

- Story ideas are **prompts the student answers in their own words**, never
  experiences the AI drafts. The rubric scores the student's words.
- Honors are their **own list on the profile**, not experiences. An honor
  can also become a story idea.
- Bio import is offered **at sign-up and any time later** from the profile.
  It never overwrites what the student already saved.
- Story ideas **persist** until used or dismissed, because experiences can
  take days or weeks to write.
- A **cleaned copy** of the bio is stored (birthdates and family details
  removed) for later use by job matching and the PDF report.
- The AI writes school and field names out in full; **our code matches
  them** to the pick-lists. The AI never sees the lists.
- The student reviews the result **in the normal profile form**, not a
  separate review screen. Nothing is saved until they click Save.

### Out of scope

- Importing a bio from a URL (paste only; university sites differ too much).
- Uploading a resume (Maggi's other idea; a later piece).
- Top 10 jobs and the PDF report (steps 4 and 5; they will read the stored
  bio, honors, and experiences).
- Adding Master's or other graduate degrees to the degree list. A bio that
  says "master's" fills degree type **Other** with "Master's" as the text.

## What the Student Sees

### On My Profile

**New student (no saved profile):** a card above the form:

> **Have a university bio?**
> Paste it and we'll fill in your profile for you. You'll check everything
> before it's saved.
> [text box] [Read my bio] Skip, I'll fill it in myself

"Skip" hides the card for this visit. The **Import from my bio** button
(below) is still there.

**Everyone:** an **Import from my bio** button at the top of the profile
opens the same text box and button.

**Read my bio:**
- Button reads "Reading your bio..." with "This can take up to a minute."
- Up to 15,000 characters. The counter shows under the box.
- Counts as one of the 20 AI tries per day (shared with experiences).

**After reading, the form fills in:**
- Empty fields get the bio's value and a small **From your bio** tag.
- Fields the bio didn't cover stay blank.
- A field that already has a saved value keeps it. If the bio says
  something different, a line under it reads:
  *Your bio says: "Guard." [Use this]*
- A pick-list the bio couldn't match stays blank with:
  *Your bio says "Nebraska." Pick your school.*
- Nothing is saved until **Save**.

**Previous schools from the bio** (Cale's bachelor's at UNL) show in the
Previous schools section as suggestions:
*From your bio: University of Nebraska-Lincoln · BBA · Business
Administration · 2022 to May 2025 [Add] [Skip]*.
**Add** opens the existing previous-school editor pre-filled; the student
completes any blank month and saves it as today. Suggestions appear only
after the current school is saved, matching the section's existing rule.

### Honors and awards (new profile section, below Previous schools)

- Each honor is one line: "Academic All-Big Ten · 2024, 2025, 2026", with
  Edit and Remove (Remove asks to confirm).
- **Add an honor** opens Title (required, up to 200 characters) and Years
  (optional, up to 100 characters), with Save and Cancel.
- Add, edit, and remove save right away, like Previous schools.
- **Honors from the bio** appear as checked suggestions in the profile
  form, just above **Save Profile** (that Save is what adds them, and the
  Honors section sits outside the form). They are added when the student
  clicks Save.
  Unchecking one skips it. An honor already on the list (same title,
  ignoring case and spacing) is not suggested again.

### Story ideas (top of My Experiences)

Created when the student saves the profile after a bio import.

> **Story ideas from your bio**
> You tore your ACL in your first game as a junior. What did you do next?
> [Write this story] [Not for me]

- **Write this story** opens the new-experience form with the idea shown
  above the fields as a guide. When the experience is saved (finished or
  for later), the idea is marked used and linked to it.
- **Not for me** marks it dismissed. It disappears.
- Open ideas show until used or dismissed, newest import first.
- The box is hidden when there are no open ideas.
- Ideas come from moments in the bio and from honors ("You made Academic
  All-Big Ten three years in a row. What did it take to balance Division I
  basketball with classes?").

## Data

Three new tables, each with row level security: an athlete can read and
change only their own rows. Platform admins get no access in this piece.

### `bio_imports`

One row each time a student reads a bio.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `athlete_id` | uuid | references `auth.users`, not null |
| `cleaned_text` | text | not null; the bio with birthdates and family details removed |
| `extracted` | jsonb | not null; checked profile values, honors, story ideas |
| `created_at` | timestamptz | not null, default now() |
| `applied_at` | timestamptz | null until the student saves the profile |

- The student's current bio is their latest row with `applied_at` set.
  Older rows stay as history (a new bio each season).
- The raw pasted text is never stored.
- Rows are written by the server action after the AI call, so the AI's
  output never round-trips through the browser.
- Athletes can insert, select, and update their own rows (update is how
  `applied_at` gets set, in the save path below). No delete in this piece.

### `athlete_honors`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `athlete_id` | uuid | references `auth.users`, not null |
| `title` | text | not null, 1 to 200 characters |
| `years` | text | null, up to 100 characters |
| `source` | text | not null, `bio` or `manual` |
| `created_at` | timestamptz | not null, default now() |

Athletes can select, insert, update, and delete their own rows.

### `story_ideas`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `athlete_id` | uuid | references `auth.users`, not null |
| `bio_import_id` | uuid | references `bio_imports`, not null |
| `prompt` | text | not null, up to 500 characters |
| `source` | text | not null, `bio` or `honor` |
| `status` | text | not null, default `open`; `open`, `used`, or `dismissed` |
| `experience_id` | uuid | null; references `experiences` on delete set null |
| `created_at` | timestamptz | not null, default now() |

Athletes can select, insert, and update their own rows.

### Account deletion

Deleting an account must remove these rows. The plan checks how the
existing deletion flow removes `experiences` and other athlete rows and
does the same for the three new tables.

## Reading the Bio

### Server action: `readBio(text)`

In `src/app/profile/bioActions.ts`.

1. Signed in, else "Please log in again."
2. Trim; empty gives "Paste your bio first."; over 15,000 characters gives
   "That's longer than a bio. Paste up to 15,000 characters."
3. Daily limit: the same check and run log as experiences. The existing
   `startRun` logic moves from `src/app/experiences/actions.ts` to a shared
   `src/lib/aiRuns.ts` so both use it unchanged. (The rubric check stays in
   the experience actions; bio reading doesn't need a rubric.)
4. One AI call (below). Failure gives "We couldn't read your bio. Try
   again, or fill in your profile yourself."
5. Check the output (below). If nothing usable remains (no name, sport,
   school, honor, or idea), give "We didn't find profile details in that
   text. Check that you pasted your athlete bio."
6. Insert the `bio_imports` row and return its id plus the checked values
   for the form.

### The AI call

`readBio` in `src/lib/claude.ts`, using the existing `structuredCall` with
its own 60-second timeout (experiences keep 30). Prompt in
`src/lib/bioPrompts.ts`. The model returns:

- `cleaned_bio`: the bio with birthdates, ages, and the names of parents,
  siblings, and other family removed. **Delete only, never rewrite**; all
  other text stays word for word.
- `first_name`, `last_name`.
- `sport` and `positions` or `disciplines`.
- `schools`: each with the college's full official name, whether it's the
  current school, degree type (from the app's list, plus "Master's",
  "Other", or "Unknown"), field of study in plain words, and start and end
  month and year where the bio states them.
- `honors`: title and years.
- `story_ideas`: 5 to 12 questions in second person, each about a specific
  moment, decision, setback, or achievement in the bio or honors, asking
  what the student did. Never about family. The prompt includes every
  earlier idea for this athlete (any status) with "do not repeat these".
- High schools, stats, and personal bests are not returned as schools or
  honors. Stats can inspire story ideas.

Every value is optional; an empty string or missing value means "not in
the bio".

### Checking the output (`src/lib/bioImport.ts`, pure, tested)

- **Names:** trimmed, up to 100 characters.
- **Sport:** must exactly match a name in `SPORTS` (ignoring case), else
  blank with the "Your bio says" hint.
- **Positions or disciplines:** kept only for the matched sport's type.
- **School:** `searchOptions` over the college options. Filled only when
  the top result's normalized name equals the AI's normalized name, or the
  search returns exactly one result. Otherwise blank with the hint.
- **Field of study:** the same rule over the field options.
- **Degree type:** must be one of `DEGREE_TYPES`. "Master's" becomes
  `OTHER` with `degree_other` "Master's". Unknown stays blank.
- **Dates:** months 1 to 12, years within the existing dropdown range. A
  year without a month fills the year only.
- **Honors:** trimmed, empty dropped, title capped at 200 and years at 100,
  duplicates (normalized title) dropped, at most 30.
- **Story ideas:** trimmed, empty dropped, capped at 500 characters, exact
  duplicates of earlier ideas (normalized) dropped, at most 12.
- **Cleaned bio:** must be non-empty and no longer than the pasted text,
  else the import fails with the "couldn't read" message.

## Saving

The profile's **Save** works as today (`save_profile`), then, when a bio
import is pending on the form:

1. Insert the checked honor suggestions into `athlete_honors` with source
   `bio`.
2. Insert the import's story ideas into `story_ideas` (read from the
   `bio_imports` row on the server, not from the browser).
3. Set `applied_at` on the import.

Steps 1 to 3 run in a new server action, `applyBioImport(importId,
keptHonors)`, after `save_profile` succeeds. It runs only if the import
belongs to the athlete and `applied_at` is null, so a double click can't
add ideas twice. If it fails, the profile is still saved and the student
sees "Your profile was saved, but we couldn't add your honors and story
ideas. Click Save again to retry."

Saving a profile without a pending import is unchanged.

## Errors

| Situation | Message |
|---|---|
| Not signed in | Please log in again. |
| Empty paste | Paste your bio first. |
| Over 15,000 characters | That's longer than a bio. Paste up to 15,000 characters. |
| Over the daily limit | The existing daily limit message. |
| AI fails or times out | We couldn't read your bio. Try again, or fill in your profile yourself. |
| Nothing usable | We didn't find profile details in that text. Check that you pasted your athlete bio. |
| Apply step fails | Your profile was saved, but we couldn't add your honors and story ideas. Click Save again to retry. |
| Honor save fails | The existing red message style under the honor's Save. |

## Privacy

- The form's existing notice style is reused under the bio box: "Your bio
  is sent to Claude, an AI from Anthropic, to fill in your profile.
  Anthropic doesn't use it to train its models. We remove birthdates and
  family names before storing it."
- Only the cleaned text is stored.
- Before inviting real athletes, the privacy policy page (already on the
  Parking Lot) must mention bio storage.

## Release Order

1. Todd runs `supabase/migrations/2026-10-15-bio-import.sql` (three
   tables, policies).
2. Push the code to `master`.

SQL first, so the live site never runs code ahead of the database.

## Code Structure

| File | Change |
|---|---|
| `supabase/migrations/2026-10-15-bio-import.sql` | new |
| `supabase/schema.sql` | mirror the migration |
| `src/lib/aiRuns.ts` | new: daily limit check and run log, moved from experience actions |
| `src/app/experiences/actions.ts` | use `aiRuns.ts` |
| `src/lib/bioPrompts.ts` (+ test) | new: prompt and output schema |
| `src/lib/bioImport.ts` (+ test) | new: checks, matching, merging into form values |
| `src/lib/claude.ts` | `readBio`, per-call timeout |
| `src/app/profile/bioActions.ts` | new: `readBio`, `applyBioImport` |
| `src/app/profile/BioImport.tsx` | new: card, text box, button |
| `src/app/profile/ProfileForm.tsx` | from-bio tags, "Your bio says" lines, apply after save |
| `src/app/profile/PreviousSchools.tsx` | bio suggestions |
| `src/app/profile/Honors.tsx` | new |
| `src/app/profile/page.tsx` | load honors and pending state |
| `src/app/experiences/StoryIdeas.tsx` | new |
| `src/app/experiences/page.tsx` | load and show open ideas |
| `src/app/experiences/new/page.tsx` | show the idea as a guide (`?idea=<id>`) |
| `src/app/experiences/actions.ts` | mark the idea used on create or save for later |
| `scripts/bio-check.ts` | new: runs example bios, writes a report |
| `package.json` | `bio-check` script |

## Testing

### Unit tests (Vitest)

- `bioImport`: sport matching; positions vs disciplines; school and field
  matching (clear match fills, ambiguous or none leaves blank with hint);
  degree mapping including Master's; date checks including year without
  month; honor trimming, caps, and duplicates; idea duplicates against
  earlier ideas; the "nothing usable" rule; merging (empty fields filled,
  saved fields kept, differences listed).
- `bioPrompts`: earlier ideas are included; the bio text is included once.
- `aiRuns`: existing daily-limit tests still pass after the move.

### Bio check script

`npm run bio-check -- <bios.txt> <report.md>` reads bios separated by a
line of dashes, runs each through the real AI call and checks, and writes
a report: the filled values, unmatched hints, honors, story ideas, and the
cleaned bio. The cleaned bio is checked for any birthdate or family name
that appeared in the original. Run against
`Proven/Context/University Bio Examples.txt` before release; Todd reviews
the report.

### Browser checks (Todd)

A checklist in the plan: new student with Cale's bio, existing profile with
a different position, an unmatched school, honors suggestions, story ideas
used and dismissed, re-import with no repeated ideas, and the daily limit.
