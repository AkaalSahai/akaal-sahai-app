-- Gatka-only / Kirtan-only Teacher Register access, agreed 05-11-2026.
--
--   * users.register_manager_classes - registers someone may mark without
--     being a full Register Manager, e.g. {gatka}. Set by admins on the Users
--     page (Register Manager column); added to protect_privileged_user_columns()
--     so people can't give it to themselves.
--   * teacher_attendance_class_manager policy - they can read and write marks
--     for those registers only (a Gatka-only person can't touch Punjabi marks).
--
-- Nobody is given access by this script. No existing rows change.
-- Column and policy names checked free.
--
-- Undo:
--   begin;
--   drop policy teacher_attendance_class_manager on teacher_attendance;
--   alter table users drop column register_manager_classes;
--   run gatka-kirtan-teacher-registers.sql's protect_privileged_user_columns() (without the new line)
--   commit;
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

alter table public.users
  add column register_manager_classes text[] not null default '{}';

create or replace function public.protect_privileged_user_columns()
 returns trigger
 language plpgsql
as $function$
begin
  if not user_has_role('admin') then
    new.role := old.role;
    new.extra_roles := old.extra_roles;
    new.can_edit_students := old.can_edit_students;
    new.can_manage_teacher_register := old.can_manage_teacher_register;
    new.mfa_required := old.mfa_required;
    new.register_classes := old.register_classes;
    new.register_manager_classes := old.register_manager_classes;
  end if;
  return new;
end;
$function$;

create policy teacher_attendance_class_manager on public.teacher_attendance
  for all
  using (exists (select 1 from public.users u
                 where u.id = auth.uid() and teacher_attendance.class_type = any (u.register_manager_classes)))
  with check (exists (select 1 from public.users u
                      where u.id = auth.uid() and teacher_attendance.class_type = any (u.register_manager_classes)));

-- Expect: column exists and nobody has it yet; policy exists
select (select count(*) from users where register_manager_classes <> '{}') people_with_access,
       (select count(*) from pg_policies where policyname = 'teacher_attendance_class_manager') policy;

commit;
