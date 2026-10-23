-- Version before fix-null-role-checks.sql (23-10-2026). Restore only if needed.
CREATE OR REPLACE FUNCTION public.get_dashboard_attendance_stats(from_date text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user_role() NOT IN ('admin', 'adminView') THEN
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
$function$
;
