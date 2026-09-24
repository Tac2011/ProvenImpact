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
