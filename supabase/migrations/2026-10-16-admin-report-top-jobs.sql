-- Each athlete's latest top 10 jobs, for the admin reports. Returns only the top 10
-- (TOP_COUNT in src/lib/topJobs/constants.ts), not every ranked candidate, and no rows
-- for non-admins. Athletes still read only their own results through the table policy.

create function admin_report_top_jobs()
returns table (
  athlete_id  uuid,
  created_at  timestamptz,
  rank        int,
  code        text,
  title       text,
  level       text
)
language sql security definer stable
set search_path = public
as $$
  with latest as (
    select distinct on (r.athlete_id) r.athlete_id, r.created_at, r.ranked
    from top_job_results r
    where is_platform_admin()
    order by r.athlete_id, r.created_at desc
  )
  select l.athlete_id, l.created_at, j.ord::int, j.job->>'code', o.title, j.job->>'level'
  from latest l
  cross join lateral jsonb_array_elements(l.ranked) with ordinality as j(job, ord)
  left join occupations o on o.code = j.job->>'code'
  where j.ord <= 10
  order by l.athlete_id, j.ord;
$$;

revoke execute on function admin_report_top_jobs() from public, anon;
grant execute on function admin_report_top_jobs() to authenticated;
