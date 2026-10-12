-- Reserved (inactive) groups - kept around for a future cohort, no students
-- yet - were showing up as "hasn't submitted" on the projector dashboard.
-- Excludes them from every part of the stats this function returns.
-- Run in Supabase Dashboard → SQL Editor → New Query

create or replace function public.get_projector_dashboard_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
  v_is_today boolean;
  v_target_date date;
begin
  if not (user_has_role('dashboard') or user_has_role('admin')) then
    raise exception 'Unauthorized';
  end if;

  v_is_today := extract(dow from current_date)::int in (5, 6);

  if v_is_today then
    v_target_date := current_date;
  else
    select max(ats.session_date) into v_target_date
    from attendance_sessions ats
    join groups gr on gr.id = ats.group_id
    where coalesce(gr.class_type, 'punjabi') = 'punjabi' and gr.active and ats.session_date < current_date;
  end if;

  select json_build_object(
    'is_today', v_is_today,
    'target_date', v_target_date,
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
        left join attendance_sessions ats
          on ats.group_id = gr.id and ats.session_date = v_target_date and v_target_date is not null
        left join lateral (
          select
            count(*) filter (where ar.status = 'present') as present,
            count(*) filter (where ar.status = 'late')    as late,
            count(*) filter (where ar.status = 'absent')  as absent,
            count(*) filter (where ar.status = 'holiday') as holiday
          from attendance_records ar where ar.session_id = ats.id
        ) rec on true
        where coalesce(gr.class_type, 'punjabi') = 'punjabi' and gr.active
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
        where coalesce(gr.class_type, 'punjabi') = 'punjabi' and gr.active
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
        where ats.session_date = v_target_date and v_target_date is not null
          and coalesce(gr.class_type, 'punjabi') = 'punjabi' and gr.active
        order by ats.created_at desc
        limit 8
      ) r
    ),
    'class_day_number', (
      select count(distinct ats.session_date)
      from attendance_sessions ats
      join groups gr on gr.id = ats.group_id
      where coalesce(gr.class_type, 'punjabi') = 'punjabi' and gr.active and ats.session_date <= current_date
    ),
    'server_time', now()
  ) into result;

  return result;
end;
$$;
