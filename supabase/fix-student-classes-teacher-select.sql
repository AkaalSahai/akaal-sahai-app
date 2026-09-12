-- The read policy on student_classes has been living directly in the
-- database (not tracked in any committed migration - referenced in
-- fix-registrar-classes-rls.sql as "sc_select already includes registrar",
-- but its actual definition was never committed here) since before this
-- project started tracking every RLS change.
--
-- It's being replaced with an explicit, known-correct definition rather
-- than guessed at, because it was missing the teacher case entirely: a
-- teacher assigned to an extra class (Gatka, Kirtan, or any newly
-- admin-added class type) had no way to read student_classes at all - so
-- "My Register", "My Students", and "My Reports" showed an empty roster
-- for that group even after the app itself is fixed to actually query
-- this table for non-Punjabi groups.
--
-- Run manually in the Supabase SQL editor against the live project.

DROP POLICY IF EXISTS "sc_select" ON student_classes;
CREATE POLICY "sc_select" ON student_classes FOR SELECT USING (
  user_has_role('admin') OR user_has_role('adminView') OR user_has_role('registrar')
  OR EXISTS (
    SELECT 1 FROM groups
    WHERE groups.id = student_classes.group_id
      AND groups.teacher_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM teacher_groups
    WHERE teacher_groups.group_id = student_classes.group_id
      AND teacher_groups.teacher_id = auth.uid()
  )
);
