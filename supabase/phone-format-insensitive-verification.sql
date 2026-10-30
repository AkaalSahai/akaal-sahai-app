-- Verification ignores phone FORMAT differences (projector count), to match
-- src/lib/verification.js. Needed before the admin one-click phone format
-- fix (e.g. 7700900123 -> +447700900123), so tidying a number doesn't undo
-- teachers' verifications - same idea as tidy-name-spacing.sql for names.
--
--   * normalize_uk_phone(text) - '+44' + 10 digits for anything that is
--     clearly a UK number (missing 0, 44 without +, 0044, spaces...), else
--     null. Mirrors normalizeUkPhone() in src/lib/studentChecks.js.
--   * same_uk_phone(a, b) - equal, or both normalise to the same number.
--   * get_projector_dashboard_stats() - only the phone and secondary_phone
--     comparisons change; everything else is the live definition as fetched.
--
-- Function names checked free before creating (supabase/README.md item 2).
-- Check: verified count before and after must match (no phone fixes yet).
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

create or replace function public.normalize_uk_phone(p text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  d text := regexp_replace(coalesce(p, ''), '[\s().-]', '', 'g');
begin
  if d like '+44%' then d := substr(d, 4);
  elsif d like '0044%' then d := substr(d, 5);
  elsif d like '44%' and length(d) = 12 then d := substr(d, 3);
  elsif d like '0%' and length(d) = 11 then d := substr(d, 2);
  end if;
  if d like '0%' and length(d) = 11 then d := substr(d, 2); end if;  -- "+4407..." typed with the 0
  return case when d ~ '^[1-9][0-9]{9}$' then '+44' || d end;
end;
$$;

create or replace function public.same_uk_phone(a text, b text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select a is not distinct from b
      or (public.normalize_uk_phone(a) is not null and public.normalize_uk_phone(a) = public.normalize_uk_phone(b))
$$;

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
          and public.same_uk_phone(lv.snapshot->>'phone', s.phone)
          and public.same_uk_phone(lv.snapshot->>'secondary_phone', s.secondary_phone)
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

commit;
