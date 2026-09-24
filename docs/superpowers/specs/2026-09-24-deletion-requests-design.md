# Proven Impact: Deletion Requests Design

**Date:** 2026-09-24
**Status:** Draft, awaiting Todd's review

## Purpose

Today an athlete can archive their own account from the profile page. That
changes to a request-and-approve flow: athletes can only **request**
deletion, and only a Platform Admin can carry it out. The same work closes
the three Delete Account gaps logged in the parking lot on 2026-09-21:

1. An athlete who never saved a profile has no row to archive, so Delete
   Account can't lock them out.
2. An archived athlete can still reach `/assessment` by typing the URL.
3. There is no way to reinstate an archived account. (Partly closed: Admins
   can restore a pending request. Reinstating an already approved one is
   still out of scope, see below.)

## Decisions

| Question | Decision |
|---|---|
| What does "delete" mean? | Archive. Data is kept, the account is locked, and it can be reinstated. |
| What happens when an athlete requests deletion? | Locked out immediately and signed out. |
| How are Admins notified? | In-app count on the admin page. No email for now. |
| What can an Admin do with a request? | Approve (archive) or Restore (cancel the request, access returns). |
| Which Admins? | Platform Admin only. University Admin handling comes later. |

## Data Model

New table `deletion_requests`. It replaces `profiles.archived_at` as the
single source of truth for whether an account is locked.

```sql
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
-- Restored requests stay as history, so an athlete can request again later.
create unique index deletion_requests_one_open_per_user
  on deletion_requests (user_id)
  where status in ('pending', 'approved');
```

- `email` is copied from the signed-in user at request time. Admins can't
  read `auth.users`, and athletes who never saved a profile have no name,
  so the email is how the admin list identifies them.
- Rows are never deleted. Each one records who asked, when, who resolved
  it, and how, which covers the audit expectation in the tech spec.

### Migrating existing archived accounts

Accounts already archived through the old flow move into the new table as
`approved`, then the old column is dropped:

```sql
insert into deletion_requests (user_id, email, status, requested_at, resolved_at)
select p.id, u.email, 'approved', p.archived_at, p.archived_at
from profiles p
join auth.users u on u.id = p.id
where p.archived_at is not null;

alter table profiles drop column archived_at;
```

`resolved_by` is left null for migrated rows, since those athletes
archived themselves under the old flow.

## Security (Row-Level Security)

A helper function checks whether the current user is a Platform Admin. It
runs as `security definer` so policies can call it without granting
everyone read access to `user_roles`.

```sql
create function is_platform_admin() returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from user_roles
    where id = auth.uid() and role = 'platform_admin'
  );
$$;
```

Policies on `deletion_requests`:

| Who | Action | Rule |
|---|---|---|
| Athlete | insert | Only for themselves, only with status `pending`, no resolver fields set |
| Athlete | select | Only their own rows |
| Platform Admin | select | All rows |
| Platform Admin | update | All rows |

New policy on `profiles`: Platform Admins can select all rows, so the
admin list can show athlete names.

Athletes get no update policy on `deletion_requests`, so they can't
approve, restore, or withdraw a request themselves.

## Athlete Flow

On `/profile`, the Danger Zone button is renamed **Request Account
Deletion**. The confirm step reads roughly:

> Are you sure? An Admin will process your request. You'll be signed out
> right away and won't be able to log back in unless an Admin restores
> your account.

On confirm:

1. Insert a `pending` row into `deletion_requests` with the user's id and
   email.
2. If the insert fails, show the error and stay on the page. Do not sign
   out.
3. On success, sign out and go to `/`.

The "Account Deleted" block currently in `profile/page.tsx` is removed; the
lockout is handled for every page by the proxy (below).

## Lockout

The lockout check moves into `src/proxy.ts`, which runs on every request.

- For a signed-in user on any page other than the public pages (`/`,
  `/login`, `/signup`) and `/account-locked` itself, look up their open
  request (status `pending` or `approved`).
- If one exists, redirect to `/account-locked`.

This covers `/profile`, `/assessment`, `/admin`, and any page added later,
which closes gap 2.

The rule "which statuses lock an account" lives in one small pure function
in `src/lib/deletionRequests.ts` so it can be unit tested, alongside a
helper that fetches the user's open request.

### `/account-locked` page

- Not signed in: redirect to `/login`.
- Signed in with no open request: redirect to `/profile`.
- `pending`: "Your account deletion request is being processed."
- `approved`: "This account has been deleted."
- Both messages end with: "If this was a mistake, contact support to have
  your account restored." The header's logout button stays available.

## Admin Flow

On `/admin`, above the existing admin details:

- **Banner:** "3 pending deletion requests" (singular when 1). Hidden when
  there are none.
- **List** of pending requests, oldest first. Each row shows:
  - Name from `profiles` if the athlete saved one, otherwise their email
  - Date requested
  - **Approve** button: sets status `approved`, `resolved_by`, `resolved_at`
  - **Restore** button: sets status `restored`, `resolved_by`, `resolved_at`

Each update also filters on `status = 'pending'`, so if two Admins act on
the same request, the second click changes nothing. After either action
the list refreshes and the count updates.

Names come from a second query on `profiles` by the pending `user_id`s,
merged in the page. There is no direct foreign key between the two tables
for Supabase to join on, and at this scale two queries are fine.

A restored athlete gets full access on their next page load. If they
request deletion again later, a new row is created.

## Files

| File | Change |
|---|---|
| `src/lib/deletionRequests.ts` | New. Status type, lockout rule, fetch-open-request helper |
| `src/lib/deletionRequests.test.ts` | New. Unit tests for the lockout rule |
| `src/proxy.ts` | Add lockout redirect |
| `src/app/account-locked/page.tsx` | New. Locked message |
| `src/app/profile/ProfileForm.tsx` | Delete becomes Request Deletion |
| `src/app/profile/page.tsx` | Remove `archived_at` block |
| `src/app/admin/page.tsx` | Add count banner and pending list |
| `src/app/admin/DeletionRequestList.tsx` | New. Client component with Approve / Restore |
| `supabase/schema.sql` | Bring up to date with the real database, plus this change |
| `supabase/migrations/2026-09-24-deletion-requests.sql` | New. The script Todd runs in the Supabase SQL editor |

Outside the app repo:

- `Technical_Specification_V2.md`, section 4.7 Admin Console: add
  deletion request handling and the pending-count notification.
- `Parking_Lot.md`: move the three Delete Account gaps to Resolved, and
  log "email Admins about pending deletion requests" as a future option.

## Testing

- **Unit (Vitest):** lockout rule returns locked for `pending` and
  `approved`, unlocked for `restored` and for no request.
- **Manual, in the browser, against the local dev server:**
  1. Athlete with a saved profile requests deletion, gets signed out,
     logs back in, lands on `/account-locked` with the pending message.
  2. Same athlete types `/assessment` and `/profile` directly, and both
     redirect to `/account-locked`.
  3. Athlete with no saved profile requests deletion, and is locked out
     the same way.
  4. Admin sees the correct count and both athletes in the list (one by
     name, one by email).
  5. Admin approves one: the count drops, and that athlete now sees the
     approved message.
  6. Admin restores the other: that athlete logs in and reaches `/profile`
     normally.
  7. An athlete account cannot read other athletes' requests or update
     its own request (checked with a direct Supabase call in the browser
     console).

## Out of Scope

- Email notification to Admins (logged in the parking lot).
- A list of already-archived accounts for Admins to reinstate. Restore
  covers pending requests; reinstating an approved one still means a
  manual database edit for now.
- University Admin handling of requests for their own athletes.
- Permanent deletion or a purge window.
