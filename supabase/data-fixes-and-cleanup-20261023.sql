-- Data fixes and clean-up, approved 23-10-2026.
--
-- 1. Register start times (attendance_sessions.created_at)
--    The column didn't exist until add-dashboard-role-and-projector-stats.sql
--    added it on 12-10-2026 with "not null default now()" - which stamped all
--    869 existing registers (08-07 to 10-10) with that moment, 12-10 10:00:16.
--    No register or mark was re-created or lost; only these start times are
--    placeholders. Their real start times were never recorded, so they're set
--    to NULL (unknown) rather than a made-up time. New registers still get
--    now() as before. Nothing reads start times of past registers (Register
--    Status and the projector only use today's / the latest class day's).
--
-- 2. Green Group: groups.teacher_id was empty while teacher_groups marks
--    Jaspreet Kaur as its primary teacher - set it to match.
--
-- 3. Teacher name "Gurpreet  kaur" (double space) -> "Gurpreet kaur".
--
-- 4. Remove auto_submit_registers() - the unused July auto-submit that marked
--    every unmarked student absent. Last ran 08-08-2026; nothing references
--    it. Original definition kept in supabase/removed/ for restore.
--
-- Undo for 1: placeholder value was '2026-10-12 09:00:16.056188+00' for every
-- register with session_date < '2026-10-12'.
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

-- 1
alter table public.attendance_sessions alter column created_at drop not null;

update public.attendance_sessions
set created_at = null
where session_date < '2026-10-12'
  and created_at = (select min(created_at) from public.attendance_sessions);

-- 2
update public.groups
set teacher_id = 'ff8eb3aa-6c3b-417e-a8bd-b59b98eeea01'   -- Jaspreet Kaur
where name = 'Green Group'
  and teacher_id is null
  and exists (select 1 from public.teacher_groups tg
              where tg.group_id = groups.id and tg.role = 'primary'
                and tg.teacher_id = 'ff8eb3aa-6c3b-417e-a8bd-b59b98eeea01');

-- 3
update public.users set name = 'Gurpreet kaur' where name = 'Gurpreet  kaur';

-- 4
drop function if exists public.auto_submit_registers();

-- Expected: 869 | Jaspreet Kaur | 1 | 0
select
  (select count(*) from public.attendance_sessions where created_at is null) as start_times_cleared,
  (select u.name from public.groups g join public.users u on u.id = g.teacher_id where g.name = 'Green Group') as green_group_teacher,
  (select count(*) from public.users where name = 'Gurpreet kaur') as gurpreet_fixed,
  (select count(*) from pg_proc where proname = 'auto_submit_registers') as old_function_left;

commit;
