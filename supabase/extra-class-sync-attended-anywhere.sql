-- Extra classes (GCSE Punjabi, Gatka...) vs a student's main Punjabi group:
-- "attended anywhere = present in their main group".
--
-- Before: whatever the extra-class teacher marked was copied into the main
-- group's register and locked there - so a GCSE "Absent" overwrote a
-- Present the main-group teacher had marked, and a copied Absent stopped the
-- main-group teacher marking them Present.
--
-- Now, when the extra-class teacher marks a student:
--   * Present / Late    -> copied into the main group (locked), as before
--   * Absent / Holiday  -> copied only if the main group has no mark yet or
--                          only an earlier copy; never overwrites a mark the
--                          main-group teacher made. The app no longer locks a
--                          copied Absent/Holiday, so the main-group teacher
--                          can still mark them Present.
-- Removing the extra-class mark still removes only the copy (unchanged).
--
-- Also:
--   * get_main_group_marks(group, date) - for an extra-class register, which
--     of its students were marked in their main group that day and how
--     (so the GCSE teacher sees "Present in Santhiya Boys today"). Only for
--     that group's teachers, admins, adminView and registrars.
--   * Students can now be marked Holiday - the register always had the
--     button, but the database only accepted present/absent/late.
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

-- 1. Holiday for students ----------------------------------------------------
alter table public.attendance_records drop constraint if exists attendance_records_status_check;
alter table public.attendance_records add constraint attendance_records_status_check
  check (status = any (array['present', 'absent', 'late', 'holiday']));

-- 2. Copy rule -----------------------------------------------------------------
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

  if NEW.status in ('present', 'late') then
    -- Attended the extra class: that's their attendance for the day
    insert into attendance_records (session_id, student_id, group_id, session_date, status, synced_from_class_type)
    values (v_punjabi_session_id, NEW.student_id, v_punjabi_group_id, NEW.session_date, NEW.status, v_class_type)
    on conflict (session_id, student_id)
    do update set status = excluded.status, synced_from_class_type = excluded.synced_from_class_type;
  else
    -- Absent/Holiday in the extra class: never overwrite the main-group
    -- teacher's own mark, only fill a gap or update an earlier copy
    insert into attendance_records (session_id, student_id, group_id, session_date, status, synced_from_class_type)
    values (v_punjabi_session_id, NEW.student_id, v_punjabi_group_id, NEW.session_date, NEW.status, v_class_type)
    on conflict (session_id, student_id)
    do update set status = excluded.status, synced_from_class_type = excluded.synced_from_class_type
    where attendance_records.synced_from_class_type is not null;
  end if;

  return NEW;
end;
$$;

-- 3. Main-group marks for an extra-class register ---------------------------
create or replace function public.get_main_group_marks(p_group_id uuid, p_date date)
returns table (student_id uuid, main_group_name text, status text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (user_has_role('admin') or user_has_role('adminView') or user_has_role('registrar')
          or exists (select 1 from groups g where g.id = p_group_id and g.teacher_id = auth.uid())
          or exists (select 1 from teacher_groups tg where tg.group_id = p_group_id and tg.teacher_id = auth.uid())) then
    raise exception 'Unauthorized';
  end if;

  return query
  select st.id, mg.name, ar.status
  from student_classes sc
  join students st on st.id = sc.student_id
  join groups mg on mg.id = st.group_id and mg.id <> p_group_id
  join attendance_records ar
    on ar.student_id = st.id and ar.group_id = st.group_id and ar.session_date = p_date
   and ar.synced_from_class_type is null          -- marked by the main-group teacher
  where sc.group_id = p_group_id;
end;
$$;

revoke all on function public.get_main_group_marks(uuid, date) from public, anon;
grant execute on function public.get_main_group_marks(uuid, date) to authenticated;

commit;
