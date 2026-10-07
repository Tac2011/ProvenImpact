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
