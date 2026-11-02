-- One-time, approved 02-11-2026: tidy the FORMAT of UK phone numbers on
-- students (current and archived, main and second phone) - the same fix as
-- the admin "Fix these phone numbers" button, which only covered current
-- students' main phone. The number itself never changes:
--   7488388593 -> +447488388593, 447448015xxx -> +447448015xxx,
--   "+44 07944..." -> +447944...
-- Uses normalize_uk_phone() (phone-format-insensitive-verification.sql),
-- which mirrors normalizeUkPhone() in src/lib/studentChecks.js.
--
-- Left alone: numbers already in an accepted format (+44XXXXXXXXXX or
-- 0XXXXXXXXXX), words in the phone box ("Mother"), and anything that isn't
-- clearly a UK number - those need a person to check.
--
-- Teachers' verifications are unaffected: same_uk_phone() treats the old
-- and new formats as the same number.
--
-- Backup: phone_format_fix_backup_20261102 (student id + old phone and
-- second phone), RLS on with no policies so the app can't read it. Drop it
-- once happy: drop table phone_format_fix_backup_20261102;
--
-- Expected (preview 02-11-2026): 125 main phones (110 current, 15
-- archived), 29 second phones (27 current, 2 archived).
--
-- Undo:
--   update students s set phone = b.phone, secondary_phone = b.secondary_phone
--   from phone_format_fix_backup_20261102 b where b.id = s.id;
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

create table phone_format_fix_backup_20261102 as
select id, phone, secondary_phone, now() as backed_up_at
from students
where (phone !~* '[a-z]{2}'
       and regexp_replace(phone, '\s', '', 'g') !~ '^(\+44|0)[1-9][0-9]{9}$'
       and normalize_uk_phone(phone) is not null)
   or (secondary_phone !~* '[a-z]{2}'
       and regexp_replace(secondary_phone, '\s', '', 'g') !~ '^(\+44|0)[1-9][0-9]{9}$'
       and normalize_uk_phone(secondary_phone) is not null);

alter table phone_format_fix_backup_20261102 enable row level security;
revoke all on phone_format_fix_backup_20261102 from anon, authenticated;

update students s
set phone = case
      when s.phone !~* '[a-z]{2}'
       and regexp_replace(s.phone, '\s', '', 'g') !~ '^(\+44|0)[1-9][0-9]{9}$'
       and normalize_uk_phone(s.phone) is not null
      then normalize_uk_phone(s.phone) else s.phone end,
    secondary_phone = case
      when s.secondary_phone !~* '[a-z]{2}'
       and regexp_replace(s.secondary_phone, '\s', '', 'g') !~ '^(\+44|0)[1-9][0-9]{9}$'
       and normalize_uk_phone(s.secondary_phone) is not null
      then normalize_uk_phone(s.secondary_phone) else s.secondary_phone end
from phone_format_fix_backup_20261102 b
where b.id = s.id;

insert into audit_logs (user_id, user_name, action, detail, success)
select null, 'Admin (database fix)', 'Fixed phone number formats',
       format('%s main and %s second phone numbers (current and archived students) - format only, e.g. 7700900123 → +447700900123. Backup: phone_format_fix_backup_20261102',
              count(*) filter (where b.phone is distinct from s.phone),
              count(*) filter (where b.secondary_phone is distinct from s.secondary_phone)),
       true
from phone_format_fix_backup_20261102 b join students s on s.id = b.id;

-- Expect: main 125 (110 current), second 29 (27 current); every changed
-- number still the same number; nothing left to fix
select count(*) filter (where b.phone is distinct from s.phone) main_changed,
       count(*) filter (where b.phone is distinct from s.phone and s.active) main_current,
       count(*) filter (where b.secondary_phone is distinct from s.secondary_phone) second_changed,
       count(*) filter (where b.secondary_phone is distinct from s.secondary_phone and s.active) second_current,
       count(*) filter (where not same_uk_phone(b.phone, s.phone)
                           or not same_uk_phone(b.secondary_phone, s.secondary_phone)) number_changed,
       (select count(*) from students x
         where (x.phone !~* '[a-z]{2}' and regexp_replace(x.phone, '\s', '', 'g') !~ '^(\+44|0)[1-9][0-9]{9}$' and normalize_uk_phone(x.phone) is not null)
            or (x.secondary_phone !~* '[a-z]{2}' and regexp_replace(x.secondary_phone, '\s', '', 'g') !~ '^(\+44|0)[1-9][0-9]{9}$' and normalize_uk_phone(x.secondary_phone) is not null)) still_fixable
from phone_format_fix_backup_20261102 b join students s on s.id = b.id;

commit;
