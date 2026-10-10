-- The Students page (admin/registrar, and teachers with Admin View) was
-- fetching every attendance_records row to the browser (14,000+ and
-- growing) just to sum present/late/total per student client-side - even
-- paginated, that's ~15 sequential round trips and was making the tab slow
-- to load. One GROUP BY query does the same work in Postgres instead.
--
-- Deliberately NOT security definer: it runs under the calling user's own
-- RLS, so it only ever aggregates rows that user could already see via a
-- direct select on attendance_records - same access as today, just
-- computed server-side. (get_dashboard_attendance_stats already does this
-- same aggregation for the dashboard, but it's hard-restricted to literal
-- role = 'admin' via its own check, which would break this for registrars
-- and Admin-View teachers who also use this Students page.)
-- Run in Supabase Dashboard → SQL Editor → New Query

create or replace function public.get_attendance_stats(
  p_student_ids uuid[] default null,
  p_group_id uuid default null
)
returns table (student_id uuid, total bigint, attended bigint)
language sql
stable
set search_path = public
as $$
  select
    ar.student_id,
    count(*) filter (where ar.status != 'holiday') as total,
    count(*) filter (where ar.status in ('present','late')) as attended
  from attendance_records ar
  where (p_student_ids is null or ar.student_id = any(p_student_ids))
    and (p_group_id is null or ar.group_id = p_group_id)
  group by ar.student_id;
$$;

grant execute on function public.get_attendance_stats(uuid[], uuid) to authenticated;
