-- REMOVED 23-10-2026 by supabase/remove-unused-auto-submit-registers.sql.
-- Original July auto-submit: created a register for every group and marked
-- every student without a mark as Absent. Last run 08-08-2026; no cron job,
-- trigger, function, view or app code used it since. Kept here only so it can
-- be restored if ever needed - do NOT run as part of normal setup.

CREATE OR REPLACE FUNCTION public.auto_submit_registers()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  today    date := current_date;
  grp      record;
  sess_id  uuid;
  stud     record;
BEGIN
  -- Loop over every group
  FOR grp IN SELECT id FROM groups LOOP

    -- Find existing session for today, or create one
    SELECT id INTO sess_id
    FROM attendance_sessions
    WHERE group_id = grp.id
      AND session_date = today;

    IF sess_id IS NULL THEN
      INSERT INTO attendance_sessions (group_id, session_date)
        -- teacher_id intentionally NULL — marks as auto-submitted
      VALUES (grp.id, today)
      RETURNING id INTO sess_id;
    END IF;

    -- Mark every active student without a record as absent
    FOR stud IN
      SELECT s.id
      FROM students s
      WHERE s.group_id = grp.id
        AND s.active = true
        AND NOT EXISTS (
          SELECT 1
          FROM attendance_records ar
          WHERE ar.session_id = sess_id
            AND ar.student_id = s.id
        )
    LOOP
      INSERT INTO attendance_records
        (session_id, student_id, group_id, session_date, status)
      VALUES
        (sess_id, stud.id, grp.id, today, 'absent');
    END LOOP;

  END LOOP;
END;
$function$
;
