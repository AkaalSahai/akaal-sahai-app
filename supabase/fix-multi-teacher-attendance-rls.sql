-- FIX: Co-teacher unable to view register submitted by other teacher in same group
-- Run in Supabase Dashboard → SQL Editor → New Query
-- Date: 2026-07-21

-- Fix attendance_records
DROP POLICY IF EXISTS "records_teacher_read" ON attendance_records;
DROP POLICY IF EXISTS "teachers_read_group_records" ON attendance_records;

CREATE POLICY "records_teacher_read" ON attendance_records
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM attendance_sessions s
      WHERE s.id = attendance_records.session_id
        AND (
          s.teacher_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM groups
            WHERE groups.id = s.group_id
              AND groups.teacher_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM teacher_groups
            WHERE teacher_groups.group_id = s.group_id
              AND teacher_groups.teacher_id = auth.uid()
          )
        )
    )
  );

-- Fix attendance_sessions
DROP POLICY IF EXISTS "sessions_teacher_read" ON attendance_sessions;
DROP POLICY IF EXISTS "teachers_read_group_sessions" ON attendance_sessions;

CREATE POLICY "sessions_teacher_read" ON attendance_sessions
  FOR SELECT USING (
    teacher_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = attendance_sessions.group_id
        AND groups.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM teacher_groups
      WHERE teacher_groups.group_id = attendance_sessions.group_id
        AND teacher_groups.teacher_id = auth.uid()
    )
  );
