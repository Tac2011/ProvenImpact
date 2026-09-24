# Admin Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A site-wide dark slate header with role-based menus, an admin Dashboard with three live counts, the deletion approvals moved to `/admin/manage`, and "Coming soon" pages for Athletes and Reports.

**Architecture:** Pure navigation rules live in `src/lib/navigation.ts` (unit tested). `Header.tsx` (server) loads the user's role, display name, and pending count, and hands them to `HeaderNav.tsx` (client), which handles the active underline, the phone menu, and the name dropdown. Dashboard counts come from one `security definer` SQL function so admins get counts without broad read access.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4, Supabase (`@supabase/ssr`, RPC), Vitest 5, sharp (already installed, used once to crop the logo).

**Spec:** `docs/superpowers/specs/2026-09-24-admin-shell-design.md`

## Global Constraints

- No em dashes anywhere: code, comments, UI copy, SQL, docs, commit messages.
- Brand colors: slate `#2E3B4A`, Proven red `#C8102E`. Header background slate, white text.
- Menu labels are displayed uppercase: DASHBOARD, ATHLETES, REPORTS, ADMIN, MY PROFILE, SELF-ASSESSMENT, LOG IN.
- Admin addresses: `/admin`, `/admin/athletes`, `/admin/reports`, `/admin/manage`. Athlete addresses: `/profile`, `/assessment`.
- Phone breakpoint: Tailwind `md` (768px).
- Database changes are applied by Todd in the Supabase SQL editor. There is no migration runner.
- Follow existing patterns: server components fetch with `@/lib/supabase/server`, client components use `@/lib/supabase/client`.
- Work on branch `admin-shell`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push only when Todd says so.

## Review Focus

- **Very long display name or email** (e.g. `nsxdude82+athlete1@gmail.com`): the name must truncate with an ellipsis rather than push the menu off the bar or wrap the header. (Task 3, `max-w` plus `truncate` on the name button; checked in the manual walkthrough at phone width.)
- **Header on a page where the user's session just ended** (after Log out, before refresh): the header must drop to the logged-out state (logo plus LOG IN), not keep showing the old name. (Task 3, `LogoutButton` already calls `router.refresh()`; checked in the walkthrough.)
- **Dashboard when the stats function errors or returns null:** tiles show a dash, the page still renders. (Task 4, `formatStat` unit test.)
- **Open phone menu, then tap a link:** the menu closes on navigation instead of staying open over the new page. (Task 3, `onClick` closes the menu; checked in the walkthrough.)
- **Admin badge count and Admin page list disagree** after an Approve: both are server-rendered from the same `pending` filter and `router.refresh()` re-renders the layout, so the badge updates too. (Task 4, walkthrough step.)

---

### Task 1: Dashboard stats function

**Files:**
- Create: `supabase/migrations/2026-09-24-admin-dashboard-stats.sql`
- Modify: `supabase/schema.sql` (append the function at the end of the file)

**Interfaces:**
- Produces: SQL function `admin_dashboard_stats(competency_count int) returns json`, shape `{"athletes": int, "assessments_complete": int, "pending_deletions": int}` or `null` for non-admins. Called from the app as `supabase.rpc('admin_dashboard_stats', { competency_count })`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/2026-09-24-admin-dashboard-stats.sql`:

```sql
-- Dashboard counts for Platform Admins. Returns null for anyone else.
-- Runs as its owner so admins get counts without read access to every score.

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

- [ ] **Step 2: Append the same function to `supabase/schema.sql`**

Add a new section at the end of `schema.sql`, after the deletion requests section:

```sql
-- Dashboard -----------------------------------------------------------
```

followed by the exact `create function admin_dashboard_stats ...` statement from Step 1 (including its two comment lines).

- [ ] **Step 3: Todd runs the migration**

Paste the migration file into Supabase SQL Editor and run. Expected: "Success. No rows returned."

- [ ] **Step 4: Verify as admin and as athlete**

Todd runs each block separately (they roll back, nothing persists):

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "abdcafb8-534e-4d5e-967a-742c38893308"}';
select admin_dashboard_stats(24);
rollback;
```
Expected: one row like `{"athletes" : 2, "assessments_complete" : 0, "pending_deletions" : 0}` (numbers depend on test data).

```sql
select id from auth.users where email = 'nsxdude82+debug1@gmail.com';
```
Then, with that ID:
```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<ID>"}';
select admin_dashboard_stats(24);
rollback;
```
Expected: `null`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-09-24-admin-dashboard-stats.sql supabase/schema.sql
git commit -m "Add admin_dashboard_stats function for the Dashboard counts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Navigation rules

**Files:**
- Create: `src/lib/navigation.ts`
- Test: `src/lib/navigation.test.ts`

**Interfaces:**
- Consumes: `UserRole` from `src/lib/roles.ts`.
- Produces:
  - `interface NavItem { label: string; href: string }`
  - `ADMIN_MANAGE_HREF = '/admin/manage'`
  - `navItemsFor(role: UserRole | null): NavItem[]`
  - `homeHrefFor(role: UserRole | null): string`
  - `activeHref(pathname: string, items: NavItem[]): string | null`
  - `showNavItems(pathname: string): boolean`
  - `headerDisplayName(input: { adminName: string | null; firstName: string | null; lastName: string | null; email: string }): string`
  - `formatStat(value: number | null | undefined): string`

- [ ] **Step 1: Write the failing tests**

`src/lib/navigation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  activeHref,
  formatStat,
  headerDisplayName,
  homeHrefFor,
  navItemsFor,
  showNavItems,
} from './navigation';

const hrefs = (role: Parameters<typeof navItemsFor>[0]) => navItemsFor(role).map((i) => i.href);

describe('navItemsFor', () => {
  it('gives a platform admin the four admin items in order', () => {
    expect(hrefs('platform_admin')).toEqual([
      '/admin',
      '/admin/athletes',
      '/admin/reports',
      '/admin/manage',
    ]);
  });

  it('gives a student athlete the athlete items', () => {
    expect(hrefs('student_athlete')).toEqual(['/profile', '/assessment']);
  });

  it('gives corporate and university roles the athlete items for now', () => {
    expect(hrefs('corporate_admin')).toEqual(['/profile', '/assessment']);
    expect(hrefs('university_user')).toEqual(['/profile', '/assessment']);
  });

  it('gives a signed-out visitor no items', () => {
    expect(navItemsFor(null)).toEqual([]);
  });
});

describe('homeHrefFor', () => {
  it('sends admins to the dashboard', () => {
    expect(homeHrefFor('platform_admin')).toBe('/admin');
  });

  it('sends athletes to their profile', () => {
    expect(homeHrefFor('student_athlete')).toBe('/profile');
  });

  it('sends signed-out visitors to the landing page', () => {
    expect(homeHrefFor(null)).toBe('/');
  });
});

describe('activeHref', () => {
  const admin = navItemsFor('platform_admin');

  it('underlines only Dashboard on /admin', () => {
    expect(activeHref('/admin', admin)).toBe('/admin');
  });

  it('underlines Admin, not Dashboard, on /admin/manage', () => {
    expect(activeHref('/admin/manage', admin)).toBe('/admin/manage');
  });

  it('underlines Athletes on a deeper athletes page', () => {
    expect(activeHref('/admin/athletes/123', admin)).toBe('/admin/athletes');
  });

  it('does not treat /admin-other as part of /admin', () => {
    expect(activeHref('/admin-other', admin)).toBeNull();
  });

  it('underlines My Profile on /profile', () => {
    expect(activeHref('/profile', navItemsFor('student_athlete'))).toBe('/profile');
  });

  it('underlines nothing on an unknown page', () => {
    expect(activeHref('/signup', admin)).toBeNull();
  });
});

describe('showNavItems', () => {
  it('hides menu items on the locked page', () => {
    expect(showNavItems('/account-locked')).toBe(false);
  });

  it('shows menu items everywhere else', () => {
    expect(showNavItems('/profile')).toBe(true);
  });
});

describe('headerDisplayName', () => {
  const base = { adminName: null, firstName: null, lastName: null, email: 'j@x.com' };

  it('prefers the admin name', () => {
    expect(
      headerDisplayName({ ...base, adminName: 'Todd Campbell', firstName: 'T', lastName: 'C' })
    ).toBe('Todd Campbell');
  });

  it('uses the athlete first and last name next', () => {
    expect(headerDisplayName({ ...base, firstName: 'Jordan', lastName: 'Smith' })).toBe(
      'Jordan Smith'
    );
  });

  it('falls back to email when names are blank', () => {
    expect(headerDisplayName({ ...base, adminName: '  ', firstName: ' ', lastName: '' })).toBe(
      'j@x.com'
    );
  });
});

describe('formatStat', () => {
  it('shows a number', () => {
    expect(formatStat(248)).toBe('248');
  });

  it('shows zero as 0, not a dash', () => {
    expect(formatStat(0)).toBe('0');
  });

  it('shows a dash when the value is missing', () => {
    expect(formatStat(null)).toBe('-');
    expect(formatStat(undefined)).toBe('-');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/navigation.test.ts`
Expected: FAIL, "Cannot find module './navigation'"

- [ ] **Step 3: Write the implementation**

`src/lib/navigation.ts`:

```ts
import type { UserRole } from './roles';

export interface NavItem {
  label: string;
  href: string;
}

export const ADMIN_MANAGE_HREF = '/admin/manage';

const ADMIN_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Athletes', href: '/admin/athletes' },
  { label: 'Reports', href: '/admin/reports' },
  { label: 'Admin', href: ADMIN_MANAGE_HREF },
];

// Corporate and University roles have no screens yet, so they share the athlete menu.
const ATHLETE_ITEMS: NavItem[] = [
  { label: 'My Profile', href: '/profile' },
  { label: 'Self-Assessment', href: '/assessment' },
];

export function navItemsFor(role: UserRole | null): NavItem[] {
  if (role === null) {
    return [];
  }
  return role === 'platform_admin' ? ADMIN_ITEMS : ATHLETE_ITEMS;
}

export function homeHrefFor(role: UserRole | null): string {
  if (role === null) {
    return '/';
  }
  return role === 'platform_admin' ? '/admin' : '/profile';
}

// The item whose address matches exactly, or the longest address the path sits under,
// so /admin/manage underlines Admin rather than Dashboard.
export function activeHref(pathname: string, items: NavItem[]): string | null {
  const matches = items.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
  if (matches.length === 0) {
    return null;
  }
  return matches.reduce((best, item) => (item.href.length > best.href.length ? item : best)).href;
}

// On the locked page every menu link would bounce back, so hide them.
export function showNavItems(pathname: string): boolean {
  return !pathname.startsWith('/account-locked');
}

export function headerDisplayName(input: {
  adminName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const adminName = input.adminName?.trim();
  if (adminName) {
    return adminName;
  }
  const fullName = `${input.firstName ?? ''} ${input.lastName ?? ''}`.trim();
  return fullName || input.email;
}

export function formatStat(value: number | null | undefined): string {
  return value === null || value === undefined ? '-' : String(value);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all PASS (the new navigation tests plus the existing 18).

- [ ] **Step 5: Commit**

```bash
git add src/lib/navigation.ts src/lib/navigation.test.ts
git commit -m "Add navigation rules for the site header

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Header

**Files:**
- Create: `public/proven-mark.png`
- Modify: `src/app/globals.css` (brand color tokens)
- Modify: `src/components/LogoutButton.tsx` (optional `className`)
- Create: `src/components/HeaderNav.tsx`
- Modify: `src/components/Header.tsx` (full rewrite)

**Interfaces:**
- Consumes: everything from Task 2 except `formatStat`; `getUserRoleInfo` from `src/lib/roles.ts`.
- Produces: `HeaderNav` props `{ homeHref: string; items: NavItem[]; displayName: string | null; pendingCount: number }`. Tailwind colors `brand-slate` and `brand-red`.

- [ ] **Step 1: Crop the "P" mark from the logo**

The P in `public/ProvenImpact.png` (1024x1024) sits at roughly x 345 to 690, y 45 to 425. Run from the repo root:

```bash
node -e "require('sharp')('public/ProvenImpact.png').extract({ left: 335, top: 35, width: 365, height: 400 }).resize({ height: 96 }).png().toFile('public/proven-mark.png').then(i => console.log(i))"
```

Expected: prints `{ format: 'png', width: 88, height: 96, ... }`. Open `public/proven-mark.png` and confirm it shows the whole P (slate stroke and red bowl) with a little white margin and no part of the word "PROVEN". If it's clipped or includes text, adjust `left`/`top`/`width`/`height` and rerun.

- [ ] **Step 2: Add brand colors to `src/app/globals.css`**

Add after the existing `@theme inline { ... }` block:

```css
@theme {
  --color-brand-slate: #2e3b4a;
  --color-brand-red: #c8102e;
}
```

This makes `bg-brand-slate`, `text-brand-red`, `border-brand-red` etc. available.

- [ ] **Step 3: Let `LogoutButton` take a className**

Replace `src/components/LogoutButton.tsx` with:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LogoutButton({ className = 'text-sm underline' }: { className?: string }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <button onClick={handleLogout} className={className}>
      Log out
    </button>
  );
}
```

- [ ] **Step 4: Create `src/components/HeaderNav.tsx`**

```tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ADMIN_MANAGE_HREF, activeHref, showNavItems, type NavItem } from '@/lib/navigation';
import { LogoutButton } from './LogoutButton';

export function HeaderNav({
  homeHref,
  items,
  displayName,
  pendingCount,
}: {
  homeHref: string;
  items: NavItem[];
  displayName: string | null;
  pendingCount: number;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const visibleItems = showNavItems(pathname) ? items : [];
  const current = activeHref(pathname, visibleItems);

  function navLink(item: NavItem, mobile: boolean) {
    const active = item.href === current;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMenuOpen(false)}
        className={
          mobile
            ? `block px-4 py-3 text-sm font-semibold tracking-wide uppercase ${
                active ? 'bg-white/10 text-white' : 'text-slate-300'
              }`
            : `border-b-[3px] pb-1 text-sm font-semibold tracking-wide uppercase ${
                active
                  ? 'border-brand-red text-white'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`
        }
      >
        {item.label}
        {item.href === ADMIN_MANAGE_HREF && pendingCount > 0 && (
          <span className="ml-1.5 rounded-full bg-brand-red px-1.5 py-0.5 text-[10px] text-white">
            {pendingCount}
          </span>
        )}
      </Link>
    );
  }

  return (
    <header className="relative bg-brand-slate text-white">
      <div className="flex items-center gap-8 px-4 py-3 md:px-6">
        <Link href={homeHref} className="flex shrink-0 items-center gap-2">
          <span className="rounded bg-white p-1">
            <Image src="/proven-mark.png" alt="" width={26} height={28} priority />
          </span>
          <span className="text-sm leading-tight font-extrabold tracking-[0.2em]">
            PROVEN
            <span className="block text-[#ff5a6e]">IMPACT</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {visibleItems.map((item) => navLink(item, false))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {visibleItems.length > 0 && (
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="text-sm font-semibold tracking-wide text-slate-300 uppercase md:hidden"
            >
              Menu
            </button>
          )}

          {displayName ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserOpen(!userOpen)}
                className="max-w-[10rem] truncate text-sm text-slate-300 hover:text-white md:max-w-[16rem]"
              >
                {displayName} &#9662;
              </button>
              {userOpen && (
                <div className="absolute right-0 z-20 mt-2 w-36 rounded border bg-white py-1 text-gray-800 shadow">
                  <LogoutButton className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100" />
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="text-sm font-semibold tracking-wide text-slate-300 uppercase hover:text-white"
            >
              Log in
            </Link>
          )}
        </div>
      </div>

      {menuOpen && (
        <nav className="border-t border-white/10 md:hidden">
          {visibleItems.map((item) => navLink(item, true))}
        </nav>
      )}
    </header>
  );
}
```

- [ ] **Step 5: Rewrite `src/components/Header.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server';
import { getUserRoleInfo } from '@/lib/roles';
import { headerDisplayName, homeHrefFor, navItemsFor } from '@/lib/navigation';
import { HeaderNav } from './HeaderNav';

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <HeaderNav homeHref={homeHrefFor(null)} items={[]} displayName={null} pendingCount={0} />;
  }

  const info = await getUserRoleInfo(supabase, user.id);

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .maybeSingle();

  let pendingCount = 0;
  if (info.role === 'platform_admin') {
    const { count } = await supabase
      .from('deletion_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    pendingCount = count ?? 0;
  }

  return (
    <HeaderNav
      homeHref={homeHrefFor(info.role)}
      items={navItemsFor(info.role)}
      displayName={headerDisplayName({
        adminName: info.name,
        firstName: profile?.first_name ?? null,
        lastName: profile?.last_name ?? null,
        email: user.email ?? '',
      })}
      pendingCount={pendingCount}
    />
  );
}
```

- [ ] **Step 6: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean, all PASS.

- [ ] **Step 7: Quick look**

With the dev server on http://localhost:3000, open `/` signed out. Expected: slate bar, P mark on a white tile, PROVEN / IMPACT wordmark, LOG IN on the right. Log in as an athlete. Expected: MY PROFILE and SELF-ASSESSMENT, name on the right, underline on MY PROFILE.

- [ ] **Step 8: Commit**

```bash
git add public/proven-mark.png src/app/globals.css src/components/LogoutButton.tsx src/components/HeaderNav.tsx src/components/Header.tsx
git commit -m "Replace the header with a dark slate bar and role-based menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Admin pages

**Files:**
- Create: `src/app/admin/manage/page.tsx` (content moved from `src/app/admin/page.tsx`)
- Modify: `src/app/admin/page.tsx` (becomes the Dashboard)
- Create: `src/app/admin/athletes/page.tsx`
- Create: `src/app/admin/reports/page.tsx`

**Interfaces:**
- Consumes: `admin_dashboard_stats` (Task 1), `formatStat` and `ADMIN_MANAGE_HREF` (Task 2), `DeletionRequestList` (existing, `src/app/admin/DeletionRequestList.tsx`), `COMPETENCIES` from `src/lib/competencies.ts`.

- [ ] **Step 1: Create `src/app/admin/manage/page.tsx`**

This is today's `src/app/admin/page.tsx`, with the function renamed, the heading changed, the placeholder paragraph removed, the admin details under their own heading, and the `DeletionRequestList` import path adjusted:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserRoleInfo, type UserRole } from '@/lib/roles';
import { displayName, pendingCountLabel, type PendingDeletionRow } from '@/lib/deletionRequests';
import { DeletionRequestList } from '../DeletionRequestList';

const ROLE_LABELS: Record<UserRole, string> = {
  platform_admin: 'Main Admin',
  corporate_admin: 'Corporate Admin',
  corporate_user: 'Corporate User',
  university_admin: 'University Admin',
  university_user: 'University User',
  student_athlete: 'Student Athlete',
};

export default async function AdminManagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const info = await getUserRoleInfo(supabase, user.id);

  if (info.role !== 'platform_admin') {
    redirect('/profile');
  }

  const dateAdded = info.createdAt
    ? new Date(info.createdAt).toLocaleDateString()
    : 'Not set';

  const { data: requests } = await supabase
    .from('deletion_requests')
    .select('id, user_id, email, requested_at')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });

  const pending = requests ?? [];
  const userIds = pending.map((r) => r.user_id);

  // No foreign key links deletion_requests to profiles, so names come from a second query.
  const { data: profiles } =
    userIds.length > 0
      ? await supabase.from('profiles').select('id, first_name, last_name').in('id', userIds)
      : { data: [] };

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const rows: PendingDeletionRow[] = pending.map((r) => ({
    id: r.id,
    displayName: displayName(profileById.get(r.user_id) ?? null, r.email),
    requestedAt: r.requested_at,
  }));

  const countLabel = pendingCountLabel(rows.length);

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-bold">Admin</h1>

      {countLabel ? (
        <section className="mt-6">
          <div className="rounded border border-yellow-300 bg-yellow-50 p-4 text-sm font-medium">
            {countLabel}
          </div>
          <DeletionRequestList adminId={user.id} rows={rows} />
        </section>
      ) : (
        <p className="mt-6 text-sm text-gray-600">No pending deletion requests.</p>
      )}

      <h2 className="mt-10 text-lg font-semibold">Your admin account</h2>
      <dl className="mt-4 flex flex-col gap-4 text-sm">
        <div>
          <dt className="font-medium text-gray-500">Name</dt>
          <dd>{info.name ?? 'Not set'}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Admin Type</dt>
          <dd>{ROLE_LABELS[info.role]}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Organization</dt>
          <dd>{info.organizationName ?? 'N/A'}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Date Added</dt>
          <dd>{dateAdded}</dd>
        </div>
      </dl>
    </main>
  );
}
```

- [ ] **Step 2: Replace `src/app/admin/page.tsx` with the Dashboard**

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/roles';
import { COMPETENCIES } from '@/lib/competencies';
import { ADMIN_MANAGE_HREF, formatStat } from '@/lib/navigation';

interface DashboardStats {
  athletes: number;
  assessments_complete: number;
  pending_deletions: number;
}

export default async function AdminDashboardPage() {
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

  const { data } = await supabase.rpc('admin_dashboard_stats', {
    competency_count: COMPETENCIES.length,
  });
  const stats = data as DashboardStats | null;

  const tiles = [
    { label: 'Athletes', value: stats?.athletes, href: '/admin/athletes', alert: false },
    {
      label: 'Assessments complete',
      value: stats?.assessments_complete,
      href: '/admin/athletes',
      alert: false,
    },
    {
      label: 'Pending deletions',
      value: stats?.pending_deletions,
      href: ADMIN_MANAGE_HREF,
      alert: (stats?.pending_deletions ?? 0) > 0,
    },
  ];

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className={`rounded border bg-white p-5 hover:shadow ${
              tile.alert ? 'border-l-4 border-l-brand-red' : ''
            }`}
          >
            <div className="text-3xl font-bold text-brand-slate">{formatStat(tile.value)}</div>
            <div className="mt-1 text-sm text-gray-600">{tile.label}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create `src/app/admin/athletes/page.tsx`**

```tsx
export default function AdminAthletesPage() {
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">Athletes</h1>
      <p className="mt-4 text-gray-600">
        Coming soon: search athletes by college, sport, position, and degree.
      </p>
    </main>
  );
}
```

The proxy already redirects non-admins away from `/admin/*`, and this page shows no data, so it needs no server-side check of its own.

- [ ] **Step 4: Create `src/app/admin/reports/page.tsx`**

```tsx
export default function AdminReportsPage() {
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">Reports</h1>
      <p className="mt-4 text-gray-600">Coming soon.</p>
    </main>
  );
}
```

- [ ] **Step 5: Typecheck, lint, test, build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all clean, all PASS, build lists `/admin`, `/admin/athletes`, `/admin/manage`, `/admin/reports`.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/manage/page.tsx src/app/admin/athletes/page.tsx src/app/admin/reports/page.tsx
git commit -m "Add admin Dashboard, move deletion approvals to /admin/manage

Athletes and Reports get Coming soon pages until they are built.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Walkthrough

No new code. Todd runs this at http://localhost:3000, first at full desktop width, then with the browser window narrowed to phone width (under 768px, or dev tools device mode).

- [ ] **Step 1: Admin (`toddacampbell2011@gmail.com`)**
  1. Logging in lands on DASHBOARD with the red underline under DASHBOARD.
  2. The three tiles show numbers (not dashes) matching the Task 1 SQL check.
  3. Have an athlete request deletion. Reload: the ADMIN badge shows 1, the Pending deletions tile shows 1 with a red left border.
  4. Click ADMIN: underline moves to ADMIN, the request is listed, "Your admin account" details show below.
  5. Approve (with the confirm) or Restore it: the list, badge, and tile all drop to 0 without a manual reload of the header.
  6. ATHLETES and REPORTS show their Coming soon pages with the underline on each.
  7. Click the logo: back to DASHBOARD.
  8. Name menu, Log out: header drops to the logo plus LOG IN.

- [ ] **Step 2: Athlete**
  1. Menu shows MY PROFILE and SELF-ASSESSMENT only; the name shows their first and last name (or email if no profile).
  2. Typing `/admin` in the address bar lands on `/profile`.

- [ ] **Step 3: Locked athlete**
  1. After requesting deletion and logging back in, `/account-locked` shows the header with the name but no menu items.

- [ ] **Step 4: Phone width**
  1. Menu items are replaced by a MENU button; tapping it opens the list; tapping an item navigates and closes the list.
  2. A long email as the display name is cut off with an ellipsis, and the header stays on one row.

- [ ] **Step 5: Parking lot**

In `C:\development\Claude Code\Proven\Parking_Lot.md`, add under Open:

```markdown
### White version of the logo for dark backgrounds
**Logged:** 2026-09-24

The header is dark slate, and the slate half of the "P" disappears on it, so the mark sits on a small white tile. A white-and-red version of the logo from its designer would let it sit directly on the slate.
```
