-- One-time tidy of users.extra_roles (reported 05-11-2026: roles shown twice).
--   * Removes an extra role that is the same as the person's main role
--     (e.g. role registrar + extra registrar) - left behind when the main
--     role was changed.
--   * Removes 'teacherAdmin' - an old role nothing uses any more (no
--     policy, function or app code checks it; checked 05-11-2026).
--   * Removes repeats.
-- Nobody gains or loses access: hasRole() already counted the main role.
--
-- extra_roles is protected by protect_privileged_user_columns (reverts
-- changes not made by an admin login), so it is switched off for this
-- one update only, inside the transaction.
--
-- Backup: extra_roles_tidy_backup_20261105 (id, extra_roles before).
-- Undo:
--   alter table users disable trigger protect_privileged_user_columns;
--   update users u set extra_roles = b.extra_roles from extra_roles_tidy_backup_20261105 b where b.id = u.id;
--   alter table users enable trigger protect_privileged_user_columns;
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

create table extra_roles_tidy_backup_20261105 as
select id, extra_roles, now() as backed_up_at
from users
where role = any(extra_roles)
   or 'teacherAdmin' = any(extra_roles)
   or array_length(extra_roles, 1) <> (select count(distinct x) from unnest(extra_roles) x);

alter table extra_roles_tidy_backup_20261105 enable row level security;
revoke all on extra_roles_tidy_backup_20261105 from anon, authenticated;

alter table users disable trigger protect_privileged_user_columns;

update users u
set extra_roles = coalesce((
      select array_agg(r order by first_pos)
      from (select r, min(pos) first_pos
            from unnest(u.extra_roles) with ordinality t(r, pos)
            where r <> u.role and r <> 'teacherAdmin'
            group by r) x), '{}')
from extra_roles_tidy_backup_20261105 b
where b.id = u.id;

alter table users enable trigger protect_privileged_user_columns;

insert into audit_logs (user_id, user_name, action, detail, success)
select null, 'Admin (database fix)', 'Tidied extra roles',
       format('%s staff: removed extra roles repeating their main role and the unused teacherAdmin role. No access change. Backup: extra_roles_tidy_backup_20261105', count(*)),
       true
from extra_roles_tidy_backup_20261105;

-- Expect: 6 changed; nothing left to tidy; trigger back on
select u.name, u.role, b.extra_roles before, u.extra_roles after
from extra_roles_tidy_backup_20261105 b join users u on u.id = b.id order by u.name;
select (select count(*) from users where role = any(extra_roles) or 'teacherAdmin' = any(extra_roles)) left_to_tidy,
       (select tgenabled from pg_trigger where tgname = 'protect_privileged_user_columns') trigger_enabled;

commit;
