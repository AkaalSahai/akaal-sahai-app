-- Students in extra classes (Gatka, GCSE Punjabi, Kirtan, etc.) must already
-- be enrolled in a Punjabi class first. Previously, marking a student present
-- in an extra class had no effect on their home Punjabi register - the
-- Punjabi teacher would see them as absent/unmarked that day even though
-- they were genuinely at school. This mirrors their extra-class attendance
-- status onto their Punjabi group's register for the same day automatically,
-- and tags it as synced so the app can treat it as locked (the extra-class
-- attendance is the single source of truth for that day) rather than let it
-- be independently re-marked and drift out of sync.
-- Run in Supabase Dashboard → SQL Editor → New Query

alter table public.attendance_records add column if not exists synced_from_class_type text;

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
  -- Only mirror records marked in an extra class (not Punjabi itself, which
  -- would otherwise try to mirror onto itself).
  select class_type into v_class_type from groups where id = NEW.group_id;
  if v_class_type is null or v_class_type = 'punjabi' then
    return NEW;
  end if;

  select group_id into v_punjabi_group_id from students where id = NEW.student_id;
  if v_punjabi_group_id is null or v_punjabi_group_id = NEW.group_id then
    return NEW;
  end if;

  -- Atomic upsert rather than check-then-insert: attendance_sessions has a
  -- unique (group_id, session_date) constraint, and two students in the same
  -- extra class being marked around the same time would otherwise race to
  -- create the same Punjabi session, with one failing on a duplicate key.
  -- ON CONFLICT DO UPDATE (rather than DO NOTHING) guarantees the RETURNING
  -- clause always gives back the row's id, whether just inserted or already
  -- existing.
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

drop trigger if exists trg_sync_extra_class_attendance on public.attendance_records;
create trigger trg_sync_extra_class_attendance
after insert or update of status on public.attendance_records
for each row
execute function public.sync_extra_class_attendance_to_punjabi();

-- Clearing an extra-class status (the app deletes the record when a teacher
-- taps the active status to clear it) should un-sync the mirrored Punjabi
-- record too, but only the one this exact extra class created - never touch
-- a Punjabi record that was independently set another way.
create or replace function public.unsync_extra_class_attendance_from_punjabi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_type text;
  v_punjabi_group_id uuid;
begin
  select class_type into v_class_type from groups where id = OLD.group_id;
  if v_class_type is null or v_class_type = 'punjabi' then
    return OLD;
  end if;

  select group_id into v_punjabi_group_id from students where id = OLD.student_id;
  if v_punjabi_group_id is null or v_punjabi_group_id = OLD.group_id then
    return OLD;
  end if;

  delete from attendance_records
    where student_id = OLD.student_id
      and group_id = v_punjabi_group_id
      and session_date = OLD.session_date
      and synced_from_class_type = v_class_type;

  return OLD;
end;
$$;

drop trigger if exists trg_unsync_extra_class_attendance on public.attendance_records;
create trigger trg_unsync_extra_class_attendance
after delete on public.attendance_records
for each row
execute function public.unsync_extra_class_attendance_from_punjabi();

-- Backfill: re-trigger the sync for extra-class attendance already recorded
-- before this migration existed, so past class days are corrected too, not
-- just ones marked from now on. A same-value UPDATE still fires the "after
-- update of status" trigger above.
update public.attendance_records
set status = status
where group_id in (select id from public.groups where class_type is not null and class_type <> 'punjabi');
