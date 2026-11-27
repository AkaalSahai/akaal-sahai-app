-- B1 (health check 27-11-2026): indexes so the database can jump straight to
-- a group's students / a group's teachers / a child's attendance instead of
-- reading the whole table every time. These lookups run inside nearly every
-- security rule, which is why students had 2.19M full-table scans and
-- teacher_groups 5.15M (pg_stat_user_tables, 27-11-2026).
--
-- No data changes. Tables are small (largest 25k rows), so plain CREATE INDEX
-- takes well under a second.
--
-- UNDO:
--   drop index public.students_group_id_idx, public.groups_teacher_id_idx,
--     public.teacher_groups_group_id_idx, public.attendance_records_student_id_idx,
--     public.attendance_records_session_date_idx;

begin;

create index if not exists students_group_id_idx            on public.students (group_id);
create index if not exists groups_teacher_id_idx            on public.groups (teacher_id);
create index if not exists teacher_groups_group_id_idx      on public.teacher_groups (group_id);
create index if not exists attendance_records_student_id_idx on public.attendance_records (student_id);
-- Weekly report / Register Viewer / dashboard all filter by date
create index if not exists attendance_records_session_date_idx on public.attendance_records (session_date);

-- Expected: 5 rows
select indexname from pg_indexes where schemaname = 'public' and indexname in (
  'students_group_id_idx', 'groups_teacher_id_idx', 'teacher_groups_group_id_idx',
  'attendance_records_student_id_idx', 'attendance_records_session_date_idx');

commit;
