-- Remove 30 duplicate marks saved into the wrong group's register, and stop
-- it happening again. Approved 23-10-2026.
--
-- On 15-08 (Ransingah Group students inside Sikhi Group's register) and 10-10
-- (Mata Sahib Kaur Ji Group students inside Bhai Himmat Singh Ji's register)
-- a whole group's marks were saved into another group's register - most
-- likely the register screen still holding the previous group's register
-- after a quick group switch (fixed in TeacherRegister.jsx). Every one of
-- those 30 students is ALSO marked in their own group's register with the
-- same status, so these copies are pure duplicates: deleting them loses
-- nothing, and stops those 30 student-days being counted twice.
--
-- The guard below deletes a misplaced mark only if that identical mark exists
-- in the student's own-group register for the same day.
--
-- From now on, check_mark_matches_register() refuses any mark whose group
-- differs from its register's group. Every legitimate path already matches:
-- the register screen, the admin attendance editor, merge_groups (moves
-- registers before marks), the GCSE copy rule and the 21:30 auto-absent.
--
-- Undo for the delete: rows backed up before running (scratchpad JSON).
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

delete from public.attendance_records r
using public.attendance_sessions s
where s.id = r.session_id
  and r.group_id <> s.group_id
  and exists (
    select 1
    from public.attendance_sessions own
    join public.attendance_records twin on twin.session_id = own.id
    where own.group_id = r.group_id
      and own.session_date = r.session_date
      and twin.student_id = r.student_id
      and twin.status = r.status
  );

create or replace function public.check_mark_matches_register()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.group_id is distinct from (select s.group_id from attendance_sessions s where s.id = NEW.session_id) then
    raise exception 'This mark belongs to a different group''s register - please reload the register and try again'
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

create trigger trg_check_mark_matches_register
  before insert or update of session_id, group_id on public.attendance_records
  for each row execute function public.check_mark_matches_register();

-- Expected: 0 | 16878
select
  (select count(*) from public.attendance_records r join public.attendance_sessions s on s.id = r.session_id
    where r.group_id <> s.group_id) as misplaced_left,
  (select count(*) from public.attendance_records) as student_marks;

commit;
