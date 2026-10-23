-- Close a gap in three "admins only" checks. Approved 23-10-2026.
--
-- They tested e.g. `current_user_role() != 'admin'`. For a caller who isn't
-- logged in, current_user_role() is NULL, `NULL != 'admin'` is NULL (not
-- true), so the refusal was skipped - a logged-out caller with the public key
-- and a group/user id could merge groups, toggle a teacher's edit permission,
-- or read dashboard attendance counts. Now NULL counts as "not allowed":
-- coalesce(current_user_role(), ''). Who IS allowed is unchanged.
--
-- Also:
--   * logged-out callers can no longer run merge_groups,
--     toggle_teacher_edit_permission, get_dashboard_attendance_stats,
--     get_projector_dashboard_stats or current_user_group (none are used
--     before login). user_has_role / current_user_role /
--     teacher_teaches_students_home_group stay callable: access rules use
--     them, including for the public sign-up form.
--   * fixed search_path on four older helpers (all already fully qualify
--     their tables, so behaviour is unchanged).
-- Previous versions: supabase/previous-versions/*-before-20261023.sql
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

CREATE OR REPLACE FUNCTION public.merge_groups(source_group_id uuid, target_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  source_type        text;
  target_type        text;
  source_name        text;
  target_name        text;
  source_teacher_id  uuid;
  target_teacher_id  uuid;
  conflict_dates      text;
  student_count       int;
  session_count       int;
  teacher_count       int;
  class_count         int;
BEGIN
  IF coalesce(current_user_role(), '') <> 'admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF source_group_id = target_group_id THEN
    RAISE EXCEPTION 'Cannot merge a group with itself';
  END IF;

  SELECT class_type, name, teacher_id INTO source_type, source_name, source_teacher_id
  FROM groups WHERE id = source_group_id;
  SELECT class_type, name, teacher_id INTO target_type, target_name, target_teacher_id
  FROM groups WHERE id = target_group_id;

  IF source_name IS NULL THEN RAISE EXCEPTION 'Source group not found'; END IF;
  IF target_name IS NULL THEN RAISE EXCEPTION 'Target group not found'; END IF;

  IF COALESCE(source_type, 'punjabi') != COALESCE(target_type, 'punjabi') THEN
    RAISE EXCEPTION 'Cannot merge groups of different class types (% vs %)', source_type, target_type;
  END IF;

  SELECT string_agg(to_char(s.session_date, 'YYYY-MM-DD'), ', ')
  INTO conflict_dates
  FROM attendance_sessions s
  WHERE s.group_id = source_group_id
    AND EXISTS (
      SELECT 1 FROM attendance_sessions t
      WHERE t.group_id = target_group_id AND t.session_date = s.session_date
    );

  IF conflict_dates IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot merge: both groups have attendance sessions on: %', conflict_dates;
  END IF;

  SELECT count(*) INTO student_count FROM students WHERE group_id = source_group_id;
  SELECT count(*) INTO session_count FROM attendance_sessions WHERE group_id = source_group_id;
  SELECT count(*) INTO teacher_count FROM teacher_groups tg
    WHERE tg.group_id = source_group_id
      AND NOT EXISTS (
        SELECT 1 FROM teacher_groups tg2
        WHERE tg2.teacher_id = tg.teacher_id AND tg2.group_id = target_group_id
      );
  SELECT count(*) INTO class_count FROM student_classes WHERE group_id = source_group_id;

  -- Re-point attendance history (records are kept in lockstep with sessions)
  UPDATE attendance_sessions SET group_id = target_group_id WHERE group_id = source_group_id;
  UPDATE attendance_records SET group_id = target_group_id WHERE group_id = source_group_id;

  -- Re-point students - active AND archived, so history stays intact
  UPDATE students SET group_id = target_group_id WHERE group_id = source_group_id;

  -- Re-point legacy teacher primary group_id
  UPDATE users SET group_id = target_group_id WHERE group_id = source_group_id;

  -- Merge co-teachers, skipping anyone who already teaches the target group
  INSERT INTO teacher_groups (teacher_id, group_id)
  SELECT tg.teacher_id, target_group_id
  FROM teacher_groups tg
  WHERE tg.group_id = source_group_id
    AND NOT EXISTS (
      SELECT 1 FROM teacher_groups tg2
      WHERE tg2.teacher_id = tg.teacher_id AND tg2.group_id = target_group_id
    );
  DELETE FROM teacher_groups WHERE group_id = source_group_id;

  -- Merge class enrollments, skipping duplicates (student already enrolled in target)
  INSERT INTO student_classes (student_id, group_id)
  SELECT sc.student_id, target_group_id FROM student_classes sc
  WHERE sc.group_id = source_group_id
  ON CONFLICT (student_id, group_id) DO NOTHING;
  DELETE FROM student_classes WHERE group_id = source_group_id;

  -- Re-point any transfer requests (past or pending) referencing the source group
  UPDATE transfer_requests SET from_group_id = target_group_id, from_group_name = target_name
    WHERE from_group_id = source_group_id;
  UPDATE transfer_requests SET to_group_id = target_group_id
    WHERE to_group_id = source_group_id;
  UPDATE transfer_requests SET requested_to_group_id = target_group_id, requested_to_group_name = target_name
    WHERE requested_to_group_id = source_group_id;

  -- Carry over the primary teacher if the surviving group didn't have one
  IF target_teacher_id IS NULL AND source_teacher_id IS NOT NULL THEN
    UPDATE groups SET teacher_id = source_teacher_id WHERE id = target_group_id;
  END IF;

  DELETE FROM groups WHERE id = source_group_id;

  RETURN jsonb_build_object(
    'source_name', source_name,
    'target_name', target_name,
    'students_moved', student_count,
    'sessions_moved', session_count,
    'teachers_merged', teacher_count,
    'class_enrollments_moved', class_count
  );
END;
$function$;

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
  IF coalesce(current_user_role(), '') NOT IN ('admin', 'registrar') THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_attendance_stats(from_date text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(current_user_role(), '') NOT IN ('admin', 'adminView') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN (
    SELECT json_build_object(
      'groupAtt', (
        SELECT COALESCE(
          json_object_agg(group_id::text, json_build_object('total', total, 'attended', attended)),
          '{}'::json
        )
        FROM (
          SELECT group_id,
            COUNT(*) FILTER (WHERE status != 'holiday') AS total,
            COUNT(*) FILTER (WHERE status IN ('present', 'late')) AS attended
          FROM attendance_records
          WHERE session_date >= from_date::date
          GROUP BY group_id
        ) g
      ),
      'studentAtt', (
        SELECT COALESCE(
          json_object_agg(student_id::text, json_build_object('total', total, 'attended', attended)),
          '{}'::json
        )
        FROM (
          SELECT student_id,
            COUNT(*) FILTER (WHERE status != 'holiday') AS total,
            COUNT(*) FILTER (WHERE status IN ('present', 'late')) AS attended
          FROM attendance_records
          WHERE session_date >= from_date::date
          GROUP BY student_id
        ) s
      )
    )
  );
END;
$function$;

-- Logged-out callers: no access to functions only used after login.
-- (Revoke from PUBLIC too, then grant back to logged-in users explicitly.)
revoke execute on function public.merge_groups(uuid, uuid)                   from public, anon;
revoke execute on function public.toggle_teacher_edit_permission(uuid, boolean) from public, anon;
revoke execute on function public.get_dashboard_attendance_stats(text)      from public, anon;
revoke execute on function public.get_projector_dashboard_stats()           from public, anon;
revoke execute on function public.current_user_group()                      from public, anon;
grant  execute on function public.merge_groups(uuid, uuid)                   to authenticated;
grant  execute on function public.toggle_teacher_edit_permission(uuid, boolean) to authenticated;
grant  execute on function public.get_dashboard_attendance_stats(text)      to authenticated;
grant  execute on function public.get_projector_dashboard_stats()           to authenticated;
grant  execute on function public.current_user_group()                      to authenticated;

-- Fixed search_path on older helpers (behaviour unchanged)
alter function public.current_user_role()  set search_path = public;
alter function public.user_has_role(text)  set search_path = public;
alter function public.current_user_group() set search_path = public;
alter function public.handle_new_user()    set search_path = public;

commit;
