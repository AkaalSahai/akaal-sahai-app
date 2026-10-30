-- "Does your child have any medical conditions or allergies?" Yes/No.
-- Approved 30-10-2026.
--
-- has_medical_condition on students and parent_applications:
--   true  = parent answered Yes (details in medical_notes)
--   false = parent answered No - kept as a record that they were asked
--   null  = not recorded (older records)
-- Sign-up approval copies the application's answer onto the student.
--
-- Existing active and inactive students are filled in from their notes:
--   "no", "none", "non", "nil", "n/a", "no allergies"... -> false (notes kept)
--   any other non-empty note                            -> true
--   empty                                               -> left null
-- Same for parent_applications. The rule matches isNothingAnswer() in
-- src/lib/medical.js.
--
-- Nothing else changes: medical_notes are untouched, and the new column is
-- not part of teacher verification (adding it would undo every sign-off).
--
-- Undo: alter table public.students drop column has_medical_condition;
--       alter table public.parent_applications drop column has_medical_condition;
-- (Only new columns are written, so no row backup is needed.)
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

alter table public.students            add column has_medical_condition boolean;
alter table public.parent_applications add column has_medical_condition boolean;

update public.students
set has_medical_condition = not (btrim(medical_notes) ~* '^(no|none|non|nil|nothing|n/?a|not applicable|no allergies|no allergy|no medical (issues?|conditions?)|no (conditions?|issues?))[[:space:].,!]*$')
where coalesce(btrim(medical_notes), '') <> '';

update public.parent_applications
set has_medical_condition = not (btrim(medical_notes) ~* '^(no|none|non|nil|nothing|n/?a|not applicable|no allergies|no allergy|no medical (issues?|conditions?)|no (conditions?|issues?))[[:space:].,!]*$')
where coalesce(btrim(medical_notes), '') <> '';

-- Expected (active students): yes 98 | no 55 | not recorded 706
select
  count(*) filter (where has_medical_condition)       as yes,
  count(*) filter (where not has_medical_condition)   as no,
  count(*) filter (where has_medical_condition is null) as not_recorded
from public.students where active;

commit;
