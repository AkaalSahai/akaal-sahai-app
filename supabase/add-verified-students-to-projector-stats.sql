-- Adds a "verified students" count to the projector dashboard, mirroring
-- the exact verification rule in src/lib/verification.js (getVerificationStatus):
-- a student counts as verified only if their latest student_verifications
-- row postdates any admin-set verification_required_since cutoff, its
-- snapshot still matches every current VERIFIED_FIELDS value, and it's
-- less than VERIFICATION_TERM_DAYS (120) old.
-- Run in Supabase Dashboard -> SQL Editor -> New Query

create or replace function public.get_projector_dashboard_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
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
          where total > 0 and (attended::numeric / total) >= 0.8
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
          and (lv.snapshot->>'first_name')      is not distinct from s.first_name
          and (lv.snapshot->>'middle_name')     is not distinct from s.middle_name
          and (lv.snapshot->>'last_name')       is not distinct from s.last_name
          and (lv.snapshot->>'date_of_birth')   is not distinct from s.date_of_birth::text
          and (lv.snapshot->>'parent_name')     is not distinct from s.parent_name
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
$$;
