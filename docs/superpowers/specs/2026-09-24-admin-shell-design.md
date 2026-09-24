# Proven Impact: Admin Shell Design

**Date:** 2026-09-24
**Status:** Draft, awaiting Todd's review

## Purpose

Admins have three jobs: reports, admin functions (starting with deletion
approvals), and finding athletes ("show me all UNO football players"). This
piece builds the frame those jobs live in: a site-wide header with
role-based navigation, an admin Dashboard, and a home for the existing
deletion approvals. Athletes and Reports get menu items now and are built
as separate pieces later.

Decided with Todd during brainstorming (mockups in the visual companion):

| Question | Decision |
|---|---|
| Who uses the console? | Platform Admins now. University and Corporate Admins reuse the same shell later, scoped to their own athletes. |
| Layout | Top bar: logo left, menu across, user name right. A sidebar felt too casual. |
| Style | Dark slate bar, logo colors: slate `#2E3B4A`, Proven red `#C8102E`. |
| Athletes' header | Same header, athlete menu. |
| Unbuilt sections | Visible in the menu, showing a "Coming soon" page. |

## Header

One header on every page, replacing the current logo-plus-logout header.

**Look**
- Background slate `#2E3B4A`, white text.
- Left: the "P" mark on a small white tile (the slate half of the P
  disappears on slate otherwise), then the wordmark "PROVEN" in white over
  "IMPACT" in red. The mark is a cropped copy of the existing logo,
  saved as `public/proven-mark.png`. The full stacked logo stays on the
  landing and login pages.
- Menu items in uppercase, muted light gray; the current page's item is
  white with a 3px red underline.
- Right: the user's display name with a small caret. Clicking opens a
  menu with **Log out**.

**Menu by role**

| Who | Items (label: address) | Logo links to |
|---|---|---|
| Platform Admin | DASHBOARD: `/admin`, ATHLETES: `/admin/athletes`, REPORTS: `/admin/reports`, ADMIN: `/admin/manage` | `/admin` |
| Everyone else signed in | MY PROFILE: `/profile`, SELF-ASSESSMENT: `/assessment` | `/profile` |
| Not signed in | LOG IN: `/login`, on the right | `/` |

Corporate and University roles see the athlete menu for now; they have no
screens of their own yet.

**Pending badge:** for Platform Admins, ADMIN shows a red badge with the
number of pending deletion requests. Hidden when zero.

**Active item rule:** the item whose address equals the current path, or
is the longest address the current path starts with (followed by `/`).
So `/admin/manage` underlines ADMIN, not DASHBOARD, and `/admin`
underlines only DASHBOARD.

**Locked accounts:** on `/account-locked` the menu items are hidden (every
item would bounce back there). The name and Log out stay.

**Display name:** first match of: the admin's `user_roles.name`; the
athlete's profile first and last name; the account email.

**Phones:** below Tailwind's `md` breakpoint (768px) the menu items move
behind a "Menu" button that opens a dropdown panel under the bar. The
logo and name stay visible.

## Pages

| Address | Content |
|---|---|
| `/admin` | **Dashboard.** Heading, then three tiles in a row (stacked on phones): **Athletes**, **Assessments complete**, **Pending deletions**. The Pending tile gets a red left border when above zero. Tiles link to ATHLETES, ATHLETES, and ADMIN respectively. |
| `/admin/athletes` | Heading "Athletes" and "Coming soon: search athletes by college, sport, position, and degree." |
| `/admin/reports` | Heading "Reports" and "Coming soon." |
| `/admin/manage` | Heading "Admin". The pending deletion banner and list (moved unchanged from today's `/admin`), then a "Your admin account" section with the details `/admin` shows today: name, admin type, organization, date added. |

All four sit under `/admin`, so the existing proxy rule (non-admins are
redirected to `/profile`) already protects them. The pages that show data
(`/admin` and `/admin/manage`) also keep their own server-side admin
check, matching today's `/admin` page.

## Dashboard Data

A new SQL function returns all three counts in one call, so admins don't
need read access to every athlete's scores just to count them:

```sql
create function admin_dashboard_stats(competency_count int) returns json
language sql security definer stable
set search_path = public
as $$
  with athletes as (
    select p.id
    from profiles p
    left join user_roles r on r.id = p.id
    where coalesce(r.role, 'student_athlete') = 'student_athlete'
      and not exists (
        select 1 from deletion_requests d
        where d.user_id = p.id and d.status = 'approved'
      )
  )
  select case when not is_platform_admin() then null else json_build_object(
    'athletes', (select count(*) from athletes),
    'assessments_complete', (
      select count(*) from (
        select s.athlete_id
        from competency_scores s
        join athletes a on a.id = s.athlete_id
        group by s.athlete_id
        having count(*) >= competency_count
      ) done
    ),
    'pending_deletions', (select count(*) from deletion_requests where status = 'pending')
  ) end;
$$;
```

- **Athletes** counts saved profiles of student athletes, excluding
  archived (approved deletion) accounts. Admin accounts that happen to
  have a profile are not counted.
- **Assessments complete** counts those athletes who have rated every
  competency. The competency count is passed in from the app
  (`COMPETENCIES.length`) so the number 24 lives in one place.
- **Pending deletions** matches the badge and the Admin page list.
- A non-admin caller gets `null`, and the page shows dashes.

Todd runs this as `supabase/migrations/2026-09-24-admin-dashboard-stats.sql`
in the Supabase SQL editor, and `schema.sql` gains the same function.

## Code Structure

| File | Change |
|---|---|
| `src/lib/navigation.ts` | New. Pure functions: `navItemsFor(role)`, `homeHrefFor(role)`, `activeHref(pathname, items)`, `headerDisplayName(...)`, and the locked-page rule. |
| `src/lib/navigation.test.ts` | New. Unit tests for all of the above. |
| `src/components/Header.tsx` | Rewritten. Server component: loads user, role, display name, and (admins only) pending count, then renders `HeaderNav`. |
| `src/components/HeaderNav.tsx` | New. Client component: active underline via `usePathname`, the phone menu toggle, and the name dropdown with Log out. |
| `src/components/LogoutButton.tsx` | Reused inside the name dropdown. |
| `public/proven-mark.png` | New. The "P" cropped from `ProvenImpact.png`. |
| `src/app/admin/page.tsx` | Becomes the Dashboard. |
| `src/app/admin/manage/page.tsx` | New. Deletion list plus admin details, moved from `admin/page.tsx`. |
| `src/app/admin/athletes/page.tsx`, `src/app/admin/reports/page.tsx` | New. Coming soon. |
| `src/app/admin/DeletionRequestList.tsx` | Unchanged, imported from the manage page. |
| `supabase/migrations/2026-09-24-admin-dashboard-stats.sql`, `supabase/schema.sql` | The stats function. |

## Testing

- **Unit (Vitest), `navigation.test.ts`:**
  - Platform Admin gets the four admin items; student athlete, corporate,
    and university roles get the two athlete items.
  - Home link per role.
  - Active item: `/admin` → DASHBOARD only; `/admin/manage` → ADMIN;
    `/admin/athletes/anything` → ATHLETES; `/profile` → MY PROFILE; an
    unknown path → none.
  - Locked page hides menu items.
  - Display name: admin name wins; athlete first and last name next;
    blank names fall back to email.
- **SQL check:** in the SQL editor, `select admin_dashboard_stats(24);`
  run while impersonating Todd's admin account returns the three counts,
  and while impersonating an athlete returns `null`. (Run plainly, the
  editor has no logged-in user, so it also returns `null`.)
- **Manual, in the browser at desktop width and at phone width:**
  1. Admin: header, all four menu items, the underline moving per page,
     the badge count matching the Admin list, the Dashboard numbers, the
     two Coming soon pages, Approve and Restore still working on
     `/admin/manage`, Log out from the name menu.
  2. Athlete: two-item menu, name shown, `/admin` still redirects to
     `/profile`.
  3. Locked athlete: `/account-locked` shows no menu items.
  4. Logged out: landing page shows LOG IN.

## Out of Scope

- Athletes search and the Colleges pick-list (next pieces).
- Reports content.
- University and Corporate Admin menus and data scoping.
- A white version of the logo for dark backgrounds (worth asking the
  logo's designer; the white tile covers it until then).
- A "My Account" page; the name menu has only Log out for now.
