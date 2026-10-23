-- One-time, approved 23-10-2026: every teacher/registrar (primary or extra
-- role) left unmarked on a past class day gets an Absent mark.
--
-- A class day = any date with at least one Teacher Register mark (same rule
-- as the Teacher Attendance Report). Only days on/after the person's joining
-- date count. Percentages don't change - the report already counted these
-- as absent - but they become real records, tagged so they can still be told
-- apart from absences someone actually marked.
--
-- Expected: 297 rows (257 on the 8 days the register wasn't taken, 40 on
-- other class days).
--
-- Undo:
--   delete from teacher_attendance
--    where notes = 'Auto: unmarked – recorded as absent 23-10-2026' and marked_by is null;
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

insert into teacher_attendance (teacher_id, session_date, status, notes)
select u.id, d.session_date, 'absent', 'Auto: unmarked – recorded as absent 23-10-2026'
from (select distinct session_date from teacher_attendance where session_date < current_date) d
join users u
  on (u.role in ('teacher', 'registrar') or u.extra_roles && array['teacher', 'registrar'])
 and (u.created_at at time zone 'Europe/London')::date <= d.session_date
where not exists (
  select 1 from teacher_attendance ta
  where ta.teacher_id = u.id and ta.session_date = d.session_date
)
on conflict (teacher_id, session_date) do nothing;

-- Expected: 297
select count(*) as marked_absent from teacher_attendance
where notes = 'Auto: unmarked – recorded as absent 23-10-2026';

commit;
