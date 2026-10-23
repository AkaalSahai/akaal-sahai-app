-- Tidy stray spaces in names, without breaking parent verifications, and
-- stop them coming back. Approved 23-10-2026.
--
-- 46 student names and 21 parent/guardian names had leading/trailing or
-- double spaces (mostly from the sign-up form, e.g. "Harpreet ").
--
-- 1. Projector "verified students" count: compare the four name fields
--    ignoring spacing (the app's src/lib/verification.js does the same), so
--    tidying a name doesn't count as "details changed since verified".
-- 2. tidy_person_names / tidy_user_name triggers: trim and collapse spaces in
--    students' first/middle/last/parent names and users.name on every insert
--    or update - covers every form, import and edge function.
-- 3. Tidy the existing names (the update fires the trigger).
--
-- Expected: verified students 113 before and after; 0 untidy names after.
-- Undo for 3: original values backed up in the scratchpad before running.
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

-- 1. Projector function - only the four name comparisons change
CREATE OR REPLACE FUNCTION public.get_projector_dashboard_stats()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result json;
  v_is_today boolean;
  v_target_date date;
begin
  if not (user_has_role('dashboard') or user_has_role('admin')) then
    raise exception 'Unauthorized';
  end if;

  v_is_today := extract(dow from current_date)::int in (5, 6);

  if v_is_today then
    v_target_date := current_date;
  else
    select max(ats.session_date) into v_target_date
    from attendance_sessions ats
    join groups gr on gr.id = ats.group_id
    where coalesce(gr.class_type, 'punjabi') = 'punjabi' and gr.active and ats.session_date < current_date;
  end if;

  select json_build_object(
    'is_today', v_is_today,
    'target_date', v_target_date,
    'groups', (
      select coalesce(json_agg(row_to_json(g)), '[]'::json) from (
        select
          gr.id,
          gr.name,
          (select count(*) from students s where s.group_id = gr.id and s.active = true) as total_students,
          (ats.id is not null) as started,
          (ats.submitted_at is not null) as submitted,
          coalesce(rec.present, 0) as present,
          coalesce(rec.late, 0) as late,
          coalesce(rec.absent, 0) as absent,
          coalesce(rec.holiday, 0) as holiday
        from groups gr
        left join attendance_sessions ats
          on ats.group_id = gr.id and ats.session_date = v_target_date and v_target_date is not null
        left join lateral (
          select
            count(*) filter (where ar.status = 'present') as present,
            count(*) filter (where ar.status = 'late')    as late,
            count(*) filter (where ar.status = 'absent')  as absent,
            count(*) filter (where ar.status = 'holiday') as holiday
          from attendance_records ar where ar.session_id = ats.id
        ) rec on true
        where coalesce(gr.class_type, 'punjabi') = 'punjabi' and gr.active
        order by gr.name
      ) g
    ),
    'top5', (
      select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
        with student_pct as (
          select
            ar.student_id,
            count(*) filter (where ar.status != 'holiday') as total,
            count(*) filter (where ar.status in ('present','late')) as attended
          from attendance_records ar
          group by ar.student_id
        ),
        high as (
          select student_id from student_pct
          where total >= 8 and (attended::numeric / total) >= 0.8
        )
        select gr.name, count(h.student_id) as high_count
        from groups gr
        join students s on s.group_id = gr.id and s.active = true
        join high h on h.student_id = s.id
        where coalesce(gr.class_type, 'punjabi') = 'punjabi' and gr.active
        group by gr.id, gr.name
        order by high_count desc
        limit 5
      ) t
    ),
    'recent', (
      select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
        select gr.name, ats.created_at
        from attendance_sessions ats
        join groups gr on gr.id = ats.group_id
        where ats.session_date = v_target_date and v_target_date is not null
          and coalesce(gr.class_type, 'punjabi') = 'punjabi' and gr.active
        order by ats.created_at desc
        limit 8
      ) r
    ),
    'class_day_number', (
      select count(distinct ats.session_date)
      from attendance_sessions ats
      join groups gr on gr.id = ats.group_id
      where coalesce(gr.class_type, 'punjabi') = 'punjabi' and gr.active and ats.session_date <= current_date
    ),
    'verified_students', (
      select json_build_object(
        'verified', count(*) filter (where
          lv.verified_at is not null
          and (vrs.value_clean is null or lv.verified_at >= vrs.value_clean::timestamptz)
          and lv.verified_at >= now() - interval '120 days'
          and btrim(regexp_replace(lv.snapshot->>'first_name', '\s+', ' ', 'g')) is not distinct from s.first_name
          and btrim(regexp_replace(lv.snapshot->>'middle_name', '\s+', ' ', 'g')) is not distinct from s.middle_name
          and btrim(regexp_replace(lv.snapshot->>'last_name', '\s+', ' ', 'g')) is not distinct from s.last_name
          and (lv.snapshot->>'date_of_birth')   is not distinct from s.date_of_birth::text
          and btrim(regexp_replace(lv.snapshot->>'parent_name', '\s+', ' ', 'g')) is not distinct from s.parent_name
          and (lv.snapshot->>'relationship')    is not distinct from s.relationship
          and (lv.snapshot->>'phone')           is not distinct from s.phone
          and (lv.snapshot->>'secondary_phone') is not distinct from s.secondary_phone
          and (lv.snapshot->>'email')           is not distinct from s.email
          and (lv.snapshot->>'house_no')        is not distinct from s.house_no
          and (lv.snapshot->>'street_name')     is not distinct from s.street_name
          and (lv.snapshot->>'town')            is not distinct from s.town
          and (lv.snapshot->>'postcode')        is not distinct from s.postcode
          and (lv.snapshot->>'medical_notes')   is not distinct from s.medical_notes
          and (lv.snapshot->>'photo_consent')   is not distinct from s.photo_consent::text
        ),
        'total', count(*)
      )
      from students s
      left join lateral (
        select sv.verified_at, sv.snapshot
        from student_verifications sv
        where sv.student_id = s.id
        order by sv.verified_at desc
        limit 1
      ) lv on true
      left join lateral (
        select nullif(ss.value, '') as value_clean
        from site_settings ss
        where ss.key = 'verification_required_since'
        limit 1
      ) vrs on true
      where s.active = true
    ),
    'server_time', now()
  ) into result;

  return result;
end;
$function$;

-- 2. Keep names tidy from now on --------------------------------------------
create or replace function public.tidy_person_names()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  NEW.first_name  := btrim(regexp_replace(NEW.first_name,  '\s+', ' ', 'g'));
  NEW.middle_name := btrim(regexp_replace(NEW.middle_name, '\s+', ' ', 'g'));
  NEW.last_name   := btrim(regexp_replace(NEW.last_name,   '\s+', ' ', 'g'));
  NEW.parent_name := btrim(regexp_replace(NEW.parent_name, '\s+', ' ', 'g'));
  return NEW;
end;
$$;

create trigger trg_tidy_person_names
  before insert or update of first_name, middle_name, last_name, parent_name on public.students
  for each row execute function public.tidy_person_names();

create or replace function public.tidy_user_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  NEW.name := btrim(regexp_replace(NEW.name, '\s+', ' ', 'g'));
  return NEW;
end;
$$;

create trigger trg_tidy_user_name
  before insert or update of name on public.users
  for each row execute function public.tidy_user_name();

-- 3. Tidy existing names ------------------------------------------------------
update public.students
set first_name = first_name, middle_name = middle_name, last_name = last_name, parent_name = parent_name
where first_name  is distinct from btrim(regexp_replace(first_name,  '\s+', ' ', 'g'))
   or middle_name is distinct from btrim(regexp_replace(middle_name, '\s+', ' ', 'g'))
   or last_name   is distinct from btrim(regexp_replace(last_name,   '\s+', ' ', 'g'))
   or parent_name is distinct from btrim(regexp_replace(parent_name, '\s+', ' ', 'g'));

-- Expected: 0
select count(*) as untidy_names_left from public.students
where first_name  is distinct from btrim(regexp_replace(first_name,  '\s+', ' ', 'g'))
   or middle_name is distinct from btrim(regexp_replace(middle_name, '\s+', ' ', 'g'))
   or last_name   is distinct from btrim(regexp_replace(last_name,   '\s+', ' ', 'g'))
   or parent_name is distinct from btrim(regexp_replace(parent_name, '\s+', ' ', 'g'));

commit;
