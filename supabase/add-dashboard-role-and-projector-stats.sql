-- New "dashboard" role for a single shared projector/big-screen login.
-- Deliberately has ZERO direct table grants anywhere in this schema - every
-- existing RLS policy checks for admin/registrar/teacher/adminView, none of
-- them match 'dashboard', so this role is denied by default on every table,
-- read and write. The only data it can ever see is whatever
-- get_projector_dashboard_stats() explicitly returns below: aggregate group
-- names and counts only - no student names, addresses, medical notes, or
-- phone numbers anywhere in it. Safe even if the shared login is ever left
-- open on a screen in a public room.
-- Run in Supabase Dashboard → SQL Editor → New Query

alter table public.users drop constraint users_role_check;
alter table public.users add constraint users_role_check
  check (role = any (array['admin','registrar','teacher','adminView','dashboard']));

-- Needed for the live "just submitted" feed - attendance_sessions had no
-- timestamp recording when a register was actually started, only the date.
alter table public.attendance_sessions add column if not exists created_at timestamptz not null default now();

create or replace function public.get_projector_dashboard_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not (user_has_role('dashboard') or user_has_role('admin')) then
    raise exception 'Unauthorized';
  end if;

  select json_build_object(
    'groups', (
      select coalesce(json_agg(row_to_json(g)), '[]'::json) from (
        select
          gr.id,
          gr.name,
          (select count(*) from students s where s.group_id = gr.id and s.active = true) as total_students,
          (ats.id is not null) as started,
          coalesce(rec.present, 0) as present,
          coalesce(rec.late, 0) as late,
          coalesce(rec.absent, 0) as absent,
          coalesce(rec.holiday, 0) as holiday
        from groups gr
        left join attendance_sessions ats on ats.group_id = gr.id and ats.session_date = current_date
        left join lateral (
          select
            count(*) filter (where ar.status = 'present') as present,
            count(*) filter (where ar.status = 'late')    as late,
            count(*) filter (where ar.status = 'absent')  as absent,
            count(*) filter (where ar.status = 'holiday') as holiday
          from attendance_records ar where ar.session_id = ats.id
        ) rec on true
        where coalesce(gr.class_type, 'punjabi') = 'punjabi'
        order by gr.name
      ) g
    ),
    'top5', (
      select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
        with student_pct as (
          select
            ar.student_id,
            count(*) filter (where ar.status != 'holiday') as total,
            count(*) filter (where ar.status in ('present','late')) as attended
          from attendance_records ar
          group by ar.student_id
        ),
        high as (
          select student_id from student_pct
          where total > 0 and (attended::numeric / total) >= 0.8
        )
        select gr.name, count(h.student_id) as high_count
        from groups gr
        join students s on s.group_id = gr.id and s.active = true
        join high h on h.student_id = s.id
        where coalesce(gr.class_type, 'punjabi') = 'punjabi'
        group by gr.id, gr.name
        order by high_count desc
        limit 5
      ) t
    ),
    'recent', (
      select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
        select gr.name, ats.created_at
        from attendance_sessions ats
        join groups gr on gr.id = ats.group_id
        where ats.session_date = current_date and coalesce(gr.class_type, 'punjabi') = 'punjabi'
        order by ats.created_at desc
        limit 8
      ) r
    ),
    'class_day_number', (
      select count(distinct ats.session_date)
      from attendance_sessions ats
      join groups gr on gr.id = ats.group_id
      where coalesce(gr.class_type, 'punjabi') = 'punjabi' and ats.session_date <= current_date
    ),
    'server_time', now()
  ) into result;

  return result;
end;
$$;

grant execute on function public.get_projector_dashboard_stats() to authenticated;
