-- Security audit follow-ups (2026-09-15). Three separate, independent
-- fixes - safe to run together. The CRITICAL users.role self-escalation
-- fix should already have been run separately before this one.
--
-- Run manually in the Supabase SQL editor against the live project.

-- 1. HIGH: can_edit_students was never enforced by RLS - only hidden in
--    the UI. Any teacher could add/edit students in their own group via a
--    direct API call regardless of whether admin granted them that
--    permission. Both policies now also require the flag to be true.
drop policy if exists "students_teacher_update" on students;
create policy "students_teacher_update" on students for update using (
  user_has_role('teacher')
  and exists (select 1 from users where users.id = auth.uid() and users.can_edit_students = true)
  and group_id in (
    select groups.id from groups where groups.teacher_id = auth.uid()
    union
    select teacher_groups.group_id from teacher_groups where teacher_groups.teacher_id = auth.uid()
  )
);

drop policy if exists "students_teacher_insert" on students;
create policy "students_teacher_insert" on students for insert with check (
  user_has_role('teacher')
  and exists (select 1 from users where users.id = auth.uid() and users.can_edit_students = true)
  and group_id in (
    select groups.id from groups where groups.teacher_id = auth.uid()
    union
    select teacher_groups.group_id from teacher_groups where teacher_groups.teacher_id = auth.uid()
  )
);

-- 2. MEDIUM: a teacher could reassign their own progress note onto a
--    student outside their group (the update policy checked note
--    ownership, not which student the note points at).
drop policy if exists "student_notes_teacher_update" on student_notes;
create policy "student_notes_teacher_update" on student_notes for update
using (current_user_role() = 'teacher' and teacher_id = auth.uid())
with check (
  current_user_role() = 'teacher' and teacher_id = auth.uid()
  and student_id in (
    select st.id from students st where st.group_id in (
      select groups.id from groups where groups.teacher_id = auth.uid()
      union
      select teacher_groups.group_id from teacher_groups where teacher_groups.teacher_id = auth.uid()
    )
  )
);

-- 3. MEDIUM: the public application forms could accept a forged status
--    (e.g. an already-"approved"-looking application) via a direct API
--    call, bypassing the form. The app itself always sends 'pending' -
--    this just makes that the only value the database will accept.
drop policy if exists "parent_apps_insert" on parent_applications;
create policy "parent_apps_insert" on parent_applications for insert with check (status = 'pending');

drop policy if exists "teacher_apps_insert" on teacher_applications;
create policy "teacher_apps_insert" on teacher_applications for insert with check (status = 'pending');
