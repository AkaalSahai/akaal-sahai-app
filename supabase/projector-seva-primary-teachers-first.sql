-- Projector seva slide: show the group's primary teachers (30-10-2026).
--
--   * get_projector_seva() - primary_teacher_label() now comes first; the
--     teacher named on the rota (seva_rota.teacher_id) is only used when
--     the group has no primary teacher (e.g. Bhai Mokham Singh Ji Group).
--     Rota rows are not changed. Otherwise the definition from
--     allow-multiple-primary-teachers.sql.
--   * Tarnvir's account name "Tarnvir singh" -> "Tarnvir Singh"
--     (id c45664d6-a06c-4b3a-b3af-309e768d5378), so the slide shows
--     "Tarnvir S.".
--
-- Undo:
--   re-run the get_projector_seva part of allow-multiple-primary-teachers.sql
--   update users set name = 'Tarnvir singh' where id = 'c45664d6-a06c-4b3a-b3af-309e768d5378';
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

create or replace function public.get_projector_seva()
 returns json
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_dow   int  := extract(dow from v_today)::int;   -- 5 = Fri, 6 = Sat
  v_fri   date;
begin
  if not (user_has_role('dashboard') or user_has_role('admin')) then
    raise exception 'Unauthorized';
  end if;

  -- On a Friday/Saturday: next week's Fri/Sat. Otherwise: the coming Fri/Sat.
  if v_dow = 5 then v_fri := v_today + 7;
  elsif v_dow = 6 then v_fri := v_today + 6;
  else v_fri := v_today + ((5 - v_dow + 7) % 7);
  end if;

  return json_build_object(
    'today', v_today,
    'today_is_class_day', v_dow in (5, 6),
    'days', (
      select coalesce(json_agg(day order by (day->>'date')), '[]'::json) from (
        select json_build_object(
          'date', d.d,
          'groups', coalesce((
            select json_agg(json_build_object(
              'group', coalesce(g.name, r.group_label) || coalesce(' – ' || r.sub_label, ''),
              'teacher', coalesce(
                primary_teacher_label(g.id),
                (select u.name from users u where u.id = r.teacher_id))
            ) order by r.position)
            from seva_rota r left join groups g on g.id = r.group_id
            where r.seva_date = d.d), '[]'::json)
        ) as day
        from (select v_today as d where v_dow in (5, 6)
              union all select v_fri union all select v_fri + 1) d
      ) x
    )
  );
end;
$function$;

update users set name = 'Tarnvir Singh'
where id = 'c45664d6-a06c-4b3a-b3af-309e768d5378' and name = 'Tarnvir singh';

-- Expect: Tarnvir Singh
select name from users where id = 'c45664d6-a06c-4b3a-b3af-309e768d5378';

commit;
