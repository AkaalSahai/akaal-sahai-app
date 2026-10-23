-- Refines mark_unmarked_students_absent() (add-student-auto-absent.sql),
-- 23-10-2026. A main Punjabi register can be created automatically by the
-- extra-class copy rule (a GCSE mark copied into e.g. Santhiya Boys) even if
-- that group's own teacher never opened it. "Register actually used" now
-- means at least one mark made in that register itself, not just copies -
-- otherwise one copied GCSE mark could make the whole rest of the group
-- Absent. Same intent as the existing "skip registers nobody marked" rule.
-- Only that one condition changes.
-- Run in Supabase Dashboard -> SQL Editor -> New Query

create or replace function public.mark_unmarked_students_absent()
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  insert into attendance_records (session_id, student_id, group_id, session_date, status, notes)
  select ats.id, st.id, ats.group_id, v_today, 'absent', 'Auto: not marked by 21:30'
  from attendance_sessions ats
  join groups g on g.id = ats.group_id
  join students st on st.group_id = ats.group_id and st.active
  where ats.session_date = v_today
    and g.active
    and coalesce(g.class_type, 'punjabi') = 'punjabi'
    -- register actually used by its own teacher: at least one mark that
    -- isn't just a copy from an extra class
    and exists (select 1 from attendance_records r
                where r.session_id = ats.id and r.synced_from_class_type is null)
    and (st.date_joined is null or st.date_joined <= v_today)
    and not exists (
      select 1 from attendance_records r2
      where r2.student_id = st.id and r2.session_date = v_today)
    and not exists (
      select 1 from student_classes sc
      join groups xg on xg.id = sc.group_id and coalesce(xg.class_type, 'punjabi') <> 'punjabi'
      join attendance_sessions xs on xs.group_id = sc.group_id and xs.session_date = v_today
      where sc.student_id = st.id)
  on conflict (session_id, student_id) do nothing;
end;
$$;
