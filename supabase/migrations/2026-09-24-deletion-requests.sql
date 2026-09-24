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
