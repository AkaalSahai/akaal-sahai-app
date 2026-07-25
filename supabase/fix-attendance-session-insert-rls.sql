-- FIX: Secondary teachers getting RLS error when saving register
-- "new row violates row-level security policy for table attendance_sessions"
-- Run in Supabase Dashboard → SQL Editor → New Query
-- Date: 2026-07-25

-- Step 1: Check existing INSERT/WRITE policy names on attendance_sessions
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'attendance_sessions';

-- Step 2: Drop the old insert/manage policy (update name if Step 1 shows different)
DROP POLICY IF EXISTS "sessions_teacher_insert"  ON attendance_sessions;
DROP POLICY IF EXISTS "sessions_teacher_manage"  ON attendance_sessions;

-- Step 3: New INSERT policy — any teacher assigned to the group can create a session
CREATE POLICY "sessions_teacher_insert" ON attendance_sessions
  FOR INSERT WITH CHECK (
    -- Primary teacher on the group
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = attendance_sessions.group_id
        AND groups.teacher_id = auth.uid()
    )
    OR
    -- Secondary teacher via junction table
    EXISTS (
      SELECT 1 FROM teacher_groups
      WHERE teacher_groups.group_id = attendance_sessions.group_id
        AND teacher_groups.teacher_id = auth.uid()
    )
  );

-- Step 4: Also fix UPDATE policy so secondary teachers can update sessions too
DROP POLICY IF EXISTS "sessions_teacher_manage"  ON attendance_sessions;

CREATE POLICY "sessions_teacher_manage" ON attendance_sessions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = attendance_sessions.group_id
        AND groups.teacher_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM teacher_groups
      WHERE teacher_groups.group_id = attendance_sessions.group_id
        AND teacher_groups.teacher_id = auth.uid()
    )
  );
