-- Adds a way for an approved application to remember which group (and
-- therefore which teacher) the applicant was placed into.
--
-- Previously this was only ever recorded on the resulting students/users row
-- — the application record itself never stored it — so an approved
-- application card had no way to show a group or teacher name. Run this once
-- in the Supabase SQL editor before (or right after) deploying the matching
-- app changes.
--
-- Safe to re-run: the ALTERs are no-ops if already applied, and the backfill
-- UPDATEs only touch rows where assigned_group_id is still null.

alter table public.parent_applications
  add column if not exists assigned_group_id uuid references public.groups(id) on delete set null;

alter table public.teacher_applications
  add column if not exists assigned_group_id uuid references public.groups(id) on delete set null;

-- One-time backfill: for applications already approved in the past, try to
-- recover which group they landed in by matching against the students table
-- on name + date of birth. Not guaranteed for the rare case of two students
-- sharing both first+last name and date of birth, but low risk — it only
-- fills in a display field, and only where one wasn't set already.
update public.parent_applications pa
set assigned_group_id = s.group_id
from public.students s
where pa.status = 'approved'
  and pa.assigned_group_id is null
  and s.group_id is not null
  and s.first_name = pa.first_name
  and s.last_name  = pa.last_name
  and s.date_of_birth is not distinct from pa.date_of_birth;

-- Same backfill for teacher applications, matched on email (unique/required,
-- so this one is exact rather than best-effort).
update public.teacher_applications ta
set assigned_group_id = u.group_id
from public.users u
where ta.status = 'approved'
  and ta.assigned_group_id is null
  and u.group_id is not null
  and u.email = ta.email;
