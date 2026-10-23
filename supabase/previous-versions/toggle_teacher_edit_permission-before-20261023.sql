-- Version before fix-null-role-checks.sql (23-10-2026). Restore only if needed.
CREATE OR REPLACE FUNCTION public.toggle_teacher_edit_permission(target_user_id uuid, new_value boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
