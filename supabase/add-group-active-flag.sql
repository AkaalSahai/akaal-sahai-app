-- Lets admin mark a group "reserved" (inactive) - e.g. an empty group kept
-- around for a future cohort - without it showing up as "hasn't submitted"
-- on register/attendance tracking views, and without being offered as a
-- destination when assigning a student. Defaults every existing group to
-- active so nothing changes until an admin explicitly deactivates one.
-- Run in Supabase Dashboard → SQL Editor → New Query

alter table public.groups add column if not exists active boolean not null default true;
