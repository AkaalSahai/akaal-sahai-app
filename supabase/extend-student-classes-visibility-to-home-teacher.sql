-- Punjabi and extra-class (Gatka/GCSE Punjabi/Kirtan) teachers are
-- essentially always different people (confirmed against the live data -
-- every single student_classes row has a different teacher on each side).
-- The existing SELECT policy only let a teacher see student_classes rows
-- for groups THEY teach, so a Punjabi teacher could never see that one of
-- their own students is also enrolled in Gatka, taught by someone else -
-- the "also enrolled in X" marker on the student record would show nothing
-- for the realistic case. Adds: a teacher can also see an enrollment row if
-- the enrolled student's own home (Punjabi) group is one they teach.
-- Run in Supabase Dashboard → SQL Editor → New Query

drop policy if exists "sc_select" on public.student_classes;
create policy "sc_select" on public.student_classes for select using (
  user_has_role('admin') or user_has_role('adminView') or user_has_role('registrar')
  or exists (select 1 from groups where groups.id = student_classes.group_id and groups.teacher_id = auth.uid())
  or exists (select 1 from teacher_groups where teacher_groups.group_id = student_classes.group_id and teacher_groups.teacher_id = auth.uid())
  or exists (
    select 1 from students s
    where s.id = student_classes.student_id
      and (
        exists (select 1 from groups g2 where g2.id = s.group_id and g2.teacher_id = auth.uid())
        or exists (select 1 from teacher_groups tg2 where tg2.group_id = s.group_id and tg2.teacher_id = auth.uid())
      )
  )
);
