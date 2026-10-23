-- In-app reminders to complete the Teacher Register.
--
-- On Fri/Sat class days, at 19:30 and 20:45 UK time, if any teacher or
-- registrar (primary or extra role, joined on/before today) still has no
-- Teacher Register mark for today, everyone with Teacher Register access
-- gets a notification in the app's bell:
--   "Teacher Register reminder (19:30): 12 of 57 staff not marked yet today ..."
--
-- Recipients: admins and registrars (primary or extra role) plus anyone with
-- can_manage_teacher_register.
--
-- Only sends on real class days (at least one Punjabi student register has
-- been started today), so holidays stay quiet. Nothing is pre-filled - this
-- only notifies.
--
-- pg_cron runs in GMT, so the job runs every 15 minutes through the evening
-- and the function itself checks UK local time - correct either side of the
-- clocks changing.
-- Run in Supabase Dashboard -> SQL Editor -> New Query

create or replace function public.send_teacher_register_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now      timestamp := now() at time zone 'Europe/London';
  v_today    date      := v_now::date;
  v_slot     text;
  v_total    int;
  v_unmarked int;
  v_message  text;
begin
  if extract(dow from v_today)::int not in (5, 6) then
    return;
  end if;

  -- Which reminder slot (if any) this 15-minute run falls in
  if v_now::time >= '19:30' and v_now::time < '19:45' then
    v_slot := '19:30';
  elsif v_now::time >= '20:45' and v_now::time < '21:00' then
    v_slot := '20:45';
  else
    return;
  end if;

  -- Only on actual class days
  if not exists (
    select 1 from attendance_sessions ats
    join groups g on g.id = ats.group_id
    where ats.session_date = v_today and coalesce(g.class_type, 'punjabi') = 'punjabi'
  ) then
    return;
  end if;

  -- Don't send the same slot twice
  if exists (
    select 1 from notifications
    where message like 'Teacher Register reminder (' || v_slot || ')%'
      and (created_at at time zone 'Europe/London')::date = v_today
  ) then
    return;
  end if;

  select count(*),
         count(*) filter (where not exists (
           select 1 from teacher_attendance ta
           where ta.teacher_id = u.id and ta.session_date = v_today))
    into v_total, v_unmarked
  from users u
  where (u.role in ('teacher', 'registrar') or u.extra_roles && array['teacher', 'registrar'])
    and (u.created_at at time zone 'Europe/London')::date <= v_today;

  if v_unmarked = 0 then
    return;
  end if;

  v_message := 'Teacher Register reminder (' || v_slot || '): ' || v_unmarked || ' of ' || v_total
    || ' staff not marked yet today. Please complete the Teacher Register before the end of class.';

  insert into notifications (user_id, message)
  select u.id, v_message
  from users u
  where u.role in ('admin', 'registrar')
     or u.extra_roles && array['admin', 'registrar']
     or u.can_manage_teacher_register = true;
end;
$$;

revoke all on function public.send_teacher_register_reminders() from public, anon, authenticated;

select cron.schedule(
  'teacher-register-reminders',
  '*/15 17-21 * * 5,6',
  $$ select public.send_teacher_register_reminders(); $$
);
