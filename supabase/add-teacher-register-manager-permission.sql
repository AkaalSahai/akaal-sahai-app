-- New per-account permission: "Can manage Teacher Register" — lets
-- someone view and mark the Teacher Register (all teachers' own
-- attendance) regardless of their primary role, the same shape as the
-- existing can_edit_students permission.
--
-- Run manually in the Supabase SQL editor against the live project.

alter table public.users
  add column if not exists can_manage_teacher_register boolean not null default false;

-- Grant full access to teacher_attendance for anyone with this flag,
-- on top of the existing admin/registrar policies already there.
drop policy if exists "teacher_attendance_register_manager" on public.teacher_attendance;
create policy "teacher_attendance_register_manager" on public.teacher_attendance for all using (
  exists (select 1 from public.users where users.id = auth.uid() and users.can_manage_teacher_register = true)
) with check (
  exists (select 1 from public.users where users.id = auth.uid() and users.can_manage_teacher_register = true)
);
