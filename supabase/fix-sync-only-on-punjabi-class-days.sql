-- Gatka runs Sundays; Punjabi only runs Fridays/Saturdays - they never
-- overlap. The original sync trigger didn't check this, so every Gatka
-- attendance record created a phantom Punjabi session+record on a Sunday,
-- a day Punjabi never meets. Confirmed directly: all 102 Gatka-synced
-- records landed on Sundays, creating 29 phantom Punjabi sessions (none of
-- them containing any other real attendance) - these would incorrectly
-- inflate the Class Days count and could show up as a "pending register"
-- for a day that was never a real class day to begin with.
--
-- GCSE Punjabi runs Fridays, which IS a Punjabi class day, so its sync is
-- correct and untouched - all 16 of its synced records already land on
-- Fridays.
-- Run in Supabase Dashboard → SQL Editor → New Query

-- 1. Fix the trigger: only sync onto a date that's actually one of
-- Punjabi's own class days (Friday=5, Saturday=6 - Postgres's EXTRACT(DOW)
-- uses the same 0=Sunday numbering as JS's Date.getDay(), matching
-- CLASS_META.punjabi.days in the app).
create or replace function public.sync_extra_class_attendance_to_punjabi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_type text;
  v_punjabi_group_id uuid;
  v_punjabi_session_id uuid;
begin
  select class_type into v_class_type from groups where id = NEW.group_id;
  if v_class_type is null or v_class_type = 'punjabi' then
    return NEW;
  end if;

  if extract(dow from NEW.session_date)::int not in (5, 6) then
    return NEW;
  end if;

  select group_id into v_punjabi_group_id from students where id = NEW.student_id;
  if v_punjabi_group_id is null or v_punjabi_group_id = NEW.group_id then
    return NEW;
  end if;

  insert into attendance_sessions (group_id, session_date)
  values (v_punjabi_group_id, NEW.session_date)
  on conflict (group_id, session_date) do update set group_id = excluded.group_id
  returning id into v_punjabi_session_id;

  insert into attendance_records (session_id, student_id, group_id, session_date, status, synced_from_class_type)
  values (v_punjabi_session_id, NEW.student_id, v_punjabi_group_id, NEW.session_date, NEW.status, v_class_type)
  on conflict (session_id, student_id)
  do update set status = excluded.status, synced_from_class_type = excluded.synced_from_class_type;

  return NEW;
end;
$$;

-- 2. Clean up the erroneous Gatka-Sunday phantom data created before this
-- fix. Deleting the sessions cascades to their attendance_records (FK is
-- ON DELETE CASCADE) - scoped to sessions that exclusively contain
-- gatka-synced records, so a session with any other real data is never
-- touched.
delete from attendance_sessions
where id in (
  select distinct ats.id
  from attendance_sessions ats
  join attendance_records ar on ar.session_id = ats.id
  where ar.synced_from_class_type = 'gatka'
)
and not exists (
  select 1 from attendance_records ar2
  where ar2.session_id = attendance_sessions.id
    and (ar2.synced_from_class_type is null or ar2.synced_from_class_type <> 'gatka')
);
