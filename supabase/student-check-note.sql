-- "Note to check" on a student (agreed 12-11-2026)
--
-- Why: some records need a person to check something the automatic checks
-- can't spot (a mistyped postcode, a blank relationship, details to
-- re-confirm). Admins/registrars write a short note on the student; it shows
-- as an amber flag to the student's teachers and to admins/registrars.
--
-- What it does:
--   1. students.check_note (text, empty for everyone to start with, max 500).
--   2. protect_student_check_note trigger: only admins and registrars can set
--      or change it. Teachers (who may edit other student details) can't -
--      their change to the note is quietly ignored, and a student a teacher
--      adds starts with no note. Same approach as protect_privileged_user_columns,
--      so the SQL editor (no logged-in user) can't change it either - the
--      notes below are written as an admin.
--   3. Notes on the 5 records found on 02-11-2026 (see below).
--
-- No existing data changes, so no backup needed.
--
-- Undo:
--   drop trigger if exists trg_protect_student_check_note on public.students;
--   drop function if exists public.protect_student_check_note();
--   alter table public.students drop column if exists check_note;

begin;

alter table public.students add column check_note text
  constraint students_check_note_length check (char_length(check_note) <= 500);

-- Name checked free 12-11-2026. NULL-safe: user_has_role is false when logged out.
create function public.protect_student_check_note()
 returns trigger
 language plpgsql
as $function$
begin
  if not (coalesce(user_has_role('admin'), false) or coalesce(user_has_role('registrar'), false)) then
    if tg_op = 'INSERT' then
      new.check_note := null;
    else
      new.check_note := old.check_note;
    end if;
  end if;
  return new;
end;
$function$;

create trigger trg_protect_student_check_note
  before insert or update on public.students
  for each row execute function public.protect_student_check_note();

-- 3. The 5 notes themselves were written separately on 12-11-2026 as an
--    admin (request.jwt.claims set to an admin's id for that transaction),
--    straight into the live database - personal details are kept out of this
--    file. Later notes are written from the Students page.

-- Expected (after the notes): 5 notes, trigger present
select
  (select count(*) from public.students where check_note is not null) as notes,
  (select count(*) from pg_trigger where tgname = 'trg_protect_student_check_note') as trigger_present;

commit;
