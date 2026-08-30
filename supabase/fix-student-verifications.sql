-- Teacher "sign-off" that a student's details are correct.
--
-- Append-only history (same pattern as audit_logs) - each row is one
-- verification event by one teacher for one student, with a snapshot
-- of the fields they confirmed, so a later edit can be detected as
-- invalidating that sign-off.
--
-- Run manually in the Supabase SQL editor (or via CLI) against the live project.

CREATE TABLE IF NOT EXISTS student_verifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  verified_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_by_name  text NOT NULL,
  verified_at       timestamptz NOT NULL DEFAULT now(),
  snapshot          jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS student_verifications_student_id_idx  ON student_verifications (student_id);
CREATE INDEX IF NOT EXISTS student_verifications_verified_at_idx ON student_verifications (verified_at DESC);

ALTER TABLE student_verifications ENABLE ROW LEVEL SECURITY;

-- Read: admin/adminView/registrar see all; teacher sees only their own
-- students' verifications (primary teacher_id OR co-teacher via
-- teacher_groups - written this way from the start, matching the fix
-- already applied to attendance_sessions/attendance_records this session).
CREATE POLICY "verifications_select" ON student_verifications FOR SELECT USING (
  user_has_role('admin') OR user_has_role('adminView') OR user_has_role('registrar')
  OR (
    user_has_role('teacher') AND student_id IN (
      SELECT id FROM students WHERE group_id IN (
        SELECT id FROM groups WHERE teacher_id = auth.uid()
        UNION
        SELECT group_id FROM teacher_groups WHERE teacher_id = auth.uid()
      )
    )
  )
);

-- Insert: a teacher can only verify their own students, and only ever
-- as themselves (auth.uid() = verified_by prevents claiming to be a
-- different teacher - same forgery fix applied to audit_logs earlier).
CREATE POLICY "verifications_teacher_insert" ON student_verifications FOR INSERT WITH CHECK (
  auth.uid() = verified_by
  AND user_has_role('teacher')
  AND student_id IN (
    SELECT id FROM students WHERE group_id IN (
      SELECT id FROM groups WHERE teacher_id = auth.uid()
      UNION
      SELECT group_id FROM teacher_groups WHERE teacher_id = auth.uid()
    )
  )
);

-- Admin can insert/manage too (e.g. verifying on a teacher's behalf).
CREATE POLICY "verifications_admin_manage" ON student_verifications FOR ALL USING (
  user_has_role('admin')
);

-- No UPDATE/DELETE policy for teacher - append-only, matches audit_logs.

-- Admin override mechanism: reuses the existing site_settings table (same
-- one the broadcast-message feature already uses). Setting
-- verification_required_since to "now" invalidates every existing
-- sign-off immediately, regardless of the normal per-term expiry -
-- for cases like requiring a fresh check before an event.
INSERT INTO site_settings (key, value) VALUES
  ('verification_required_since', ''),
  ('verification_required_reason', '')
ON CONFLICT (key) DO NOTHING;
