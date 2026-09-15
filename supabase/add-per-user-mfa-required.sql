-- Per-person "Require 2FA" toggle, alongside the existing global one in
-- Admin > Settings. The global toggle applies to every admin/registrar at
-- once; this is the scalpel for requiring (or exempting) one specific
-- account, of any role - including teachers, which the global toggle
-- never touches.
--
-- Run manually in the Supabase SQL editor against the live project.

alter table public.users
  add column if not exists mfa_required boolean not null default false;

-- Extends the trigger from fix-critical-user-role-self-escalation.sql
-- (2026-09-15) to also protect mfa_required. Without this, someone
-- required to use 2FA could simply turn the requirement off for
-- themselves via a direct API call - update users set mfa_required =
-- false where id = auth.uid() - defeating the entire point. Only an
-- admin (via the separate users_update_admin policy) can actually change
-- it, for any account including their own.
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
    new.mfa_required := old.mfa_required;
  end if;
  return new;
end;
$$;
