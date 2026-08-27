-- Let registrar (and admin) toggle a teacher's "can_edit_students" flag,
-- without granting registrar any other write access to the users table.
--
-- This is a narrow, single-purpose function: it only ever flips
-- can_edit_students, only for a user who is actually a teacher (primary
-- role or extra_roles), and only for callers who are admin or registrar.
-- SECURITY DEFINER lets it bypass RLS for this one specific write, so no
-- broader UPDATE policy on `users` needs to be added for registrar.
--
-- Run manually in the Supabase SQL editor (or via CLI) against the live project.

CREATE OR REPLACE FUNCTION toggle_teacher_edit_permission(target_user_id uuid, new_value boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_role        text;
  target_extra_roles text[];
BEGIN
  IF current_user_role() NOT IN ('admin', 'registrar') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT role, extra_roles INTO target_role, target_extra_roles
  FROM users WHERE id = target_user_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF target_role != 'teacher'
     AND NOT ('teacher' = ANY(COALESCE(target_extra_roles, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'Target user is not a teacher';
  END IF;

  UPDATE users SET can_edit_students = new_value WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_teacher_edit_permission(uuid, boolean) TO authenticated;
