-- B4 (health check 27-11-2026): delete the five spare-copy tables made during
-- the November data fixes. They hold ~250 old phone numbers / personal
-- details that are no longer needed (data protection: don't keep personal
-- data longer than necessary). The fixes they protected have been in use for
-- 3+ weeks with no problems.
--
-- Nothing in the app reads these tables (RLS on, no policies, no grants).
-- Full JSON copies of all five are in the 18-11-2026 backup:
--   ~/Desktop/akaal-sahai-app-backups/akaal-sahai-database-20261118-091417/
--
-- UNDO: recreate from those JSON files if ever needed.

begin;

-- Preview: expected 154, 28, 3, 56, 6 rows
select 'phone_format_fix_backup_20261102' t, count(*) from public.phone_format_fix_backup_20261102
union all select 'mixed_fields_fix_backup_20261102', count(*) from public.mixed_fields_fix_backup_20261102
union all select 'relationship_fix_backup_20261102', count(*) from public.relationship_fix_backup_20261102
union all select 'teacher_phone_copy_backup_20261105', count(*) from public.teacher_phone_copy_backup_20261105
union all select 'extra_roles_tidy_backup_20261105', count(*) from public.extra_roles_tidy_backup_20261105;

drop table public.phone_format_fix_backup_20261102;
drop table public.mixed_fields_fix_backup_20261102;
drop table public.relationship_fix_backup_20261102;
drop table public.teacher_phone_copy_backup_20261105;
drop table public.extra_roles_tidy_backup_20261105;

-- Expected: 0
select count(*) as backup_tables_left from pg_class
where relkind = 'r' and relnamespace = 'public'::regnamespace and relname like '%backup%';

commit;
