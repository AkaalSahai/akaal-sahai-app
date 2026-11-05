-- Live definition of protect_privileged_user_columns() before gatka-kirtan-teacher-registers.sql (05-11-2026).
-- Run this to undo that change to the function.

CREATE OR REPLACE FUNCTION public.protect_privileged_user_columns()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if not user_has_role('admin') then
    new.role := old.role;
    new.extra_roles := old.extra_roles;
    new.can_edit_students := old.can_edit_students;
    new.can_manage_teacher_register := old.can_manage_teacher_register;
    new.mfa_required := old.mfa_required;
  end if;
  return new;
end;
$function$;
