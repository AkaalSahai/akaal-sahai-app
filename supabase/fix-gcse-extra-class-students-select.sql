-- Fixes: teachers assigned to an extra class (GCSE Punjabi, Gatka,
-- Kirtan, or any admin-added class type) saw an empty roster in
-- My Register / My Students / My Reports, even after
-- fix-student-classes-teacher-select.sql.
--
-- That earlier fix covered student_classes, but the students table's
-- own SELECT policy (students_select_teacher) was never corrected to
-- match. It only ever checked students.group_id - which is always a
-- student's HOME Punjabi group, never the extra class they're
-- actually enrolled in via student_classes. So it correctly covered a
-- direct Punjabi roster, but for GCSE/Gatka/Kirtan it was asking "does
-- this teacher teach the student's home group" instead of "does this
-- teacher teach the class the student is enrolled in" - the two are
-- different groups entirely for an extra-class student.
--
-- Confirmed as the actual cause (not a data or client-side issue) by
-- simulating a real GCSE Punjabi teacher's exact database permissions
-- and getting 0 rows back even with that student's active flag set
-- and student_classes readable. This adds the missing check via
-- student_classes; simulating the same teacher afterward returned all
-- of their students.

drop policy if exists "students_select_teacher" on students;

create policy "students_select_teacher" on students for select using (
  user_has_role('teacher') and (
    group_id in (select id from groups where teacher_id = auth.uid())
    or exists (
      select 1 from teacher_groups
      where teacher_groups.group_id = students.group_id
      and teacher_groups.teacher_id = auth.uid()
    )
    or exists (
      select 1 from student_classes sc
      join groups g on g.id = sc.group_id
      where sc.student_id = students.id
      and (
        g.teacher_id = auth.uid()
        or exists (
          select 1 from teacher_groups tg
          where tg.group_id = g.id and tg.teacher_id = auth.uid()
        )
      )
    )
  )
);
