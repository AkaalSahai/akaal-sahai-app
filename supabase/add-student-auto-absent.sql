-- From 23-10-2026: at 21:30 UK time on Fri/Sat, students left unmarked in a
-- main Punjabi group register that was started today are recorded Absent
-- (note "Auto: not marked by 21:30") - what the register screen already
-- tells teachers happens.
--
-- Deliberately NOT touched:
--   * groups whose register was never started (the class may not have run)
--   * registers opened but with nobody marked at all (e.g. teacher forgot)
--   * extra-class registers (GCSE, Gatka...) - an auto-absent there would be
--     copied into the student's main group by sync_extra_class_attendance_to_punjabi
--   * students enrolled in an extra class that also had a register today and
--     who aren't marked anywhere - left for the extra-class teacher/admin
--   * students who joined after today, or already have any mark today
--
-- pg_cron runs in GMT, so the job runs every 15 minutes through the evening
-- and the function acts only in the 21:30-21:44 UK-time window.
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
    -- register actually used: at least one student marked
    and exists (select 1 from attendance_records r where r.session_id = ats.id)
    and (st.date_joined is null or st.date_joined <= v_today)
    -- no mark anywhere today (covers marks copied from an extra class)
    and not exists (
      select 1 from attendance_records r2
      where r2.student_id = st.id and r2.session_date = v_today)
    -- in an extra class that also ran today: leave for that class's teacher
    and not exists (
      select 1 from student_classes sc
      join groups xg on xg.id = sc.group_id and coalesce(xg.class_type, 'punjabi') <> 'punjabi'
      join attendance_sessions xs on xs.group_id = sc.group_id and xs.session_date = v_today
      where sc.student_id = st.id)
  on conflict (session_id, student_id) do nothing;
end;
$$;

revoke all on function public.mark_unmarked_students_absent() from public, anon, authenticated;

select cron.schedule(
  'student-auto-absent-uk-2130',
  '*/15 20-21 * * 5,6',
  $$ select public.mark_unmarked_students_absent(); $$
);
