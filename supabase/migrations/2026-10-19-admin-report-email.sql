-- Admin Reports show each athlete's sign-in email, so admins can tell which
-- account (for example a test account) belongs to which name.
-- Return columns change, so drop and recreate. Email is added last, so the code
-- live before this release keeps working.

drop function admin_report_athletes();

create function admin_report_athletes()
returns table (
  id                   uuid,
  first_name           text,
  last_name            text,
  college              text,
  degree               text,
  sport                text,
  created_at           timestamptz,
  college_name         text,
  college_city         text,
  college_state        text,
  college_other        text,
  degree_type          text,
  degree_other         text,
  primary_field_title  text,
  primary_field_other  text,
  grad_month           smallint,
  grad_year            smallint,
  email                text
)
language sql security definer stable
set search_path = public
as $$
  select p.id, p.first_name, p.last_name, p.college, p.degree, p.sport, p.created_at,
         c.name, c.city, c.state::text, e.college_other,
         e.degree_type, e.degree_other, f.title, e.primary_field_other,
         e.end_month, e.end_year, u.email::text
  from profiles p
  left join auth.users u on u.id = p.id
  left join user_roles r on r.id = p.id
  left join athlete_education e on e.athlete_id = p.id and e.is_current
  left join colleges c on c.id = e.college_id
  left join fields_of_study f on f.code = e.primary_field_code
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
