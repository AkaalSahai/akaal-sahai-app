-- Teacher Register for Gatka (Sundays) and Kirtan (Wednesdays), agreed
-- 05-11-2026. Only teachers ticked for that class are on its register.
--
--   * users.register_classes - extra classes a teacher is on the register
--     for, e.g. {gatka} or {gatka,kirtan}. Punjabi (Fri/Sat) is everyone, as
--     now, so it isn't listed. Set by admins on the Users page; added to
--     protect_privileged_user_columns() so people can't tick themselves.
--   * teacher_attendance.class_type - which register a mark belongs to.
--     Every existing mark is Punjabi (the default fills them, which is what we
--     want here). One mark per teacher, date and class.
--   * mark_unmarked_staff_absent() and send_teacher_register_reminders() -
--     only look at Punjabi marks. Gatka/Kirtan are never auto-marked absent
--     (agreed: leave blank).
--   * Ticks Jaskaranjit Singh and Komal Kaur for Gatka (the teachers of the
--     Gatka groups).
--
-- No existing mark changes. Column and function names checked free.
--
-- Undo:
--   begin;
--   delete from teacher_attendance where class_type <> 'punjabi';
--   alter table teacher_attendance drop constraint teacher_attendance_teacher_date_class_key;
--   alter table teacher_attendance add constraint teacher_attendance_teacher_id_session_date_key unique (teacher_id, session_date);
--   alter table teacher_attendance drop column class_type;
--   alter table users drop column register_classes;
--   run previous-versions/{mark_unmarked_staff_absent,send_teacher_register_reminders,protect_privileged_user_columns}-before-20261105.sql
--   commit;
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

alter table public.users
  add column register_classes text[] not null default '{}';

alter table public.teacher_attendance
  add column class_type text not null default 'punjabi'
  check (class_type in ('punjabi', 'gatka', 'kirtan'));

alter table public.teacher_attendance
  drop constraint teacher_attendance_teacher_id_session_date_key;
alter table public.teacher_attendance
  add constraint teacher_attendance_teacher_date_class_key unique (teacher_id, session_date, class_type);

-- Gatka teachers to start with (agreed 05-11-2026). Before the
-- protection below, which would otherwise undo it - this script isn't an admin login.
update public.users set register_classes = array['gatka']
where id in ('b535801c-a0ca-4f00-86ed-c35555bfc366',   -- Jaskaranjit Singh
             '9b086050-6eaa-4f90-a325-86066815a963');  -- Komal Kaur

create or replace function public.protect_privileged_user_columns()
 returns trigger
 language plpgsql
as $function$
begin
  if not user_has_role('admin') then
    new.role := old.role;
    new.extra_roles := old.extra_roles;
    new.can_edit_students := old.can_edit_students;
    new.can_manage_teacher_register := old.can_manage_teacher_register;
    new.mfa_required := old.mfa_required;
    new.register_classes := old.register_classes;
  end if;
  return new;
end;
$function$;

create or replace function public.mark_unmarked_staff_absent()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_now   timestamp := now() at time zone 'Europe/London';
  v_today date      := v_now::date;
begin
  if extract(dow from v_today)::int not in (5, 6) then
    return;
  end if;
  if not (v_now::time >= '21:30' and v_now::time < '21:45') then
    return;
  end if;
  if not exists (
    select 1 from attendance_sessions ats
    join groups g on g.id = ats.group_id
    where ats.session_date = v_today and coalesce(g.class_type, 'punjabi') = 'punjabi'
  ) then
    return;
  end if;

  -- Punjabi register only - Gatka/Kirtan are left blank if not marked
  insert into teacher_attendance (teacher_id, session_date, status, notes, class_type)
  select u.id, v_today, 'absent', 'Auto: not marked by 21:30', 'punjabi'
  from users u
  where (u.role in ('teacher', 'registrar') or u.extra_roles && array['teacher', 'registrar'])
    and (u.created_at at time zone 'Europe/London')::date <= v_today
    and not exists (
      select 1 from teacher_attendance ta
      where ta.teacher_id = u.id and ta.session_date = v_today and ta.class_type = 'punjabi'
    )
  on conflict (teacher_id, session_date, class_type) do nothing;
end;
$function$;

create or replace function public.send_teacher_register_reminders()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_now      timestamp := now() at time zone 'Europe/London';
  v_today    date      := v_now::date;
  v_slot     text;
  v_total    int;
  v_unmarked int;
  v_message  text;
begin
  if extract(dow from v_today)::int not in (5, 6) then
    return;
  end if;

  -- Which reminder slot (if any) this 15-minute run falls in
  if v_now::time >= '19:30' and v_now::time < '19:45' then
    v_slot := '19:30';
  elsif v_now::time >= '20:45' and v_now::time < '21:00' then
    v_slot := '20:45';
  else
    return;
  end if;

  -- Only on actual class days
  if not exists (
    select 1 from attendance_sessions ats
    join groups g on g.id = ats.group_id
    where ats.session_date = v_today and coalesce(g.class_type, 'punjabi') = 'punjabi'
  ) then
    return;
  end if;

  -- Don't send the same slot twice
  if exists (
    select 1 from notifications
    where message like 'Teacher Register reminder (' || v_slot || ')%'
      and (created_at at time zone 'Europe/London')::date = v_today
  ) then
    return;
  end if;

  select count(*),
         count(*) filter (where not exists (
           select 1 from teacher_attendance ta
           where ta.teacher_id = u.id and ta.session_date = v_today and ta.class_type = 'punjabi'))
    into v_total, v_unmarked
  from users u
  where (u.role in ('teacher', 'registrar') or u.extra_roles && array['teacher', 'registrar'])
    and (u.created_at at time zone 'Europe/London')::date <= v_today;

  if v_unmarked = 0 then
    return;
  end if;

  v_message := 'Teacher Register reminder (' || v_slot || '): ' || v_unmarked || ' of ' || v_total
    || ' staff not marked yet today. Please complete the Teacher Register before the end of class.';

  insert into notifications (user_id, message)
  select u.id, v_message
  from users u
  where u.role in ('admin', 'registrar')
     or u.extra_roles && array['admin', 'registrar']
     or u.can_manage_teacher_register = true;
end;
$function$;

insert into audit_logs (user_id, user_name, action, detail, success)
values (null, 'Admin (database fix)', 'Set up Gatka and Kirtan teacher registers',
        'Added Gatka/Kirtan to the Teacher Register; ticked Jaskaranjit Singh and Komal Kaur for Gatka', true);

-- Expect: every existing mark is punjabi (1427 on 05-11-2026); 2 ticked for gatka
select (select count(*) from teacher_attendance) total_marks,
       (select count(*) from teacher_attendance where class_type = 'punjabi') punjabi_marks,
       (select string_agg(name, ', ' order by name) from users where 'gatka' = any(register_classes)) gatka_teachers;

commit;
