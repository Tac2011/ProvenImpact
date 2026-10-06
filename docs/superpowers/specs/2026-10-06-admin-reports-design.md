# Proven Impact: Admin Reports Design

**Date:** 2026-10-06
**Status:** Draft, awaiting Todd's review

## Purpose

Todd and his partner are demoing Proven Impact to a possible financial
investor at the end of the week. The investor isn't technical. The demo
shows several athletes in the system, an athlete's own pages (experiences,
self-assessment), athletes creating, editing, and deleting their own data,
and two basic reports. This piece builds the reports.

Decided with Todd during brainstorming:

| Question | Decision |
|---|---|
| Who sees the admin pages? | Shown in the demo, but they don't need polish. Plain and readable, matching the Dashboard. |
| CRUD | Athlete CRUD (profile, self-assessment, experiences) is enough for the demo; it's already built. Admin editing of athlete data is out of scope. Behind the scenes, fixes go through Supabase's Table Editor. |
| Reports | 1. Student Athletes: name, college, degree, sport. 2. Student Athlete Experience Report (SAER): each athlete, each experience, its strengths. |
| SAER experiences | Mapped and confirmed only, with a status. |
| Data access | One small SQL function for the athlete list, so it matches the Dashboard's Athletes count; normal reads for experiences and strengths. |

## Page

`/admin/reports` replaces the "Coming soon" page. The existing proxy rule
already sends non-admins away from `/admin/*`; the page also keeps its own
server-side admin check, like the Dashboard.

Plain styling: white background, the Dashboard's heading sizes, gray
secondary text. Each table sits in a horizontally scrolling box so the
page doesn't overflow at phone width.

### 1. Student Athletes (N)

| Name | College | Degree | Sport | Joined |
|---|---|---|---|---|
| Campbell, Todd | UNO | Business | Golf | Oct 6, 2026 |

- N is the number of rows. It matches the Dashboard's Athletes tile:
  student athletes with a saved profile, excluding archived (approved
  deletion) accounts and admin accounts.
- Sorted by last name, then first name, ignoring case.
- No email column, to keep personal details off the demo screen.
- No athletes: "No student athletes yet."

### 2. Student Athlete Experience Report

Grouped by athlete, in the same order as the first table:

> **Todd Campbell** · UNO · Golf
> - **Golf rehab after wrist surgery**, Confirmed, Oct 6, 2026
>   Strengths: Resilience (Strong), Discipline (Moderate)
> - **Leading the halftime huddle**, Awaiting confirmation, Oct 6, 2026
>   Strengths: Leadership (Strong)
>
> **Jane Smith** · Creighton · Track and Field
> - No experiences yet.

- Every athlete from the first table appears, including those with no
  experiences ("No experiences yet.").
- Only experiences with status `mapped` (shown as **Awaiting
  confirmation**) or `confirmed` (shown as **Confirmed**). Drafts,
  follow-ups, and failed runs are left out.
- Experiences newest first. The date is when the experience was created.
- Strengths: only evidence the athlete kept (`included = true`). Strong
  before Moderate, then alphabetical, the same order as the athlete's own
  result card. Shown as "Label (Strong)".
- An experience with no kept strengths shows "Strengths: none kept."
- Competency labels come from the rubric version each experience was
  scored against, using the existing `competencyLabel()`, which falls back
  to a title-cased key.
- Dates use `America/Chicago`, so an evening entry doesn't show
  tomorrow's date (Vercel runs in UTC).

## Data

### Athlete list: new SQL function

```sql
-- Student athletes for the admin reports. Same filter as admin_dashboard_stats,
-- so the list matches the Athletes tile. Returns no rows for non-admins.
create function admin_report_athletes()
returns table (
  id          uuid,
  first_name  text,
  last_name   text,
  college     text,
  degree      text,
  sport       text,
  created_at  timestamptz
)
language sql security definer stable
set search_path = public
as $$
  select p.id, p.first_name, p.last_name, p.college, p.degree, p.sport, p.created_at
  from profiles p
  left join user_roles r on r.id = p.id
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
```

Todd runs this as `supabase/migrations/2026-10-06-admin-report-athletes.sql`
in the Supabase SQL editor, and `schema.sql` gains the same function.

### Experiences and strengths: existing admin read policies

Admins can already read all experiences and evidence. The page makes two
more queries, using the athlete IDs from the function:

1. `experiences`: `id, athlete_id, title, status, created_at,
   rubric_version_id, experience_evidence(competency_key, strength,
   included)`, where `athlete_id` is in the list and `status` is `mapped`
   or `confirmed`, newest first.
2. `rubric_competencies`: `rubric_version_id, key, label` for the rubric
   versions those experiences used (skipped if there are none).

Skipped entirely when there are no athletes.

### Errors

- If the function call fails, the page shows "Couldn't load reports.
  Refresh to try again." instead of either section, and logs the error on
  the server.
- If the experiences query fails, the athlete table still shows and the
  SAER section shows "Couldn't load the experience report. Refresh to try
  again." and logs the error.
- If the label query fails, labels fall back to the title-cased key.

## Code Structure

| File | Change |
|---|---|
| `supabase/migrations/2026-10-06-admin-report-athletes.sql` | New. The function above. |
| `supabase/schema.sql` | Add the function under Dashboard. |
| `src/lib/reports.ts` | New. Pure functions: `buildExperienceReport(athletes, experiences, labels)` groups experiences under athletes, filters statuses and kept strengths, sorts, and labels; `experienceStatusLabel(status)`; `formatReportDate(iso)`. |
| `src/lib/reports.test.ts` | New. Unit tests for the above. |
| `src/app/admin/reports/page.tsx` | Rewritten. Server component: admin check, the three reads, renders both sections. |

## Testing

- **Unit (Vitest), `reports.test.ts`:**
  - Athletes keep their order; an athlete with no experiences gets an
    empty list.
  - Only `mapped` and `confirmed` experiences appear, even if the query
    returns others.
  - Removed strengths (`included = false`) are left out.
  - Strengths: Strong before Moderate, then alphabetical.
  - Labels come from the experience's own rubric version; an unknown key
    falls back to the title-cased key.
  - Status labels: `mapped` → "Awaiting confirmation", `confirmed` →
    "Confirmed".
  - `formatReportDate` gives "Oct 6, 2026", and a late-evening Central time
    stays on the same day.
- **SQL check:** `select * from admin_report_athletes();` run plainly in
  the SQL editor returns no rows (no signed-in user); the browser check
  below covers the admin case.
- **Manual, in the browser:**
  1. Admin: the Student Athletes count matches the Dashboard tile; each
     athlete appears in both sections; an experience at each status shows
     or hides as described; a removed strength doesn't appear.
  2. Phone width: tables scroll sideways without the page overflowing.
  3. Athlete: `/admin/reports` still redirects to `/profile`.

## Out of Scope

- Admin create, edit, or delete of athlete data.
- Self-assessment scores in the reports.
- Filters, search, export to CSV or PDF, and printing.
- Granting admin rights from the app. Todd grants them with a SQL insert
  into `user_roles`.
