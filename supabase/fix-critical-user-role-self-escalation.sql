-- CRITICAL: users_update_own has no WITH CHECK, so Postgres defaults to
-- reusing its USING clause for both - which only restricts WHICH ROW can
-- be updated (your own), not which columns or values. Any authenticated
-- user can currently run:
--   update users set role = 'admin' where id = auth.uid()
-- and RLS allows it, since they ARE updating their own row.
--
-- This adds a trigger that silently reverts any attempt by a non-admin to
-- change their own role, extra_roles, or permission flags, regardless of
-- what a client sends - only users_update_admin (a separate policy,
-- unaffected by this) can actually change these columns for any account,
-- including their own. Editing your own name/phone/etc is untouched.
--
-- Run manually in the Supabase SQL editor against the live project, as
-- soon as you're able to - this is the most urgent fix from the
-- 2026-09-15 security audit.

create or replace function protect_privileged_user_columns()
returns trigger
language plpgsql
as $$
begin
  if not user_has_role('admin') then
    new.role := old.role;
    new.extra_roles := old.extra_roles;
    new.can_edit_students := old.can_edit_students;
    new.can_manage_teacher_register := old.can_manage_teacher_register;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_privileged_user_columns on users;
create trigger protect_privileged_user_columns
before update on users
for each row execute function protect_privileged_user_columns();
