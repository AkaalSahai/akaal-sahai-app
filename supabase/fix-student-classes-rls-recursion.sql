-- URGENT FIX: extend-student-classes-visibility-to-home-teacher.sql introduced
-- infinite recursion. students_select_teacher (on the students table) already
-- checks student_classes to see if a teacher can view a student via an extra
-- class they teach; the new student_classes policy then checked back into
-- students to see if the teacher owns that student's home group. Each table's
-- RLS now depends on evaluating the other's RLS, which Postgres cannot
-- resolve - confirmed directly: "infinite recursion detected in policy for
-- relation students" when simulating the query as an affected teacher. This
-- broke student roster loading for teachers generally, not just the specific
-- covering-teacher case being fixed.
--
-- Fix: move the students-table check into a SECURITY DEFINER function. A
-- SECURITY DEFINER function's internal queries run under the function
-- owner's privileges, not the calling role's RLS context, so calling it from
-- student_classes' policy no longer re-enters students' own RLS evaluation -
-- breaking the cycle. (current_user_role()/user_has_role() already use this
-- same pattern for exactly this reason.)
-- Run in Supabase Dashboard → SQL Editor → New Query

create or replace function public.teacher_teaches_students_home_group(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from students s
    where s.id = p_student_id
      and (
        exists (select 1 from groups g2 where g2.id = s.group_id and g2.teacher_id = auth.uid())
        or exists (select 1 from teacher_groups tg2 where tg2.group_id = s.group_id and tg2.teacher_id = auth.uid())
      )
  )
$$;

drop policy if exists "sc_select" on public.student_classes;
create policy "sc_select" on public.student_classes for select using (
  user_has_role('admin') or user_has_role('adminView') or user_has_role('registrar')
  or exists (select 1 from groups where groups.id = student_classes.group_id and groups.teacher_id = auth.uid())
  or exists (select 1 from teacher_groups where teacher_groups.group_id = student_classes.group_id and teacher_groups.teacher_id = auth.uid())
  or public.teacher_teaches_students_home_group(student_classes.student_id)
);
