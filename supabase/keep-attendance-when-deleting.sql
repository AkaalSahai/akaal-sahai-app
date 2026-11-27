-- B3 (health check 27-11-2026): deleting a group or a student must never
-- silently delete its attendance history (our keep-history rule).
-- Until now these links were ON DELETE CASCADE:
--   attendance_sessions.group_id  -> groups    (deleting a group wiped its registers)
--   attendance_records.group_id   -> groups    (… and every mark in them)
--   attendance_records.student_id -> students  (deleting a student wiped their marks)
-- After this they are RESTRICT: the database refuses the delete while
-- history exists. Admins deactivate groups / archive students instead.
--
-- Still works, checked 27-11-2026:
--   * merge_groups() moves sessions + records to the surviving group BEFORE
--     deleting the old one, so nothing points at it any more.
--   * Archive -> "Permanently Erase" (GDPR) deletes the child's attendance
--     records first, then the student.
--   * Deleting an empty group with no registers.
-- Groups page "Delete" now shows a clear message instead of failing silently
-- (AdminGroups.jsx, same PR).
--
-- No data changes. UNDO: run the same three statements with ON DELETE CASCADE.

begin;

alter table public.attendance_sessions
  drop constraint attendance_sessions_group_id_fkey,
  add  constraint attendance_sessions_group_id_fkey
       foreign key (group_id) references public.groups(id) on delete restrict;

alter table public.attendance_records
  drop constraint attendance_records_group_id_fkey,
  add  constraint attendance_records_group_id_fkey
       foreign key (group_id) references public.groups(id) on delete restrict;

alter table public.attendance_records
  drop constraint attendance_records_student_id_fkey,
  add  constraint attendance_records_student_id_fkey
       foreign key (student_id) references public.students(id) on delete restrict;

-- Expected: 3 rows, all "ON DELETE RESTRICT"
select conrelid::regclass, conname, pg_get_constraintdef(oid)
from pg_constraint
where conname in ('attendance_sessions_group_id_fkey',
                  'attendance_records_group_id_fkey',
                  'attendance_records_student_id_fkey');

commit;
