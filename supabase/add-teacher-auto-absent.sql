-- From 23-10-2026: at 21:30 UK time on Fri/Sat class days, every teacher or
-- registrar (primary or extra role, joined on/before today) with no Teacher
-- Register mark is recorded Absent, note "Auto: not marked by 21:30".
-- Register managers can still change it afterwards in the Teacher Register.
--
-- Only on real class days (at least one Punjabi student register started
-- today), so holidays stay untouched. pg_cron runs in GMT, so the job runs
-- every 15 minutes through the evening and the function acts only in the
-- 21:30-21:44 UK-time window - once a night, correct all year round.
-- Run in Supabase Dashboard -> SQL Editor -> New Query

create or replace function public.mark_unmarked_staff_absent()
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
$$;

revoke all on function public.mark_unmarked_staff_absent() from public, anon, authenticated;

select cron.schedule(
  'teacher-auto-absent-uk-2130',
  '*/15 20-21 * * 5,6',
  $$ select public.mark_unmarked_staff_absent(); $$
);
