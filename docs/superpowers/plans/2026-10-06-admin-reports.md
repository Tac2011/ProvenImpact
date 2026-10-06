# Admin Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Coming soon" Reports page with two plain reports for Platform Admins: a Student Athletes list and the Student Athlete Experience Report (SAER).

**Architecture:** A new security-definer SQL function `admin_report_athletes()` returns the athlete list with the same filter as the Dashboard's Athletes tile. The page reads experiences, evidence, and rubric labels through existing admin read policies. A pure module `src/lib/reports.ts` turns those rows into the grouped report, so all the filtering, sorting, and labeling is unit tested.

**Tech Stack:** Next.js 16 (App Router, server components), Supabase (Postgres, RLS), TypeScript, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-admin-reports-design.md`

## Global Constraints

- Only Platform Admins see the page: the proxy already guards `/admin/*`; the page also checks `getUserRole(...) === 'platform_admin'` and redirects others to `/profile`, like `src/app/admin/page.tsx`.
- SAER includes only experiences with status `mapped` (label "Awaiting confirmation") or `confirmed` (label "Confirmed").
- Strengths: only `included = true`; Strong before Moderate, then alphabetical by label; shown as `Label (Strong)` / `Label (Moderate)`.
- Labels come from the experience's own rubric version via `competencyLabel()`, which falls back to a title-cased key.
- Dates formatted like `Oct 6, 2026` in `America/Chicago`.
- No email column. No admin editing. No em dashes in any user-facing copy.
- Copy, exactly: "No student athletes yet.", "No experiences yet.", "Strengths: none kept.", "Couldn't load reports. Refresh to try again.", "Couldn't load the experience report. Refresh to try again."
- Plain styling matching the Dashboard (`mx-auto max-w-4xl p-8`, `text-2xl font-bold` heading). Tables wrapped in `overflow-x-auto`.

## Review Focus

1. An experience from an athlete who isn't in the list (archived, or an admin) must not appear or crash the report. Test in Task 2.
2. An experience with a null `rubric_version_id`, or a key missing from its version's labels, still shows a readable label (title-cased key). Test in Task 2.
3. The same competency key with different labels in two rubric versions: each experience uses its own version's label. Test in Task 2.
4. An experience whose strengths were all removed shows "Strengths: none kept." instead of nothing. Test in Task 2 (empty `strengths`), copy in Task 3.
5. An entry made late in the evening, Central time, shows that day's date, not the next day's (Vercel runs in UTC). Test in Task 2.

---

### Task 1: The `admin_report_athletes()` SQL function

**Files:**
- Create: `supabase/migrations/2026-10-06-admin-report-athletes.sql`
- Modify: `supabase/schema.sql` (after `admin_dashboard_stats`, before the `-- Experience evidence` heading)

**Interfaces:**
- Produces: RPC `admin_report_athletes()` returning rows `{ id: uuid, first_name, last_name, college, degree, sport: text, created_at: timestamptz }`, sorted by last name then first name (case-insensitive). No rows for non-admins.

- [ ] **Step 1: Write the migration**

`supabase/migrations/2026-10-06-admin-report-athletes.sql`:

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

- [ ] **Step 2: Add the same function to `schema.sql`**

Insert the migration's body (from `-- Student athletes for the admin reports.` through the `grant` line) after the closing `$$;` of `admin_dashboard_stats`, with one blank line before `-- Experience evidence`.

- [ ] **Step 3: Todd runs the migration**

Todd pastes the migration into the Supabase SQL editor and runs it. Expected: "Success. No rows returned."

Then: `select * from admin_report_athletes();`
Expected: no rows (the editor has no signed-in user, so `is_platform_admin()` is false). The admin case is checked in the browser in Task 3.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-10-06-admin-report-athletes.sql supabase/schema.sql
git commit -m "Add admin_report_athletes() for the admin reports"
```

---

### Task 2: Report building in `src/lib/reports.ts`

**Files:**
- Create: `src/lib/reports.ts`
- Test: `src/lib/reports.test.ts`

**Interfaces:**
- Consumes: `competencyLabel(key, competencies)` from `src/lib/rubric.ts`; `ExperienceStatus`, `Strength` from `src/lib/experiences.ts`.
- Produces:
  ```ts
  export const REPORTED_STATUSES: ExperienceStatus[]; // ['mapped', 'confirmed']
  export interface ReportAthlete { id: string; first_name: string; last_name: string; college: string; degree: string; sport: string; created_at: string }
  export interface ReportExperienceRow { id: string; athlete_id: string; title: string; status: ExperienceStatus; created_at: string; rubric_version_id: string | null; experience_evidence: { competency_key: string; strength: Strength; included: boolean }[] }
  export interface ReportLabel { rubric_version_id: string; key: string; label: string }
  export interface ReportExperience { id: string; title: string; statusLabel: string; date: string; strengths: string[] }
  export interface AthleteExperiences { athlete: ReportAthlete; experiences: ReportExperience[] }
  export function experienceStatusLabel(status: ExperienceStatus): string
  export function formatReportDate(iso: string): string
  export function buildExperienceReport(athletes: ReportAthlete[], experiences: ReportExperienceRow[], labels: ReportLabel[]): AthleteExperiences[]
  ```

- [ ] **Step 1: Write the failing tests**

`src/lib/reports.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildExperienceReport,
  experienceStatusLabel,
  formatReportDate,
  type ReportAthlete,
  type ReportExperienceRow,
  type ReportLabel,
} from './reports';

function athlete(id: string, first: string, last: string): ReportAthlete {
  return {
    id,
    first_name: first,
    last_name: last,
    college: 'UNO',
    degree: 'Business',
    sport: 'Golf',
    created_at: '2026-10-06T15:00:00Z',
  };
}

function experience(overrides: Partial<ReportExperienceRow>): ReportExperienceRow {
  return {
    id: 'e1',
    athlete_id: 'a1',
    title: 'Golf rehab',
    status: 'confirmed',
    created_at: '2026-10-06T15:00:00Z',
    rubric_version_id: 'v1',
    experience_evidence: [],
    ...overrides,
  };
}

const labels: ReportLabel[] = [
  { rubric_version_id: 'v1', key: 'resilience', label: 'Resilience' },
  { rubric_version_id: 'v1', key: 'discipline', label: 'Discipline' },
  { rubric_version_id: 'v1', key: 'leadership', label: 'Leadership' },
  { rubric_version_id: 'v2', key: 'leadership', label: 'Team Leadership' },
];

const todd = athlete('a1', 'Todd', 'Campbell');
const jane = athlete('a2', 'Jane', 'Smith');

describe('experienceStatusLabel', () => {
  it('names the two reported statuses', () => {
    expect(experienceStatusLabel('mapped')).toBe('Awaiting confirmation');
    expect(experienceStatusLabel('confirmed')).toBe('Confirmed');
  });
});

describe('formatReportDate', () => {
  it('formats a date like Oct 6, 2026', () => {
    expect(formatReportDate('2026-10-06T15:00:00Z')).toBe('Oct 6, 2026');
  });

  it('keeps a late-evening Central entry on the same day', () => {
    // 10:30 pm Central on Oct 6 is already Oct 7 in UTC.
    expect(formatReportDate('2026-10-07T03:30:00Z')).toBe('Oct 6, 2026');
  });
});

describe('buildExperienceReport', () => {
  it('keeps athlete order and gives athletes without experiences an empty list', () => {
    const report = buildExperienceReport([todd, jane], [experience({})], labels);
    expect(report.map((r) => r.athlete.id)).toEqual(['a1', 'a2']);
    expect(report[0].experiences).toHaveLength(1);
    expect(report[1].experiences).toEqual([]);
  });

  it('ignores experiences from athletes not in the list', () => {
    const report = buildExperienceReport([todd], [experience({ athlete_id: 'archived' })], labels);
    expect(report).toHaveLength(1);
    expect(report[0].experiences).toEqual([]);
  });

  it('includes only mapped and confirmed experiences', () => {
    const rows = [
      experience({ id: 'draft', status: 'draft' }),
      experience({ id: 'followup', status: 'needs_followup' }),
      experience({ id: 'failed', status: 'failed' }),
      experience({ id: 'mapped', status: 'mapped' }),
      experience({ id: 'confirmed', status: 'confirmed' }),
    ];
    const ids = buildExperienceReport([todd], rows, labels)[0].experiences.map((e) => e.id);
    expect(ids.sort()).toEqual(['confirmed', 'mapped']);
  });

  it('lists experiences newest first', () => {
    const rows = [
      experience({ id: 'old', created_at: '2026-10-01T15:00:00Z' }),
      experience({ id: 'new', created_at: '2026-10-05T15:00:00Z' }),
    ];
    const ids = buildExperienceReport([todd], rows, labels)[0].experiences.map((e) => e.id);
    expect(ids).toEqual(['new', 'old']);
  });

  it('fills in title, status label, and date', () => {
    const [entry] = buildExperienceReport([todd], [experience({ status: 'mapped' })], labels)[0]
      .experiences;
    expect(entry).toMatchObject({
      title: 'Golf rehab',
      statusLabel: 'Awaiting confirmation',
      date: 'Oct 6, 2026',
    });
  });

  it('shows kept strengths, Strong first, then alphabetical', () => {
    const row = experience({
      experience_evidence: [
        { competency_key: 'resilience', strength: 'moderate', included: true },
        { competency_key: 'leadership', strength: 'strong', included: false },
        { competency_key: 'discipline', strength: 'moderate', included: true },
        { competency_key: 'resilience', strength: 'strong', included: true },
      ],
    });
    // Two items for one key can't happen in real data; it only checks ordering here.
    const [entry] = buildExperienceReport([todd], [row], labels)[0].experiences;
    expect(entry.strengths).toEqual([
      'Resilience (Strong)',
      'Discipline (Moderate)',
      'Resilience (Moderate)',
    ]);
  });

  it('gives an empty strengths list when every strength was removed', () => {
    const row = experience({
      experience_evidence: [{ competency_key: 'leadership', strength: 'strong', included: false }],
    });
    expect(buildExperienceReport([todd], [row], labels)[0].experiences[0].strengths).toEqual([]);
  });

  it("labels strengths with the experience's own rubric version", () => {
    const evidence = [{ competency_key: 'leadership', strength: 'strong' as const, included: true }];
    const rows = [
      experience({ id: 'v1', rubric_version_id: 'v1', experience_evidence: evidence }),
      experience({
        id: 'v2',
        rubric_version_id: 'v2',
        created_at: '2026-10-07T15:00:00Z',
        experience_evidence: evidence,
      }),
    ];
    const strengths = buildExperienceReport([todd], rows, labels)[0].experiences.map(
      (e) => e.strengths[0]
    );
    expect(strengths).toEqual(['Team Leadership (Strong)', 'Leadership (Strong)']);
  });

  it('falls back to a title-cased key when the label is missing', () => {
    const evidence = [{ competency_key: 'time_management', strength: 'strong' as const, included: true }];
    const rows = [
      experience({ id: 'known-version', experience_evidence: evidence }),
      experience({
        id: 'no-version',
        rubric_version_id: null,
        created_at: '2026-10-07T15:00:00Z',
        experience_evidence: evidence,
      }),
    ];
    const strengths = buildExperienceReport([todd], rows, labels)[0].experiences.map(
      (e) => e.strengths[0]
    );
    expect(strengths).toEqual(['Time Management (Strong)', 'Time Management (Strong)']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/reports.test.ts`
Expected: FAIL, "Failed to resolve import './reports'".

- [ ] **Step 3: Write the implementation**

`src/lib/reports.ts`:

```ts
import { competencyLabel } from './rubric';
import type { ExperienceStatus, Strength } from './experiences';

// The experience report shows results the athlete has seen, confirmed or not.
export const REPORTED_STATUSES: ExperienceStatus[] = ['mapped', 'confirmed'];

export interface ReportAthlete {
  id: string;
  first_name: string;
  last_name: string;
  college: string;
  degree: string;
  sport: string;
  created_at: string;
}

export interface ReportExperienceRow {
  id: string;
  athlete_id: string;
  title: string;
  status: ExperienceStatus;
  created_at: string;
  rubric_version_id: string | null;
  experience_evidence: { competency_key: string; strength: Strength; included: boolean }[];
}

export interface ReportLabel {
  rubric_version_id: string;
  key: string;
  label: string;
}

export interface ReportExperience {
  id: string;
  title: string;
  statusLabel: string;
  date: string;
  strengths: string[];
}

export interface AthleteExperiences {
  athlete: ReportAthlete;
  experiences: ReportExperience[];
}

const STRENGTH_LABELS: Record<Strength, string> = { strong: 'Strong', moderate: 'Moderate' };

export function experienceStatusLabel(status: ExperienceStatus): string {
  return status === 'confirmed' ? 'Confirmed' : 'Awaiting confirmation';
}

// Vercel runs in UTC, so pin Central time or evening entries show tomorrow's date.
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'America/Chicago',
});

export function formatReportDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

function strengthsFor(row: ReportExperienceRow, labels: ReportLabel[]): string[] {
  const versionLabels = labels.filter((l) => l.rubric_version_id === row.rubric_version_id);
  return row.experience_evidence
    .filter((item) => item.included)
    .map((item) => ({
      strength: item.strength,
      label: competencyLabel(item.competency_key, versionLabels),
    }))
    .sort(
      (a, b) =>
        Number(b.strength === 'strong') - Number(a.strength === 'strong') ||
        a.label.localeCompare(b.label)
    )
    .map((item) => `${item.label} (${STRENGTH_LABELS[item.strength]})`);
}

export function buildExperienceReport(
  athletes: ReportAthlete[],
  experiences: ReportExperienceRow[],
  labels: ReportLabel[]
): AthleteExperiences[] {
  const reported = experiences
    .filter((row) => REPORTED_STATUSES.includes(row.status))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  return athletes.map((athlete) => ({
    athlete,
    experiences: reported
      .filter((row) => row.athlete_id === athlete.id)
      .map((row) => ({
        id: row.id,
        title: row.title,
        statusLabel: experienceStatusLabel(row.status),
        date: formatReportDate(row.created_at),
        strengths: strengthsFor(row, labels),
      })),
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/reports.test.ts`
Expected: PASS, 11 tests.

Then the full suite: `npx vitest run`
Expected: all tests pass (95 before this task, 106 after).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports.ts src/lib/reports.test.ts
git commit -m "Add report building for the admin experience report"
```

---

### Task 3: The Reports page

**Files:**
- Modify (rewrite): `src/app/admin/reports/page.tsx`

**Interfaces:**
- Consumes: RPC `admin_report_athletes()` (Task 1); `buildExperienceReport`, `formatReportDate`, `REPORTED_STATUSES`, `ReportAthlete`, `ReportExperienceRow`, `ReportLabel` (Task 2); `createClient` from `@/lib/supabase/server`; `getUserRole` from `@/lib/roles`.
- Produces: the `/admin/reports` page.

- [ ] **Step 1: Write the page**

`src/app/admin/reports/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/roles';
import {
  buildExperienceReport,
  formatReportDate,
  REPORTED_STATUSES,
  type AthleteExperiences,
  type ReportAthlete,
  type ReportExperienceRow,
  type ReportLabel,
} from '@/lib/reports';

export default async function AdminReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  if ((await getUserRole(supabase, user.id)) !== 'platform_admin') {
    redirect('/profile');
  }

  const { data: athleteData, error: athleteError } = await supabase.rpc('admin_report_athletes');

  if (athleteError) {
    console.error('Reports: could not load athletes', athleteError);
    return (
      <main className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="mt-4 text-red-600">Couldn&rsquo;t load reports. Refresh to try again.</p>
      </main>
    );
  }

  const athletes = (athleteData ?? []) as ReportAthlete[];
  const report = await loadExperienceReport(supabase, athletes);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">Reports</h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Student Athletes ({athletes.length})</h2>
        {athletes.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No student athletes yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">College</th>
                  <th className="px-3 py-2 font-medium">Degree</th>
                  <th className="px-3 py-2 font-medium">Sport</th>
                  <th className="px-3 py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {athletes.map((a) => (
                  <tr key={a.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {a.last_name}, {a.first_name}
                    </td>
                    <td className="px-3 py-2">{a.college}</td>
                    <td className="px-3 py-2">{a.degree}</td>
                    <td className="px-3 py-2">{a.sport}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatReportDate(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {athletes.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Student Athlete Experience Report</h2>
          {report === null ? (
            <p className="mt-3 text-sm text-red-600">
              Couldn&rsquo;t load the experience report. Refresh to try again.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-4">
              {report.map(({ athlete, experiences }) => (
                <div key={athlete.id} className="rounded border bg-white p-4">
                  <div>
                    <span className="font-semibold">
                      {athlete.first_name} {athlete.last_name}
                    </span>
                    <span className="text-sm text-gray-500">
                      {' '}
                      · {athlete.college} · {athlete.sport}
                    </span>
                  </div>
                  {experiences.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-600">No experiences yet.</p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-3 text-sm">
                      {experiences.map((e) => (
                        <li key={e.id}>
                          <div>
                            <span className="font-medium">{e.title}</span>
                            <span className="text-gray-500">
                              , {e.statusLabel}, {e.date}
                            </span>
                          </div>
                          <div className="text-gray-700">
                            {e.strengths.length > 0
                              ? `Strengths: ${e.strengths.join(', ')}`
                              : 'Strengths: none kept.'}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

// Returns null when the experiences can't be loaded, so the page can say so.
async function loadExperienceReport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  athletes: ReportAthlete[]
): Promise<AthleteExperiences[] | null> {
  if (athletes.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('experiences')
    .select(
      'id, athlete_id, title, status, created_at, rubric_version_id, experience_evidence(competency_key, strength, included)'
    )
    .in(
      'athlete_id',
      athletes.map((a) => a.id)
    )
    .in('status', REPORTED_STATUSES)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Reports: could not load experiences', error);
    return null;
  }

  const experiences = (data ?? []) as ReportExperienceRow[];
  const versionIds = [
    ...new Set(experiences.map((e) => e.rubric_version_id).filter((id) => id !== null)),
  ];

  // If labels fail to load, competencyLabel falls back to the title-cased key.
  const { data: labelData, error: labelError } =
    versionIds.length > 0
      ? await supabase
          .from('rubric_competencies')
          .select('rubric_version_id, key, label')
          .in('rubric_version_id', versionIds)
      : { data: [], error: null };

  if (labelError) {
    console.error('Reports: could not load competency labels', labelError);
  }

  return buildExperienceReport(athletes, experiences, (labelData ?? []) as ReportLabel[]);
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint src/app/admin/reports src/lib/reports.ts`
Expected: no output from either.

- [ ] **Step 3: Check in the browser (dev server on http://localhost:3000)**

Needs Task 1's migration run in Supabase first.

1. Sign in as `toddacampbell2011@gmail.com` (admin). Open `/admin`, note the Athletes number, then open REPORTS. The Student Athletes count matches it; every athlete appears in both sections.
2. `toddtest1@gmail.com` has experiences: confirmed and awaiting-confirmation ones show with strengths; any draft or failed one doesn't.
3. As `toddtest1@gmail.com`, uncheck one strength on a result card, then reload the report as admin: that strength is gone.
4. Narrow the window to phone width: the athlete table scrolls sideways; the page itself doesn't.
5. Signed in as `toddtest1@gmail.com`, open `/admin/reports`: redirected to `/profile`.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/reports/page.tsx
git commit -m "Build the admin Reports page: athletes and experience report"
```

- [ ] **Step 5: Update the Parking Lot**

In `C:\development\Claude Code\Proven\Parking_Lot.md`, add under Open:

```markdown
### Admin editing of athlete data
**Logged:** 2026-10-06

Left out of the demo build: admins can view athletes, experiences, and strengths in Reports, but can't edit or delete them in the app. Fixes go through Supabase's Table Editor for now. Needs admin update/delete policies and edit pages.
```
