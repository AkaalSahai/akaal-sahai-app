-- Allow registrar to enrol/unenrol students in extra classes (Gatka, Kirtan, etc.)
-- sc_select already includes registrar (see multi-class-support.sql); only the
-- write policies (sc_insert/sc_delete) need widening to match.
-- Run manually in the Supabase SQL editor (or via CLI) against the live project.

DROP POLICY IF EXISTS "sc_insert" ON student_classes;
CREATE POLICY "sc_insert" ON student_classes FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin', 'registrar'));

DROP POLICY IF EXISTS "sc_delete" ON student_classes;
CREATE POLICY "sc_delete" ON student_classes FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin', 'registrar'));
