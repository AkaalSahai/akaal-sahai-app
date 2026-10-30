-- merge_groups: keep the merged group's primary teacher listed as primary
-- (30-10-2026).
--
-- Before: when the surviving group had no teacher, the source group's
-- primary became its lead (groups.teacher_id) but their teacher_groups row
-- was inserted with the default role 'covering' - so the Groups page showed
-- them as covering. Merged-in teachers also always became covering, even
-- when the surviving group had no primary at all.
--
-- After:
--   * Surviving group already has a primary -> merged-in teachers join as
--     covering (unchanged).
--   * Surviving group has no primary -> merged-in teachers keep their role
--     from the source group (primaries stay primary).
--   * The lead (groups.teacher_id) always has a 'primary' row.
-- Everything else is the live definition as fetched.
--
-- No rows change when this runs (checked: no group currently has a lead
-- without a primary row). Tested inside a rolled-back transaction.
--
-- Undo: run previous-versions/merge_groups-before-20261030.sql
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

create or replace function public.merge_groups(source_group_id uuid, target_group_id uuid)
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
  target_lead_id     uuid;
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

  -- Does the surviving group already have a primary teacher? Checked
  -- before the merge so the source's teachers don't count.
  SELECT coalesce(target_teacher_id,
           (SELECT tg.teacher_id FROM teacher_groups tg
            WHERE tg.group_id = target_group_id AND tg.role = 'primary' LIMIT 1))
  INTO target_lead_id;

  -- Merge co-teachers, skipping anyone who already teaches the target group.
  -- They join as covering if the target already has a primary teacher;
  -- otherwise they keep their role from the source group.
  INSERT INTO teacher_groups (teacher_id, group_id, role)
  SELECT tg.teacher_id, target_group_id,
         CASE WHEN target_lead_id IS NULL THEN tg.role ELSE 'covering' END
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

  -- Carry over the primary teacher if the surviving group didn't have one,
  -- and make sure the lead (groups.teacher_id) is listed as primary.
  target_lead_id := coalesce(target_lead_id, source_teacher_id);
  IF target_lead_id IS NOT NULL THEN
    UPDATE groups SET teacher_id = target_lead_id WHERE id = target_group_id;
    INSERT INTO teacher_groups (teacher_id, group_id, role)
    VALUES (target_lead_id, target_group_id, 'primary')
    ON CONFLICT (teacher_id, group_id) DO UPDATE SET role = 'primary';
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

commit;
