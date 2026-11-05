-- Live definition of mark_unmarked_staff_absent() before gatka-kirtan-teacher-registers.sql (05-11-2026).
-- Run this to undo that change to the function.

CREATE OR REPLACE FUNCTION public.mark_unmarked_staff_absent()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now   timestamp := now() at time zone 'Europe/London';
  v_today date      := v_now::date;
begin
  if extract(dow from v_today)::int not in (5, 6) then
    return;
  end if;
  if not (v_now::time >= '21:30' and v_now::time < '21:45') then
    return;
  end if;
  if not exists (
    select 1 from attendance_sessions ats
    join groups g on g.id = ats.group_id
    where ats.session_date = v_today and coalesce(g.class_type, 'punjabi') = 'punjabi'
  ) then
    return;
  end if;

  insert into teacher_attendance (teacher_id, session_date, status, notes)
  select u.id, v_today, 'absent', 'Auto: not marked by 21:30'
  from users u
  where (u.role in ('teacher', 'registrar') or u.extra_roles && array['teacher', 'registrar'])
    and (u.created_at at time zone 'Europe/London')::date <= v_today
    and not exists (
      select 1 from teacher_attendance ta
      where ta.teacher_id = u.id and ta.session_date = v_today
    )
  on conflict (teacher_id, session_date) do nothing;
end;
$function$;
