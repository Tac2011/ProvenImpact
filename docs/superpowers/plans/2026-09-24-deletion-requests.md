# Deletion Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Athletes can only request account deletion (and are locked out immediately); Platform Admins see a pending count and Approve or Restore each request.

**Architecture:** A new `deletion_requests` table is the single source of truth for lockout, replacing `profiles.archived_at`. `src/proxy.ts` redirects any signed-in user with a `pending` or `approved` request to `/account-locked`. The admin page lists pending requests via new row-level-security policies gated by an `is_platform_admin()` SQL function.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript, Supabase (Postgres + RLS + Auth via `@supabase/ssr`), Tailwind 4, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-09-24-deletion-requests-design.md`

## Global Constraints

- No em dashes anywhere: code comments, UI copy, SQL comments, docs, commit messages.
- Only Platform Admins (`user_roles.role = 'platform_admin'`) can resolve requests.
- Statuses are exactly `pending`, `approved`, `restored`. `pending` and `approved` lock the account.
- Rows in `deletion_requests` are never deleted.
- Database changes are applied by Todd pasting SQL into the Supabase SQL editor (project ref `mxbzrdwkngdaoparmuzn`). There is no migration runner.
- Follow existing patterns: server components fetch with `@/lib/supabase/server`, client components write with `@/lib/supabase/client`, then `router.refresh()`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push until Todd says so.

## Review Focus

- **Athlete double-clicks "Yes, request deletion":** the button is disabled while the insert is in flight, and the partial unique index rejects a second open request, so exactly one row is created. (Task 4, manual step.)
- **Two Admins resolve the same request:** the update filters on `status = 'pending'`, so the second click changes nothing and no error is shown. (Task 5, manual step.)
- **Restored athlete requests deletion again:** allowed, because the unique index only covers open statuses. A new row is created. (Task 6, manual step.)
- **Athlete with no saved profile, or an empty name:** admin list falls back to email. (Task 2, unit test for `displayName`.)
- **Lockout lookup fails (network or database error):** the proxy treats the user as not locked (fail open) so a database hiccup does not lock every user out; RLS still prevents a locked user from resolving their own request. (Task 2, unit test for `isLockedOut(null)`.)

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/2026-09-24-deletion-requests.sql`
- Modify: `supabase/schema.sql` (full rewrite to match the real database)

**Interfaces:**
- Produces: table `deletion_requests (id, user_id, email, status, requested_at, resolved_by, resolved_at)`, SQL function `is_platform_admin()`, and policies used by every later task. Column `profiles.archived_at` no longer exists.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/2026-09-24-deletion-requests.sql`:

```sql
-- Deletion requests: athletes request, Platform Admins approve or restore.
-- Replaces profiles.archived_at. Run once in the Supabase SQL editor.

create table deletion_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id),
  email         text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'restored')),
  requested_at  timestamptz not null default now(),
  resolved_by   uuid references auth.users(id),
  resolved_at   timestamptz
);

-- At most one open (pending or approved) request per user.
create unique index deletion_requests_one_open_per_user
  on deletion_requests (user_id)
  where status in ('pending', 'approved');

create function is_platform_admin() returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from user_roles
    where id = auth.uid() and role = 'platform_admin'
  );
$$;

alter table deletion_requests enable row level security;

create policy "Users can request own deletion"
  on deletion_requests for insert
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and resolved_by is null
    and resolved_at is null
    and email = (auth.jwt() ->> 'email')
  );

create policy "Users can view own deletion requests"
  on deletion_requests for select
  using (auth.uid() = user_id);

create policy "Platform admins can view all deletion requests"
  on deletion_requests for select
  using (is_platform_admin());

create policy "Platform admins can resolve deletion requests"
  on deletion_requests for update
  using (is_platform_admin())
  with check (is_platform_admin());

create policy "Platform admins can view all profiles"
  on profiles for select
  using (is_platform_admin());

-- Move accounts archived under the old flow into the new table.
insert into deletion_requests (user_id, email, status, requested_at, resolved_at)
select p.id, u.email, 'approved', p.archived_at, p.archived_at
from profiles p
join auth.users u on u.id = p.id
where p.archived_at is not null;

alter table profiles drop column archived_at;
```

- [ ] **Step 2: Todd runs the migration**

Before running, count archived accounts so the migration can be checked:

```sql
select count(*) from profiles where archived_at is not null;
```

Note the number. Then paste the whole migration file into Supabase Dashboard, SQL Editor, and run it. Expected: "Success. No rows returned."

Note: the live site's old Delete Account button writes `archived_at`, so it will error from this point until Task 4 is deployed. Acceptable, since there are no real users yet.

- [ ] **Step 3: Verify the migration**

Run in the SQL editor:

```sql
select count(*) from deletion_requests where status = 'approved';
-- Expected: same number noted in Step 2

select column_name from information_schema.columns
where table_name = 'profiles' and column_name = 'archived_at';
-- Expected: no rows

select tablename, policyname from pg_policies
where tablename in ('deletion_requests', 'profiles')
order by tablename, policyname;
-- Expected: the 4 deletion_requests policies and "Platform admins can view all profiles" alongside the 3 existing profiles policies
```

- [ ] **Step 4: Capture the real schema for `schema.sql`**

`supabase/schema.sql` is missing `user_roles` and `competency_scores`. Todd runs this and pastes the output back:

```sql
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

- [ ] **Step 5: Rewrite `supabase/schema.sql`**

Rewrite it from the Step 4 output so it creates every public table (`profiles` without `archived_at`, `user_roles`, `competency_scores`, `deletion_requests`), the unique index, `is_platform_admin()`, and every policy, in dependency order (`user_roles` before `is_platform_admin()`, the function before policies that call it). Keep the existing file's style: two-space indent, aligned column types, lowercase SQL. Do not guess columns that are not in the Step 4 output.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/2026-09-24-deletion-requests.sql supabase/schema.sql
git commit -m "Add deletion_requests table and admin RLS policies

Replaces profiles.archived_at. Existing archived accounts migrate in
as approved requests. schema.sql now matches the real database.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Deletion request helpers

**Files:**
- Create: `src/lib/deletionRequests.ts`
- Test: `src/lib/deletionRequests.test.ts`

**Interfaces:**
- Consumes: `deletion_requests` table from Task 1.
- Produces:
  - `type DeletionStatus = 'pending' | 'approved' | 'restored'`
  - `isLockedOut(status: DeletionStatus | null): boolean`
  - `getOpenDeletionStatus(supabase: SupabaseClient, userId: string): Promise<DeletionStatus | null>`
  - `pendingCountLabel(count: number): string | null`
  - `displayName(profile: { first_name: string; last_name: string } | null, email: string): string`
  - `interface PendingDeletionRow { id: string; displayName: string; requestedAt: string }`

- [ ] **Step 1: Write the failing tests**

`src/lib/deletionRequests.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { displayName, isLockedOut, pendingCountLabel } from './deletionRequests';

describe('isLockedOut', () => {
  it('locks out a pending request', () => {
    expect(isLockedOut('pending')).toBe(true);
  });

  it('locks out an approved request', () => {
    expect(isLockedOut('approved')).toBe(true);
  });

  it('does not lock out a restored request', () => {
    expect(isLockedOut('restored')).toBe(false);
  });

  it('does not lock out when there is no request', () => {
    expect(isLockedOut(null)).toBe(false);
  });
});

describe('pendingCountLabel', () => {
  it('returns null when nothing is pending', () => {
    expect(pendingCountLabel(0)).toBeNull();
  });

  it('uses the singular for one request', () => {
    expect(pendingCountLabel(1)).toBe('1 pending deletion request');
  });

  it('uses the plural for more than one', () => {
    expect(pendingCountLabel(99)).toBe('99 pending deletion requests');
  });
});

describe('displayName', () => {
  it('uses first and last name when a profile exists', () => {
    expect(displayName({ first_name: 'Jordan', last_name: 'Smith' }, 'j@x.com')).toBe(
      'Jordan Smith'
    );
  });

  it('falls back to email when there is no profile', () => {
    expect(displayName(null, 'j@x.com')).toBe('j@x.com');
  });

  it('falls back to email when the name is blank', () => {
    expect(displayName({ first_name: ' ', last_name: '' }, 'j@x.com')).toBe('j@x.com');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/deletionRequests.test.ts`
Expected: FAIL, "Failed to resolve import './deletionRequests'"

- [ ] **Step 3: Write the implementation**

`src/lib/deletionRequests.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type DeletionStatus = 'pending' | 'approved' | 'restored';

const LOCKING_STATUSES: DeletionStatus[] = ['pending', 'approved'];

export interface PendingDeletionRow {
  id: string;
  displayName: string;
  requestedAt: string;
}

export function isLockedOut(status: DeletionStatus | null): boolean {
  return status !== null && LOCKING_STATUSES.includes(status);
}

// Returns the status of the user's open request, or null if there is none.
// A failed lookup also returns null, so a database error doesn't lock everyone out.
export async function getOpenDeletionStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<DeletionStatus | null> {
  const { data } = await supabase
    .from('deletion_requests')
    .select('status')
    .eq('user_id', userId)
    .in('status', LOCKING_STATUSES)
    .maybeSingle();

  return (data?.status as DeletionStatus | undefined) ?? null;
}

export function pendingCountLabel(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  return count === 1 ? '1 pending deletion request' : `${count} pending deletion requests`;
}

export function displayName(
  profile: { first_name: string; last_name: string } | null,
  email: string
): string {
  const name = profile ? `${profile.first_name} ${profile.last_name}`.trim() : '';
  return name || email;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests PASS (the new 10 plus the existing `validateProfile` tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/deletionRequests.ts src/lib/deletionRequests.test.ts
git commit -m "Add deletion request helpers for lockout and admin list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Lockout in the proxy and the /account-locked page

**Files:**
- Modify: `src/proxy.ts`
- Create: `src/app/account-locked/page.tsx`
- Modify: `src/app/profile/page.tsx` (remove the `archived_at` block)

**Interfaces:**
- Consumes: `getOpenDeletionStatus`, `isLockedOut` from Task 2.
- Produces: route `/account-locked`.

- [ ] **Step 1: Add the lockout redirect to `src/proxy.ts`**

Add the import:

```ts
import { getOpenDeletionStatus, isLockedOut } from '@/lib/deletionRequests';
```

The proxy repeats the same "redirect and carry cookies over" code twice already; the lockout would be a third copy. Add this helper inside `proxy`, right after the `supabase` client is created:

```ts
  function redirectTo(pathname: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => response.cookies.set(c));
    return response;
  }
```

Replace everything from `if (user && isAuthPage) {` down to (not including) `return supabaseResponse;` with:

```ts
  const isLockedPage = request.nextUrl.pathname.startsWith('/account-locked');

  if (user && !isPublicPage && !isLockedPage) {
    const status = await getOpenDeletionStatus(supabase, user.id);
    if (isLockedOut(status)) {
      return redirectTo('/account-locked');
    }
  }

  if (user && isAuthPage) {
    const role = await getUserRole(supabase, user.id);
    return redirectTo(role === 'platform_admin' ? '/admin' : '/profile');
  }

  if (user && request.nextUrl.pathname.startsWith('/admin')) {
    const role = await getUserRole(supabase, user.id);
    if (role !== 'platform_admin') {
      return redirectTo('/profile');
    }
  }
```

The existing `!user && !isPublicPage` redirect to `/login` stays as is (it has no cookies to carry).

- [ ] **Step 2: Create `src/app/account-locked/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOpenDeletionStatus, isLockedOut } from '@/lib/deletionRequests';

export default async function AccountLockedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const status = await getOpenDeletionStatus(supabase, user.id);

  if (!isLockedOut(status)) {
    redirect('/profile');
  }

  const approved = status === 'approved';

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="mb-6 text-2xl font-bold">
        {approved ? 'Account Deleted' : 'Deletion Requested'}
      </h1>
      <p className="text-gray-600">
        {approved
          ? 'This account has been deleted.'
          : 'Your account deletion request is being processed.'}{' '}
        If this was a mistake, contact support to have your account restored.
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Remove the old archived block from `src/app/profile/page.tsx`**

Delete this whole block (the proxy now handles it for every page):

```tsx
  if (profile?.archived_at) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="mb-6 text-2xl font-bold">Account Deleted</h1>
        <p className="text-gray-600">
          This account has been deleted. If this was a mistake, contact
          support to have it reinstated.
        </p>
      </main>
    );
  }
```

- [ ] **Step 4: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type errors, no lint errors, all tests PASS.

- [ ] **Step 5: Manual check of the lockout**

Todd inserts a pending row for a test athlete in the SQL editor (the SQL editor bypasses RLS):

```sql
insert into deletion_requests (user_id, email)
select id, email from auth.users where email = '<test athlete email>';
```

With `npm run dev` running, log in as that athlete. Expected: land on `/account-locked` with "Deletion Requested". Type `/profile` and `/assessment` in the address bar. Expected: both redirect to `/account-locked`. Then clean up:

```sql
update deletion_requests set status = 'restored', resolved_at = now()
where email = '<test athlete email>' and status = 'pending';
```

Reload. Expected: `/account-locked` redirects to `/profile`.

- [ ] **Step 6: Commit**

```bash
git add src/proxy.ts src/app/account-locked/page.tsx src/app/profile/page.tsx
git commit -m "Lock out accounts with an open deletion request on every page

proxy.ts now redirects any signed-in user with a pending or approved
request to /account-locked, which closes the gap where /assessment
was still reachable. The redirect-with-cookies code is pulled into
one helper.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Athlete requests deletion

**Files:**
- Modify: `src/app/profile/ProfileForm.tsx`

**Interfaces:**
- Consumes: `deletion_requests` insert policy from Task 1 (`user_id` = self, `email` = JWT email).

- [ ] **Step 1: Replace `handleDelete` in `ProfileForm.tsx`**

Replace the existing `handleDelete` function with:

```tsx
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
```

- [ ] **Step 2: Update the copy in `DeleteAccountSection`**

In `DeleteAccountSection`:

- Button text `Delete Account` becomes `Request Account Deletion`.
- The confirm paragraph becomes:

```tsx
          <p>
            Are you sure? An Admin will process your request. You&apos;ll be
            signed out right away and won&apos;t be able to log back in unless
            an Admin restores your account.
          </p>
```

- `{deleting ? 'Deleting...' : 'Yes, delete my account'}` becomes `{deleting ? 'Submitting...' : 'Yes, request deletion'}`.

- [ ] **Step 3: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean, all PASS.

- [ ] **Step 4: Manual check**

With `npm run dev`, log in as a test athlete with a saved profile. Click Request Account Deletion, then double-click "Yes, request deletion". Expected: signed out, land on `/`. In the SQL editor:

```sql
select status, email from deletion_requests where email = '<test athlete email>';
```

Expected: exactly one `pending` row. Log back in. Expected: `/account-locked` with "Deletion Requested". Leave this row pending for Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/app/profile/ProfileForm.tsx
git commit -m "Athletes request deletion instead of deleting their own account

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Admin pending count and Approve / Restore

**Files:**
- Create: `src/app/admin/DeletionRequestList.tsx`
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `pendingCountLabel`, `displayName`, `PendingDeletionRow` from Task 2; admin select/update policies from Task 1.
- Produces: `DeletionRequestList({ adminId: string; rows: PendingDeletionRow[] })`.

- [ ] **Step 1: Create `src/app/admin/DeletionRequestList.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { PendingDeletionRow } from '@/lib/deletionRequests';

export function DeletionRequestList({
  adminId,
  rows,
}: {
  adminId: string;
  rows: PendingDeletionRow[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: string, status: 'approved' | 'restored') {
    setBusyId(id);
    setError(null);

    const supabase = createClient();
    // Filtering on pending means a second Admin acting on the same request changes nothing.
    const { error } = await supabase
      .from('deletion_requests')
      .update({ status, resolved_by: adminId, resolved_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending');

    setBusyId(null);

    if (error) {
      setError(error.message);
      return;
    }

    router.refresh();
  }

  return (
    <div className="mt-4">
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-4 rounded border p-3 text-sm"
          >
            <div>
              <div className="font-medium">{row.displayName}</div>
              <div className="text-gray-500">
                Requested {new Date(row.requestedAt).toLocaleDateString()}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => resolve(row.id, 'approved')}
                disabled={busyId !== null}
                className="rounded bg-red-600 px-3 py-1 text-white disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => resolve(row.id, 'restored')}
                disabled={busyId !== null}
                className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
              >
                Restore
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Load pending requests in `src/app/admin/page.tsx`**

Add imports:

```tsx
import { displayName, pendingCountLabel, type PendingDeletionRow } from '@/lib/deletionRequests';
import { DeletionRequestList } from './DeletionRequestList';
```

After the `dateAdded` line, add:

```tsx
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
```

- [ ] **Step 3: Render the banner and list**

Directly after `<h1 className="text-2xl font-bold">Platform Admin</h1>`, add:

```tsx
      {countLabel && (
        <section className="mt-6">
          <div className="rounded border border-yellow-300 bg-yellow-50 p-4 text-sm font-medium">
            {countLabel}
          </div>
          <DeletionRequestList adminId={user.id} rows={rows} />
        </section>
      )}
```

- [ ] **Step 4: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean, all PASS.

- [ ] **Step 5: Manual check**

Using the pending request left from Task 4, plus a second test athlete who signs up and requests deletion without ever saving a profile:

1. Todd logs in as Platform Admin. Expected: "2 pending deletion requests", one row showing a name, one showing an email.
2. Open `/admin` in a second tab. In tab 1 click Approve on the first row. Expected: banner reads "1 pending deletion request".
3. In tab 2 (still showing the old list) click Approve on the same row. Expected: no error, list refreshes to the one remaining row.
4. Click Restore on the remaining row. Expected: banner and list disappear.
5. Log in as the approved athlete. Expected: "Account Deleted". Log in as the restored athlete. Expected: `/profile` loads normally.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/DeletionRequestList.tsx src/app/admin/page.tsx
git commit -m "Show pending deletion requests to admins with Approve and Restore

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Security check, docs, and parking lot

**Files:**
- Modify: `C:\development\Claude Code\Proven\Technical_Specification_V2.md` (section 4.7, not in git)
- Modify: `C:\development\Claude Code\Proven\Parking_Lot.md` (not in git)

- [ ] **Step 1: Confirm athletes can't escalate**

In the Supabase SQL editor, impersonate the restored athlete from Task 5 inside a transaction that is rolled back, so nothing persists:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<athlete user id>", "email": "<athlete email>"}';

select count(*) from deletion_requests;
-- Expected: only that athlete's own rows

update deletion_requests set status = 'approved' where user_id = '<athlete user id>';
-- Expected: UPDATE 0 (athletes have no update policy)

select count(*) from profiles;
-- Expected: 1 (their own)

rollback;
```

- [ ] **Step 2: Restored athlete can request again**

As the restored athlete, click Request Account Deletion and confirm. Expected: signed out, a new `pending` row exists alongside the old `restored` one. Restore it from `/admin` to clean up.

- [ ] **Step 3: Update the tech spec**

In `Technical_Specification_V2.md`, section 4.7 Admin Console, add:

```markdown
- **Account deletion requests:** athletes cannot delete their own account. They request deletion, which locks them out immediately. Platform Admins see a count of pending requests on the admin page and either Approve (the account is archived, data kept) or Restore (access returns). Every request is kept as an audit record of who asked, when, and which Admin resolved it.
```

- [ ] **Step 4: Update the parking lot**

In `Parking_Lot.md`, remove the "Delete Account edge cases" entry from Open and add under Resolved (replacing "*(none yet)*"):

```markdown
### Delete Account edge cases
**Resolved:** 2026-09-24. Replaced self-delete with admin-approved deletion requests (`deletion_requests` table). Lockout is enforced on every page by the proxy, athletes without a profile can request deletion, and Admins can Restore a pending request. Reinstating an already approved account is still a manual database edit.
```

Add under Open:

```markdown
### Email Admins about pending deletion requests
**Logged:** 2026-09-24

Admins currently see pending deletion requests only as a count on the admin page. Options: an email per request, or a daily digest when anything is pending. Either needs an email service.

### Reinstate an approved (archived) account
**Logged:** 2026-09-24

Admins can Restore a pending deletion request, but once approved, reinstating means editing `deletion_requests` by hand. Option: an Archived list on the admin page with a Reinstate button.
```

- [ ] **Step 5: Final verification**

Run in the app repo: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all clean, build succeeds.

Ask Todd before pushing. Pushing deploys to Vercel.
