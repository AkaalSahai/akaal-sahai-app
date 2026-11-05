-- One-time, agreed 05-11-2026: give staff accounts the phone number from
-- their teacher application, so it shows on the Teachers page (Details) and
-- can be kept up to date there with Edit.
--
--   * Only fills accounts with NO phone (all 59 were blank on 05-11-2026) -
--     never overwrites a number someone has typed in.
--   * Only from the person's own application (teacher_applications.auth_user_id
--     = users.id); 56 of 59 staff have one, all already +44 format.
--   * The application keeps its copy - nothing is removed.
--
-- Backup: teacher_phone_copy_backup_20261105 (user id + phone before, all
-- blank). RLS on with no policies so the app can't read it.
-- Drop once happy: drop table teacher_phone_copy_backup_20261105;
--
-- Undo:
--   update users u set phone = b.phone
--   from teacher_phone_copy_backup_20261105 b where b.id = u.id;
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

create table teacher_phone_copy_backup_20261105 as
select u.id, u.phone, now() as backed_up_at
from users u
join teacher_applications a on a.auth_user_id = u.id
where coalesce(trim(u.phone), '') = ''
  and coalesce(trim(a.phone), '') <> '';

alter table teacher_phone_copy_backup_20261105 enable row level security;
revoke all on teacher_phone_copy_backup_20261105 from anon, authenticated;

update users u
set phone = a.phone
from teacher_phone_copy_backup_20261105 b, teacher_applications a
where b.id = u.id and a.auth_user_id = u.id;

insert into audit_logs (user_id, user_name, action, detail, success)
select null, 'Admin (database fix)', 'Copied staff phone numbers from applications',
       format('%s staff accounts given the phone number from their teacher application (only blank ones). Backup: teacher_phone_copy_backup_20261105', count(*)),
       true
from teacher_phone_copy_backup_20261105;

-- Expect: 56 copied, 56 matching their application, 3 staff still without a phone
select (select count(*) from teacher_phone_copy_backup_20261105) copied,
       (select count(*) from users u join teacher_applications a on a.auth_user_id = u.id
         where u.phone = a.phone) matching_application,
       (select count(*) from users where coalesce(trim(phone), '') = '') still_blank;

commit;
