-- Permanently delete accounts by sign-in email, with all of their data.
-- Run in the Supabase SQL Editor. There is no undo.
--
-- Step 1: run the preview query alone to see every account.
-- Step 2: put the emails to delete in the list, then run the delete block alone.
--
-- Safety: the whole delete is one block. If any email is not found, or any
-- email is a platform admin, it stops with an error and deletes nothing.

-- Step 1: preview -------------------------------------------------------

select u.email,
       coalesce(r.role, 'student_athlete') as role,
       p.first_name, p.last_name,
       u.created_at::date as joined
from auth.users u
left join public.user_roles r on r.id = u.id
left join public.profiles p on p.id = u.id
order by role, u.email;

-- Optional dry run for a wildcard: lists what 'nsxdude82+*@gmail.com' would match.
-- In LIKE, % is the wildcard (the delete block turns * into it for you).

select u.email, coalesce(r.role, 'student_athlete') as role
from auth.users u
left join public.user_roles r on r.id = u.id
where lower(u.email) like 'nsxdude82+%@gmail.com'
order by u.email;

-- Step 2: delete --------------------------------------------------------

-- * matches anything: 'nsxdude82+*@gmail.com' matches every nsxdude82+ address.
-- Emails in keep are never deleted, even when a wildcard matches them.

do $$
declare
  emails text[] := array[
    'someone@example.com'
  ];
  keep text[] := array[
    'nsxdude82+check1@gmail.com',
    'nsxdude82+check2@gmail.com'
  ];
  patterns text[];
  missing text;
  target record;
begin
  -- Turn each entry into a LIKE pattern: escape LIKE's own _ and %, then * becomes %.
  select array_agg(replace(replace(replace(replace(lower(x), '\', '\\'), '_', '\_'), '%', '\%'), '*', '%'))
  into patterns
  from unnest(emails) x;

  select string_agg(x, ', ') into missing
  from unnest(emails) x
  where not exists (
    select 1 from auth.users u
    where lower(u.email) like replace(replace(replace(replace(lower(x), '\', '\\'), '_', '\_'), '%', '\%'), '*', '%')
      and lower(u.email) not in (select lower(k) from unnest(keep) k)
  );
  if missing is not null then
    raise exception 'Stopped: no account to delete for %. Nothing was deleted.', missing;
  end if;

  for target in
    select u.id, u.email, coalesce(r.role, 'student_athlete') as role
    from auth.users u
    left join public.user_roles r on r.id = u.id
    where lower(u.email) like any (patterns)
      and lower(u.email) not in (select lower(k) from unnest(keep) k)
  loop
    if target.role = 'platform_admin' then
      raise exception 'Stopped: % is a platform admin. Nothing was deleted.', target.email;
    end if;

    -- Children before parents. experience_evidence goes with experiences, and
    -- athlete_education goes with profiles (its trigger logs the delete, so the
    -- history rows are cleared after).
    delete from public.story_ideas where athlete_id = target.id;
    delete from public.bio_imports where athlete_id = target.id;
    delete from public.athlete_honors where athlete_id = target.id;
    delete from public.top_job_results where athlete_id = target.id;
    delete from public.experience_runs where athlete_id = target.id;
    delete from public.experiences where athlete_id = target.id;
    delete from public.competency_scores where athlete_id = target.id;
    delete from public.profiles where id = target.id;
    delete from public.athlete_education_history where athlete_id = target.id;
    delete from public.deletion_requests where user_id = target.id;
    delete from public.user_roles where id = target.id;
    delete from auth.users where id = target.id;

    raise notice 'Deleted %', target.email;
  end loop;
end $$;
